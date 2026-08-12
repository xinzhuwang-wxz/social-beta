import { chromium } from 'playwright'
const BASE = 'http://localhost:3001', MAILPIT = 'http://127.0.0.1:54324'
async function link(email: string) {
  for (let i = 0; i < 40; i++) {
    const d: any = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(email)}`)).json()
    const id = d.messages?.[0]?.ID
    if (id) {
      const raw: any = await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json()
      const m = `${raw.Text ?? ''}\n${raw.HTML ?? ''}`.match(/https?:\/\/[^\s"'<>]+(?:verify|callback)[^\s"'<>]*/)
      if (m) return m[0].replace(/&amp;/g, '&')
    }
    await new Promise(r => setTimeout(r, 500))
  }
  throw new Error('no mail')
}
async function main() {
  const b = await chromium.launch()
  const p = await (await b.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true })).newPage()
  const email = `probe-${Date.now()}@test.local`
  await p.goto(`${BASE}/auth/login`); await p.fill('input[name="email"]', email); await p.click('button[type="submit"]')
  await p.goto(await link(email)); await p.waitForLoadState('networkidle').catch(()=>{})
  if (p.url().includes('/onboarding')) {
    await p.fill('input[name="handle"]', `pb${Date.now()}`.slice(0,16))
    await p.fill('input[name="displayName"]', '探针')
    await p.fill('input[name="campusId"]', 'pku')
    await p.click('form button[type="submit"]')
    await p.waitForURL(u => !u.pathname.includes('/onboarding'), { timeout: 30000 }).catch(()=>{})
  }
  await p.goto(`${BASE}/square`)
  const box = await p.$('textarea')
  await box!.fill('这周六想找人一起爬山，最好是野线，不赶时间')
  await p.click('form button[type="submit"]')
  await p.waitForLoadState('networkidle', { timeout: 120000 }).catch(()=>{})
  console.log('发布后 URL:', p.url())
  await p.goto(`${BASE}/candidates`); await p.waitForLoadState('networkidle').catch(()=>{})
  console.log('\n=== /candidates 文本 ===')
  console.log(((await p.textContent('body')) ?? '').replace(/\s+/g,' ').slice(0, 600))
  console.log('\n=== 链接 ===')
  console.log((await p.$$eval('a[href]', els => els.map(e => `${e.textContent?.trim().slice(0,30)} -> ${e.getAttribute('href')}`))).slice(0, 12).join('\n'))
  console.log('\n=== 按钮 ===')
  console.log((await p.$$eval('button', els => els.map(e => e.textContent?.trim().slice(0,30)))).slice(0, 12).join(' | '))
  await b.close()
}
void main()
