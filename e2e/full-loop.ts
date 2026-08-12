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
  /**
   * 每轮共享一个稀有地名。
   *
   * 前几轮里两个人的意图原文是写死的，于是每跑一次就在库里多留下一对
   * 逐字相同的意图。新一轮的候选和历史上所有旧候选向量距离完全打平，
   * 排序最终落到随机主键 —— 新候选常常挤不进投递的前六名，
   * 表现出来就是「候选没收到种子」，时好时坏。
   *
   * 让这一轮的两条意图共享一个别处不会出现的词，它们就互为唯一最近邻。
   */
  const SPOTS = ['箭扣', '海坨山', '云蒙山', '妙峰山', '鹫峰', '凤凰岭', '百花山', '灵山']
  const spot = `${SPOTS[Math.floor(Date.now() / 1000) % SPOTS.length]}${Date.now() % 997}`
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
    const mateOk = await publishIntent(mate.page, `周末想去${spot}那边爬野线，走没开发过的路，带相机`)
    record('候选种下了自己的意图', mateOk)

    await seeker.page.goto(`${BASE}/square`, { waitUntil: 'domcontentloaded' })
    const box = await seeker.page.$('textarea')
    record('发起人能找到发意图的输入框', Boolean(box))
    if (!box) return
    const fontOk = await box.evaluate((el) => parseFloat(getComputedStyle(el).fontSize) >= 16)
    record('输入框字号 ≥16px（否则 iOS 会缩放整页）', fontOk)
    const seekerOk = await publishIntent(seeker.page, `这周六想找人一起去${spot}爬野线，不赶时间`)
    record('意图种下并出现确认卡（AI 说「我理解成了」）', seekerOk)
    await shot(seeker.page, 'intent-published')
    if (!seekerOk) return

    // ── ③ 投递 ───────────────────────────────────────────────
    stage = '③ 投递与表态'
    await seeker.page.goto(`${BASE}/candidates`, { waitUntil: 'domcontentloaded' })
    // 可能要先选一条意图
    await clickText(seeker.page, new RegExp(spot), 4000)
    const dispatched = await clickText(seeker.page, /^发出去$/, 10_000)
    // 等界面自己说投出去了，别用 networkidle 判。
    //
    // deliverSeed 要跑完整条漏斗（向量召回 + 打分 + 模型终排），十几秒起步，
    // 而 networkidle 只要 500ms 没有网络活动就满足 —— 它会在漏斗中间的空档
    // 提前返回。脚本于是拿着一颗还没投出去的种子去查对方信箱，
    // 查到空的，然后把这判成「候选没收到」。真正的原因隔着两层。
    let dispatchText = ''
    for (let i = 0; i < 20; i++) {
      dispatchText = ((await seeker.page.textContent('body')) ?? '').replace(/\s+/g, ' ')
      if (/已经发给\s*\d+\s*个人|人愿意/.test(dispatchText)) break
      await seeker.page.waitForTimeout(3000)
      await seeker.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {})
    }
    const n = dispatchText.match(/已经发给\s*(\d+)\s*个人/)
    record('能把种子发出去', dispatched && Boolean(n), n ? `页面说：${n[0]}` : '界面上一直没确认投递完成')
    await shot(seeker.page, 'dispatched')

    // ── 候选收到并表态 ────────────────────────────────────────
    // 信箱重试三次。投递是发起人那侧的服务端动作，它跑完一整条匹配漏斗
    // （向量召回 + 打分 + 终排），候选这侧的页面可能比它先渲染。
    // 真实用户遇到这种情况会下拉刷新一下 —— 脚本也该这么做，
    // 而不是把「刚好没赶上」判成产品缺陷。
    let inboxText = ''
    for (let i = 0; i < 3; i++) {
      await mate.page.goto(`${BASE}/invites`, { waitUntil: 'domcontentloaded' })
      await mate.page.waitForLoadState('networkidle').catch(() => {})
      inboxText = (await mate.page.textContent('body')) ?? ''
      if (new RegExp(spot).test(inboxText)) break
      await mate.page.waitForTimeout(2500)
    }
    const gotSeed = new RegExp(spot).test(inboxText)
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
    // 用精确文案：卡片里有两个含「愿意」的按钮（直接答应 / 带一句话答应），
    // 宽松匹配 + .first() 看似没问题，但一旦顺序变了就会点错那个折叠起来的。
    const replied = await clickText(mate.page, /^愿意参与$/, 10_000)
    // 同样别用 networkidle 判 —— 表态走服务端动作 + revalidatePath，
    // 页面重渲染比 networkidle 晚。等界面自己说「已表示愿意」。
    let afterReply = ''
    for (let i = 0; i < 8; i++) {
      afterReply = ((await mate.page.textContent('body')) ?? '').replace(/\s+/g, ' ')
      if (/已表示愿意/.test(afterReply)) break
      await mate.page.waitForTimeout(1500)
      await mate.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {})
    }
    record(
      '候选能表态「愿意参与」',
      replied && /已表示愿意/.test(afterReply),
      replied ? afterReply.slice(0, 120) : '按钮点不到',
    )

    // ── ④ 发起人选人成局 ──────────────────────────────────────
    stage = '④ 成局'
    // 同上：候选表态之后，发起人这侧也要刷新才看得到。
    let opened = false
    let candText = ''
    for (let i = 0; i < 3 && !opened; i++) {
      await seeker.page.goto(`${BASE}/candidates`, { waitUntil: 'domcontentloaded' })
      await clickText(seeker.page, new RegExp(spot), 4000)
      await seeker.page.waitForLoadState('networkidle').catch(() => {})
      candText = ((await seeker.page.textContent('body')) ?? '').replace(/\s+/g, ' ')
      opened = await clickText(seeker.page, /选.*同行|选TA|选他|选她/, 6000)
      if (!opened) await seeker.page.waitForTimeout(2500)
    }
    record('发起人能在愿意的人里选', opened, opened ? '' : `页面上写着：${candText.slice(0, 700)}`)
    const openingBox = await seeker.page.$('textarea')
    record('第一句话是可编辑的输入框（红线：表述由真人决定）', Boolean(openingBox))
    if (openingBox) {
      await openingBox.fill('周六早上六点北宫门集合，怎么样？')
      await shot(seeker.page, 'opening-typed')
      // 用完整文案匹配。上一版写的是 /确认|发出|开始|成局/ ——
      // 「发出」同时命中页面上方那个「发出去」（投递按钮），
      // .first() 选中的是它：脚本又花钱投递了一次，却没有确认成局，
      // 而失败信息只说「没进池塘」。按钮文案有包含关系时，宽松的正则会骗人。
      await clickText(seeker.page, /选定TA，发出去/)
      await seeker.page
        .waitForURL((u) => u.pathname.includes('/pool/'), { timeout: 30_000 })
        .catch(() => {})
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
    const drafted = await clickText(seeker.page, /让 Agent 汇总一版/, 12_000)
    record('能让 AI 汇总一版计划草稿', drafted)
    if (drafted) {
      await shot(seeker.page, 'plan-draft')
      await clickText(seeker.page, /提交这张卡/, 10_000)
      let confirmedBy = 0
      for (const who of [seeker, mate]) {
        await who.page.goto(poolUrl, { waitUntil: 'domcontentloaded' })
        if (await clickText(who.page, /^我确认$/, 8000)) confirmedBy += 1
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
      if (await clickText(who.page, /^办完了$/, 8000)) finished += 1
    }
    record('双方各自确认完成', finished === 2, `${finished}/2`)
    await seeker.page.reload({ waitUntil: 'domcontentloaded' })
    await shot(seeker.page, 'completed')

    // ── ⑨ 回流与森林 ─────────────────────────────────────────
    stage = '⑨ 回流'
    // 「还想再约吗」是一组 radio（必选），不是按钮 —— 按 role 找。
    // 双方都要留反馈：任一方选「这次算了」，共同回忆就不进任何人的森林。
    let feedbackBy = 0
    for (const who of [seeker, mate]) {
      await who.page.goto(poolUrl, { waitUntil: 'domcontentloaded' })
      const yes = who.page.getByRole('radio', { name: '还想再约' }).first()
      const ok = await yes
        .waitFor({ state: 'visible', timeout: 8000 })
        .then(() => yes.check().then(() => true))
        .catch(() => false)
      if (ok && (await clickText(who.page, /留下反馈/, 8000))) feedbackBy += 1
    }
    record('双方都留下私密评价', feedbackBy === 2, `${feedbackBy}/2`)
    const feedbackDone = feedbackBy === 2
    // 封存：把这次的经历蒸馏成回忆与画像。这一步跑真实模型，慢。
    await seeker.page.goto(poolUrl, { waitUntil: 'domcontentloaded' })
    const sealed = await clickText(seeker.page, /写完了，存进记忆/, 10_000)
    record('能把这次经历存进记忆', sealed)

    let forest = ''
    for (let i = 0; i < 3; i++) {
      await seeker.page.goto(`${BASE}/me`, { waitUntil: 'domcontentloaded' })
      await seeker.page.waitForLoadState('networkidle').catch(() => {})
      forest = (await seeker.page.textContent('body')) ?? ''
      if (new RegExp(`${spot}|北宫门`).test(forest)) break
      await seeker.page.waitForTimeout(3000)
    }
    record(
      '森林里出现了这次的共同回忆',
      new RegExp(`${spot}|北宫门`).test(forest),
      forest.replace(/\s+/g, ' ').slice(0, 160),
    )
    await shot(seeker.page, 'forest')

    // 判据②：画像可溯源、可改可删
    const facetControls = await seeker.page.$$('button')
    const labels = await Promise.all(facetControls.map((b) => b.textContent()))
    const hasFacetControls = labels.some((t) => /删除|可见|只给自己|公开/.test(t ?? ''))
    record('画像可改可见度、可删除', hasFacetControls)

    // ── ⑩ next_hook 唤醒 → 再次成行 ──────────────────────────
    stage = '⑩ 唤醒再成行'
    await seeker.page.goto(poolUrl, { waitUntil: 'domcontentloaded' })
    const dormantText = ((await seeker.page.textContent('body')) ?? '').replace(/\s+/g, ' ')
    record(
      '休眠面板给出了下次的理由（next_hook）',
      /它睡着了，籽还在/.test(dormantText) && !/还没有具体的下次理由/.test(dormantText),
      dormantText.slice(dormantText.indexOf('它睡着了'), dormantText.indexOf('它睡着了') + 90),
    )
    await shot(seeker.page, 'dormant')

    const woke = await clickText(seeker.page, /再约一次|现在就再约/, 10_000)
    await seeker.page
      .waitForURL((u) => u.pathname.includes('/pool/') && !u.pathname.includes(poolUrl.split('/pool/')[1]!), {
        timeout: 30_000,
      })
      .catch(() => {})
    const derivedUrl = seeker.page.url()
    const isNewPool = woke && derivedUrl.includes('/pool/') && derivedUrl !== poolUrl
    record('唤醒派生出一个新池塘', isNewPool, derivedUrl.replace(BASE, ''))
    await shot(seeker.page, 'woken')

    if (isNewPool) {
      // 原成员带过来，但都是待确认 —— 上次一起玩过不代表这次一定有空
      await mate.page.goto(`${BASE}/invites`, { waitUntil: 'domcontentloaded' })
      let inviteText = ''
      let joined = false
      for (let i = 0; i < 3 && !joined; i++) {
        await mate.page.goto(`${BASE}/invites`, { waitUntil: 'domcontentloaded' })
        await mate.page.waitForLoadState('networkidle').catch(() => {})
        inviteText = ((await mate.page.textContent('body')) ?? '').replace(/\s+/g, ' ')
        joined = await clickText(mate.page, /^算我一个$/, 8000)
        if (!joined) await mate.page.waitForTimeout(2500)
      }
      record('对方收到的是待确认的邀请，不是被自动拉进去', joined, joined ? '' : inviteText.slice(0, 200))

      await seeker.page.goto(derivedUrl, { waitUntil: 'domcontentloaded' })
      const again = ((await seeker.page.textContent('body')) ?? '').replace(/\s+/g, ' ')
      // 「阿远 还没回应」也含「阿远」—— 要断言的是他真的进来了，
      // 所以反过来查那句「还没回应」不再出现。宽松的包含判断会把
      // 「他被邀请了」当成「他来了」。
      const bothIn = /阿远/.test(again) && !/阿远 还没回应/.test(again)
      record('再次成行：新池塘里两个人都在', bothIn, again.slice(0, 160))
      await shot(seeker.page, 'reformed')
    }
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
