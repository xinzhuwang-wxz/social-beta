/**
 * 完整闭环 —— 两个真实用户，只用界面，把九个阶段走一遍。
 *
 * 判据①要的就是这条：不填任何资料，跑完
 * 发意图 → 投递 → 表态 → 选人成局 → 协作 → 计划确认 → 完成确认 →
 * 回流 → next_hook 唤醒 → 再次成行。
 *
 * 铁律（违反了这个脚本就失去意义）：
 *   · 不查数据库、不调引擎、不读源码常量
 *   · 不伪造会话，登录走真实魔法链接
 *   · 找元素靠人眼看得到的文字，不靠 data-testid ——
 *     测试专用钩子会让「界面上找得到」这件事失真
 *
 *   pnpm tsx e2e/full-loop.ts [--base=http://localhost:3000] [--headed]
 */

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=')
    return [k!, v ?? 'true'] as const
  }),
)

const BASE = args.get('base') ?? 'http://localhost:3000'
const MAILPIT = args.get('mailpit') ?? 'http://127.0.0.1:54324'
const HEADED = args.has('headed')
const SHOTS = join(process.cwd(), 'e2e/shots/full-loop')
const VIEWPORT = { width: 375, height: 812 }

interface Step {
  stage: string
  name: string
  ok: boolean
  detail: string
}

const steps: Step[] = []
let stage = '准备'
let shotIndex = 0
/** AI 代答次数。任何一条真人消息署名不是本人，这一项就非零，整轮不通过。 */
let aiSpokeForHuman = 0

function say(s: string) {
  console.log(s)
}

function record(name: string, ok: boolean, detail = '') {
  steps.push({ stage, name, ok, detail })
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` —— ${detail}` : ''}`)
}

async function shot(page: Page, label: string) {
  shotIndex += 1
  await page
    .screenshot({ path: join(SHOTS, `${String(shotIndex).padStart(2, '0')}-${label}.png`), fullPage: true })
    .catch(() => {})
}

async function magicLinkFor(email: string): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(email)}`)
    const data = (await res.json()) as { messages?: { ID: string }[] }
    const id = data.messages?.[0]?.ID
    if (id) {
      const raw = (await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json()) as {
        Text?: string
        HTML?: string
      }
      const body = `${raw.Text ?? ''}\n${raw.HTML ?? ''}`
      const m = body.match(/https?:\/\/[^\s"'<>]+(?:verify|callback)[^\s"'<>]*/)
      if (m) return m[0].replace(/&amp;/g, '&')
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`Mailpit 里没等到给 ${email} 的登录邮件`)
}

/** 造一个真实用户：魔法链接登录 + 建档。不填任何资料字段。 */
async function makeUser(
  browser: Browser,
  label: string,
  name: string,
): Promise<{ ctx: BrowserContext; page: Page; email: string }> {
  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    locale: 'zh-CN',
  })
  const page = await ctx.newPage()
  const email = `${label}-${Date.now()}@test.local`

  await page.goto(`${BASE}/auth/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[name="email"]', email)
  await page.click('button[type="submit"]')
  await page.goto(await magicLinkFor(email), { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle').catch(() => {})

  if (page.url().includes('/onboarding')) {
    const handle = `${label}${Date.now()}`.replace(/[^a-z0-9]/g, '').slice(0, 16)
    if (await page.$('input[name="handle"]')) await page.fill('input[name="handle"]', handle)
    if (await page.$('input[name="displayName"]')) await page.fill('input[name="displayName"]', name)
    const campus = await page.$('select[name="campusId"], input[name="campusId"]')
    if (campus) {
      const tag = await campus.evaluate((e) => e.tagName.toLowerCase())
      if (tag === 'select') await campus.selectOption({ index: 1 }).catch(() => {})
      else await page.fill('input[name="campusId"]', 'pku')
    }
    await page.click('button[type="submit"]')
    await page.waitForLoadState('networkidle').catch(() => {})
  }
  return { ctx, page, email }
}

/** 点一个按钮/链接，按可见文字找。找不到返回 false，不抛 —— 让调用方决定这算不算失败。 */
async function clickText(page: Page, text: string | RegExp, timeout = 8000): Promise<boolean> {
  const target = page
    .getByRole('button', { name: text })
    .or(page.getByRole('link', { name: text }))
    .first()
  try {
    await target.waitFor({ state: 'visible', timeout })
    await target.click()
    await page.waitForLoadState('networkidle', { timeout: 120_000 }).catch(() => {})
    return true
  } catch {
    return false
  }
}

/**
 * 发一条意图，走完整个三态流程。
 *
 * 发布不是一次提交：输入 →（AI 追问一轮，最多三题、可整轮跳过）→
 * 「我理解成了……」确认卡。追问那一屏上「种下去」和「跳过，直接种」
 * 是同一个 action，点哪个都行。
 *
 * 第一版脚本只点了第一个提交按钮，停在追问屏上就走了，于是意图从没落库，
 * 后面所有步骤都在一个不存在的种子上打转 —— 而失败信息指向的是
 * 「页面上找不到『发出去』」，离真正的原因隔着两层。
 */
async function publishIntent(page: Page, text: string): Promise<boolean> {
  await page.goto(`${BASE}/square`, { waitUntil: 'domcontentloaded' })
  const box = await page.$('textarea')
  if (!box) return false
  await box.fill(text)
  await page.click('form button[type="submit"]')
  await page.waitForLoadState('networkidle', { timeout: 120_000 }).catch(() => {})

  // 追问屏：点「跳过，直接种」或「种下去」把它走完
  for (let i = 0; i < 3; i++) {
    const body = (await page.textContent('body')) ?? ''
    if (body.includes('种下了')) return true
    const advanced =
      (await clickText(page, /跳过，直接种/, 3000)) || (await clickText(page, /^种下去$/, 3000))
    if (!advanced) break
  }
  return ((await page.textContent('body')) ?? '').includes('种下了')
}

async function pageHasError(page: Page): Promise<string | null> {
  const body = (await page.textContent('body')) ?? ''
  const m = body.match(/Application error|Unhandled Runtime Error|TypeError|\[object Object\]/)
  return m ? m[0] : null
}

async function main() {
  mkdirSync(SHOTS, { recursive: true })
  const browser = await chromium.launch({ headless: !HEADED })
  let seeker: Awaited<ReturnType<typeof makeUser>> | null = null
  let mate: Awaited<ReturnType<typeof makeUser>> | null = null

  try {
    say(`\n完整闭环｜手机视口 ${VIEWPORT.width}×${VIEWPORT.height}｜${BASE}\n`)

    // ── ① 两个真实用户，不填任何资料 ──────────────────────────
    stage = '① 建档'
    seeker = await makeUser(browser, 'seeker', '小林')
    mate = await makeUser(browser, 'mate', '阿远')
    const bothIn =
      !seeker.page.url().includes('/auth/login') && !mate.page.url().includes('/auth/login')
    record('两个用户都登录并建档', bothIn, bothIn ? '' : '登录没走通，后面验不了')
    if (!bothIn) return
    await shot(seeker.page, 'seeker-home')

    // 候选也要有一条自己的意图，否则匹配无从下手
    stage = '② 种下种子'
    const mateOk = await publishIntent(mate.page, '周末想找人一起去爬山，走没开发过的野路线，带相机')
    record('候选种下了自己的意图', mateOk)

    await seeker.page.goto(`${BASE}/square`, { waitUntil: 'domcontentloaded' })
    const box = await seeker.page.$('textarea')
    record('发起人能找到发意图的输入框', Boolean(box))
    if (!box) return
    const fontOk = await box.evaluate((el) => parseFloat(getComputedStyle(el).fontSize) >= 16)
    record('输入框字号 ≥16px（否则 iOS 会缩放整页）', fontOk)
    const seekerOk = await publishIntent(seeker.page, '这周六想找人一起爬山，最好是野线，不赶时间')
    record('意图种下并出现确认卡（AI 说「我理解成了」）', seekerOk)
    await shot(seeker.page, 'intent-published')
    if (!seekerOk) return

    // ── ③ 投递 ───────────────────────────────────────────────
    stage = '③ 投递与表态'
    await seeker.page.goto(`${BASE}/candidates`, { waitUntil: 'domcontentloaded' })
    // 可能要先选一条意图
    await clickText(seeker.page, /爬山/, 4000)
    const dispatched = await clickText(seeker.page, /发出去|投递/, 10_000)
    const dispatchText = ((await seeker.page.textContent('body')) ?? '').replace(/\s+/g, ' ')
    const n = dispatchText.match(/发给了?\s*(\d+)\s*个?人|投递给\s*(\d+)/)
    record('能把种子发出去', dispatched, n ? `页面说：${n[0]}` : '')
    await shot(seeker.page, 'dispatched')

    // ── 候选收到并表态 ────────────────────────────────────────
    await mate.page.goto(`${BASE}/invites`, { waitUntil: 'domcontentloaded' })
    const inboxText = (await mate.page.textContent('body')) ?? ''
    const gotSeed = /爬山|野线/.test(inboxText)
    // 失败时把信箱上的文字摘一段出来 —— 只说「没看到」等于没说，
    // 排查的人还得自己再跑一遍去看屏幕
    record(
      '候选在信箱里看到了这颗种子',
      gotSeed,
      gotSeed ? '' : `信箱上写着：${inboxText.replace(/\s+/g, ' ').slice(0, 200)}`,
    )
    // 红线：候选不该看到推荐理由与打分
    const leaked = /推荐理由|匹配度|得分|排名|第\s*\d+\s*名/.test(inboxText)
    record('信箱里没有理由/打分/排名', !leaked, leaked ? '候选看到了不该看到的东西' : '')
    await shot(mate.page, 'inbox')
    const replied = await clickText(mate.page, /愿意/, 8000)
    record('候选能表态「愿意参与」', replied)

    // ── ④ 发起人选人成局 ──────────────────────────────────────
    stage = '④ 成局'
    await seeker.page.goto(`${BASE}/candidates`, { waitUntil: 'domcontentloaded' })
    await clickText(seeker.page, /爬山/, 4000)
    const opened = await clickText(seeker.page, /选.*同行|选TA|选他|选她/, 8000)
    record('发起人能在愿意的人里选', opened)
    const openingBox = await seeker.page.$('textarea')
    record('第一句话是可编辑的输入框（红线：表述由真人决定）', Boolean(openingBox))
    if (openingBox) {
      await openingBox.fill('周六早上六点北宫门集合，怎么样？')
      await shot(seeker.page, 'opening-typed')
      await clickText(seeker.page, /确认|发出|开始|成局/)
    }
    const inPool = seeker.page.url().includes('/pool/')
    record('成局后进入池塘', inPool, seeker.page.url().replace(BASE, ''))
    if (!inPool) return
    const poolUrl = seeker.page.url()
    await shot(seeker.page, 'pool-formed')

    // ── ⑤ 协作 ───────────────────────────────────────────────
    stage = '⑤ 协作'
    await mate.page.goto(poolUrl, { waitUntil: 'domcontentloaded' })
    const mateSees = !(await pageHasError(mate.page)) && mate.page.url().includes('/pool/')
    record('候选也能进这个池塘', mateSees)

    for (const [who, text] of [
      [mate, '六点有点早，七点行吗？我带路'],
      [seeker, '七点可以，那就北宫门见'],
    ] as const) {
      const input = await who.page.$('textarea')
      if (input) {
        await input.fill(text)
        await clickText(who.page, /发送|说一句|发出/)
      }
    }
    await seeker.page.reload({ waitUntil: 'domcontentloaded' })
    const timeline = (await seeker.page.textContent('body')) ?? ''
    record('两个人的消息都在时间线上', /七点/.test(timeline))
    await shot(seeker.page, 'chat')

    // 红线④：AI 不能代替真人说话。
    // 判据是页面上每条「谁说的」标注 —— 真人消息署真人名，AI 的内容必须
    // 明确标成 AI/精灵。若出现一条署了真人名却不是他发的，这里抓不到，
    // 但页面上出现「AI 代 XX 回复」这类字样就是明确违规。
    if (/代你回复|代为回复|AI 替你|自动回复了/.test(timeline)) aiSpokeForHuman += 1
    record('没有 AI 代答', aiSpokeForHuman === 0)

    // ── ⑥ 计划 → 花苞 ────────────────────────────────────────
    stage = '⑥ 计划'
    const drafted = await clickText(seeker.page, /汇总|草拟|生成计划|整理/, 8000)
    record('能让 AI 汇总一版计划草稿', drafted)
    if (drafted) {
      await shot(seeker.page, 'plan-draft')
      await clickText(seeker.page, /提交|确定这版/)
      let confirmedBy = 0
      for (const who of [seeker, mate]) {
        await who.page.goto(poolUrl, { waitUntil: 'domcontentloaded' })
        if (await clickText(who.page, /确认/, 6000)) confirmedBy += 1
      }
      record('双方各自确认计划', confirmedBy === 2, `${confirmedBy}/2`)
      await seeker.page.reload({ waitUntil: 'domcontentloaded' })
      await shot(seeker.page, 'plan-confirmed')
    }

    // ── ⑧ 完成确认 ───────────────────────────────────────────
    stage = '⑦⑧ 完成'
    let finished = 0
    for (const who of [seeker, mate]) {
      await who.page.goto(poolUrl, { waitUntil: 'domcontentloaded' })
      if (await clickText(who.page, /已完成|完成了|我们做完了/, 6000)) finished += 1
    }
    record('双方各自确认完成', finished === 2, `${finished}/2`)
    await seeker.page.reload({ waitUntil: 'domcontentloaded' })
    await shot(seeker.page, 'completed')

    // ── ⑨ 回流与森林 ─────────────────────────────────────────
    stage = '⑨ 回流'
    const feedbackDone = await clickText(seeker.page, /愿意再|还想再|再次组队/, 6000)
    record('能给出私密评价', feedbackDone)
    await clickText(seeker.page, /存进记忆|封存|写完了/, 6000)
    await seeker.page.goto(`${BASE}/me`, { waitUntil: 'domcontentloaded' })
    const forest = (await seeker.page.textContent('body')) ?? ''
    record('森林里出现了这次的共同回忆', /爬山|野线|北宫门/.test(forest))
    await shot(seeker.page, 'forest')

    // 判据②：画像可溯源、可改可删
    const facetControls = await seeker.page.$$('button')
    const labels = await Promise.all(facetControls.map((b) => b.textContent()))
    const hasFacetControls = labels.some((t) => /删除|可见|只给自己|公开/.test(t ?? ''))
    record('画像可改可见度、可删除', hasFacetControls)
  } catch (err) {
    record('脚本执行', false, err instanceof Error ? err.message : String(err))
  } finally {
    const passed = steps.filter((s) => s.ok).length
    writeFileSync(
      join(SHOTS, 'report.json'),
      JSON.stringify({ base: BASE, viewport: VIEWPORT, aiSpokeForHuman, passed, total: steps.length, steps }, null, 2),
    )
    say(`\n${passed}/${steps.length} 通过　AI 代答 ${aiSpokeForHuman} 次　截图在 ${SHOTS}\n`)
    if (aiSpokeForHuman > 0) say('AI 代答次数非零 —— 整轮不通过。\n')
    await browser.close()
    process.exit(passed === steps.length && aiSpokeForHuman === 0 ? 0 : 1)
  }
}

void main()
