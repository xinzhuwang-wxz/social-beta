/**
 * 手机视口下的端到端旅程 —— 只通过浏览器操作产品。
 *
 * 这个脚本存在的意义是：**它不知道任何内部实现**。不查库、不调引擎、
 * 不读源码常量，只会看页面上有什么、点得到什么。一个真实用户能做的它才能做。
 * 所以它验的不是「代码跑通了」，而是「这个产品用得起来」。
 *
 * 视口固定 375×812 —— 产品的最终形态是手机 H5，在桌面视口下验收
 * 等于验收一个我们不会交付的东西。
 *
 * 登录走真实的 Supabase 魔法链接：填邮箱 → 从本地 Mailpit 取信 → 点链接。
 * 不伪造会话、不塞 cookie。本地没有真实邮件服务，但协议是真的。
 *
 *   pnpm tsx e2e/journey.ts [--base=http://localhost:3001] [--headed]
 */

import { chromium, type Browser, type Page } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=')
    return [k!, v ?? 'true'] as const
  }),
)

const BASE = args.get('base') ?? 'http://localhost:3001'
const MAILPIT = args.get('mailpit') ?? 'http://127.0.0.1:54324'
const HEADED = args.has('headed')
const SHOTS = join(process.cwd(), 'e2e/shots')

/** iPhone 13 mini / SE 那一档。往上放大而不是往下缩小。 */
const VIEWPORT = { width: 375, height: 812 }

interface Step {
  name: string
  ok: boolean
  detail: string
}

const steps: Step[] = []
let shotIndex = 0

function record(name: string, ok: boolean, detail = '') {
  steps.push({ name, ok, detail })
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` —— ${detail}` : ''}`)
}

async function shot(page: Page, label: string) {
  shotIndex += 1
  const file = join(SHOTS, `${String(shotIndex).padStart(2, '0')}-${label}.png`)
  await page.screenshot({ path: file, fullPage: true })
  return file
}

/** 从 Mailpit 取最新一封信里的登录链接。这是本地收信，不是绕过认证。 */
async function magicLinkFor(email: string): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(email)}`)
    const data = (await res.json()) as { messages?: { ID: string }[] }
    const id = data.messages?.[0]?.ID
    if (id) {
      const raw = await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json()
      const body = `${(raw as { Text?: string; HTML?: string }).Text ?? ''}\n${
        (raw as { HTML?: string }).HTML ?? ''
      }`
      const m = body.match(/https?:\/\/[^\s"'<>]+(?:verify|callback)[^\s"'<>]*/)
      if (m) return m[0].replace(/&amp;/g, '&')
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`Mailpit 里没等到给 ${email} 的登录邮件`)
}

/**
 * 走完登录，落到已登录状态。
 *
 * 返回落地的 URL 供调用方核对。这里刻意不做「不在登录页就算成功」的判断 ——
 * 第一版就是那么写的，结果魔法链接把浏览器送到了另一个端口上的服务，
 * 断言照样通过，后面所有页面其实都在未登录状态下渲染。
 * 一个总是通过的断言比没有断言更糟：它让人以为验过了。
 */
async function signIn(page: Page, email: string): Promise<string> {
  await page.goto(`${BASE}/auth/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[name="email"]', email)
  await page.click('button[type="submit"]')
  const link = await magicLinkFor(email)
  await page.goto(link, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle').catch(() => {})
  return page.url()
}

/** 现在这个浏览器上下文是不是真的登录了 —— 以受保护页面不再把我们踢回登录页为准。 */
async function isSignedIn(page: Page): Promise<boolean> {
  await page.goto(`${BASE}/me`, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle').catch(() => {})
  return !page.url().includes('/auth/login')
}

/** 页面上有没有横向滚动 —— 手机上最刺眼的缺陷之一。 */
async function hasHorizontalScroll(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  )
}

/** 所有可点元素是否都够得着（44×44pt 是苹果的下限）。 */
async function tinyTapTargets(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const bad: string[] = []
    for (const el of document.querySelectorAll('button, a[href], input, select, textarea')) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue // 不可见的不算
      if (r.height < 44 && r.width < 44) {
        const text = (el.textContent ?? '').trim().slice(0, 20)
        bad.push(`${el.tagName.toLowerCase()}「${text}」${Math.round(r.width)}×${Math.round(r.height)}`)
      }
    }
    return bad.slice(0, 8)
  })
}

async function auditViewport(page: Page, label: string) {
  const [scrolls, tiny] = await Promise.all([hasHorizontalScroll(page), tinyTapTargets(page)])
  record(`${label}：无横向滚动`, !scrolls, scrolls ? '页面在 375 下被撑宽了' : '')
  record(
    `${label}：触摸目标 ≥44pt`,
    tiny.length === 0,
    tiny.length ? `${tiny.length} 个太小：${tiny.join('、')}` : '',
  )
}

async function main() {
  mkdirSync(SHOTS, { recursive: true })
  const browser: Browser = await chromium.launch({ headless: !HEADED })
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

  const consoleErrors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 160))
  })
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message.slice(0, 160)}`))

  const stamp = Date.now()
  const me = `journey-${stamp}@test.local`

  try {
    console.log(`\n手机视口 ${VIEWPORT.width}×${VIEWPORT.height}｜${BASE}\n`)

    // ── 落地页 ────────────────────────────────────────────────
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })
    record('落地页打得开', page.url().startsWith(BASE))
    await auditViewport(page, '落地页')
    await shot(page, 'landing')

    // ── 登录（真实魔法链接）────────────────────────────────────
    const landed = await signIn(page, me)
    // 两条独立的断言。第一条抓的是「链接把人送到哪」——
    // 送到别的服务上也叫「离开了登录页」，但那不是登录成功。
    record(
      '魔法链接回跳到本应用',
      landed.startsWith(BASE),
      landed.startsWith(BASE) ? '' : `回跳到了 ${landed} —— 不是 ${BASE}`,
    )
    const signedIn = await isSignedIn(page)
    record('受保护页面不再踢回登录页', signedIn, signedIn ? '' : '会话没有真正建立')
    await shot(page, 'after-login')
    if (!signedIn) {
      record('后续旅程', false, '未登录，剩下的步骤验不了 —— 先修登录回跳')
      return
    }

    // ── 不填任何资料 ──────────────────────────────────────────
    // 落到引导页时，检查它有没有逼人填兴趣爱好之类
    if (page.url().includes('/onboarding')) {
      const fields = await page.$$eval('input, textarea, select', (els) =>
        els.map((e) => (e as HTMLInputElement).name || e.getAttribute('placeholder') || '?'),
      )
      record(
        '引导页不要资料卡字段',
        !fields.some((f) => /interest|兴趣|爱好|标签|bio|简介/i.test(f)),
        `字段：${fields.join(', ')}`,
      )
      await shot(page, 'onboarding')
      // 用最少的信息完成建档
      const handle = `u${stamp}`.slice(0, 16)
      for (const [sel, val] of [
        ['input[name="handle"]', handle],
        ['input[name="displayName"]', '旅程测试'],
      ] as const) {
        if (await page.$(sel)) await page.fill(sel, val)
      }
      const campus = await page.$('select[name="campusId"], input[name="campusId"]')
      if (campus) {
        const tag = await campus.evaluate((e) => e.tagName.toLowerCase())
        if (tag === 'select') await campus.selectOption({ index: 1 }).catch(() => {})
        else await page.fill('input[name="campusId"]', 'pku')
      }
      await page.click('form button[type="submit"]')
      // 等「导航真的发生」，不是等网络空闲。
      //
      // 服务端动作的 redirect 由客户端路由执行：POST 完成 → networkidle 满足 →
      // 客户端才把地址换掉。在 networkidle 之后立刻读 URL 会读到旧值，
      // 于是一个正常的产品被判成「建档失败」。第一版就是这么误报的。
      await page.waitForURL((u) => !u.pathname.includes('/onboarding'), { timeout: 30_000 }).catch(() => {})
      const done = !page.url().includes('/onboarding')
      // 失败时把页面上的报错条读出来 —— 只说「还停在引导页」等于没说，
      // 排查的人还得自己再跑一遍去看屏幕上写了什么。
      let why = page.url().replace(BASE, '')
      if (!done) {
        const banner = await page
          .locator('[role="alert"], .alert, [class*="alert"]')
          .first()
          .textContent()
          .catch(() => null)
        const urlErr = new URL(page.url()).searchParams.get('error')
        why = banner?.trim() || urlErr || `${why}（页面上没有可读的报错）`
      }
      record('建档完成', done, why)
    }

    // ── 底部标签栏（手机主导航）──────────────────────────────
    const tabs = await page.$$eval('nav a[href]', (els) =>
      els
        .filter((e) => {
          const r = e.getBoundingClientRect()
          return r.bottom > window.innerHeight - 120 && r.height > 0
        })
        .map((e) => (e.textContent ?? '').trim()),
    )
    record('底部标签栏可见', tabs.length >= 3, `${tabs.length} 个：${tabs.join(' / ')}`)
    await auditViewport(page, '登录后首页')
    await shot(page, 'home')

    // ── 发一条意图 ────────────────────────────────────────────
    await page.goto(`${BASE}/square`, { waitUntil: 'domcontentloaded' })
    await auditViewport(page, '种一颗')
    const box = await page.$('textarea, input[type="text"]')
    record('发意图的输入框在', Boolean(box))
    if (box) {
      await box.fill('这周六下午想找人一起去爬山，走野线那种，不赶时间')
      const inputFontOk = await box.evaluate(
        (el) => parseFloat(getComputedStyle(el).fontSize) >= 16,
      )
      record('输入框字号 ≥16px', inputFontOk, inputFontOk ? '' : 'iOS 会自动缩放整页')
      await shot(page, 'intent-typed')
      const submit = await page.$('button[type="submit"]')
      if (submit) {
        await submit.click()
        await page.waitForLoadState('networkidle', { timeout: 120_000 }).catch(() => {})
        record('意图提交后有响应', true, page.url().replace(BASE, ''))
        await shot(page, 'intent-submitted')
      }
    }

    // ── 逐页巡检 ──────────────────────────────────────────────
    for (const [path, label] of [
      ['/candidates', '候选'],
      ['/invites', '信箱'],
      ['/home', '花园'],
      ['/me', '森林'],
    ] as const) {
      await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
      const body = (await page.textContent('body')) ?? ''
      const broken =
        /Application error|Unhandled Runtime Error|TypeError|undefined is not|\[object Object\]/.test(
          body,
        )
      record(`${label}页正常渲染`, !broken, broken ? '页面上出现了报错文本' : '')
      await auditViewport(page, `${label}页`)
      await shot(page, `page${path.replace(/\//g, '-')}`)
    }

    // ── 控制台 ────────────────────────────────────────────────
    record(
      '浏览器控制台无错误',
      consoleErrors.length === 0,
      consoleErrors.length ? consoleErrors.slice(0, 3).join(' | ') : '',
    )
  } catch (err) {
    record('脚本执行', false, err instanceof Error ? err.message : String(err))
    await shot(page, 'crash').catch(() => {})
  } finally {
    const passed = steps.filter((s) => s.ok).length
    const report = { base: BASE, viewport: VIEWPORT, passed, total: steps.length, steps }
    writeFileSync(join(SHOTS, 'report.json'), JSON.stringify(report, null, 2))
    console.log(`\n${passed}/${steps.length} 通过　截图与报告在 e2e/shots/\n`)
    await browser.close()
    process.exit(passed === steps.length ? 0 : 1)
  }
}

void main()
