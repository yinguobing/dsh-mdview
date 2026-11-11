// dsh-md-scroll-shot.mjs — 打开 sample.md 预览，滚到代码块/表格处截图。
import { execSync } from 'node:child_process'
import { chromium } from '/home/xiaobai/node_modules/playwright-core/index.mjs'

const out = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '/home/xiaobai/tmp/mdscroll'
const token = execSync(
  "journalctl --user -u dsh-web.service --since 'today' --no-pager | grep -o 'token=[A-Za-z0-9_-]*' | tail -1",
  { shell: '/bin/bash' },
).toString().trim().replace('token=', '')

const browser = await chromium.launch({
  executablePath:
    '/home/xiaobai/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell',
})
const dark = process.argv.includes('--dark')
const page = await browser.newPage({ viewport: { width: 1700, height: 1050 }, deviceScaleFactor: 1.5 })
if (dark) await page.emulateMedia({ colorScheme: 'dark' })
await page.goto(`http://10.10.10.2:3080/?token=${token}`, { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForTimeout(2000)
await page.getByText(/Markdown 插件/).first().click()
await page.waitForTimeout(3500)

// 会话长了以后消息是虚拟滚动的，先把消息列表滚到底再找 chip
async function openTarget() {
  for (let i = 0; i < 12; i += 1) {
    const done = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button,a,[role="link"]')].find((el) =>
        /2026-11-11\.md|README\.md/.test(el.textContent || ''),
      )
      if (!btn) return false
      btn.click()
      return true
    })
    if (done) return true
    await page.evaluate(() => {
      const candidates = [...document.querySelectorAll('div')].filter((el) => {
        const cs = getComputedStyle(el)
        return /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 200
      })
      const scroller = candidates.sort((a, b) => b.scrollHeight - a.scrollHeight)[0]
      if (scroller) scroller.scrollTop = scroller.scrollHeight
      else window.scrollTo(0, document.body.scrollHeight)
    })
    await page.waitForTimeout(700)
  }
  return false
}
console.log('点开目标:', await openTarget())
await page.waitForTimeout(4500)

// 找到滚动容器（.mdv 的祖先里 overflow 可滚的）
const info = await page.evaluate(() => {
  const mdv = document.querySelector('.mdv')
  if (!mdv) return { ok: false }
  let node = mdv.parentElement
  while (node) {
    const cs = getComputedStyle(node)
    if (/(auto|scroll)/.test(cs.overflowY) && node.scrollHeight > node.clientHeight + 10) break
    node = node.parentElement
  }
  const tableTop = mdv.querySelector('.mdv-table')?.getBoundingClientRect().top ?? 0
  const codeTop = mdv.querySelector('pre')?.getBoundingClientRect().top ?? 0
  return { ok: true, scroller: node ? node.className || node.tagName : null, tableTop, codeTop }
})
console.log('布局:', JSON.stringify(info))

await page.screenshot({ path: `${out}-top.png` })

// 滚到表格
await page.evaluate(() => {
  const mdv = document.querySelector('.mdv')
  const table = mdv?.querySelector('.mdv-table')
  if (!table) return
  table.scrollIntoView({ block: 'center' })
})
await page.waitForTimeout(800)
await page.screenshot({ path: `${out}-table.png` })

// 滚到代码块
await page.evaluate(() => {
  const pre = document.querySelector('.mdv pre')
  pre?.scrollIntoView({ block: 'center' })
})
await page.waitForTimeout(800)
await page.screenshot({ path: `${out}-code.png` })

const styles = await page.evaluate(() => {
  const el = document.querySelector('.mdv pre')
  const table = document.querySelector('.mdv .mdv-table table')
  const th = document.querySelector('.mdv th')
  const c = (e) => (e ? getComputedStyle(e) : null)
  const mdv = document.querySelector('.mdv')
  const rootCs = mdv ? getComputedStyle(mdv) : null
  return {
    theme: {
      colorScheme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
      ink: rootCs?.getPropertyValue('--mdv-ink')?.trim(),
      bodyBg: mdv ? c(mdv).backgroundColor : null,
      textColor: mdv ? c(mdv).color : null,
    },
    pre: el ? { bg: c(el).backgroundColor, fs: c(el).fontSize, pad: c(el).padding, radius: c(el).borderRadius } : null,
    table: table ? { width: table.getBoundingClientRect().width, fs: c(table).fontSize } : null,
    th: th ? { bg: c(th).backgroundColor, weight: c(th).fontWeight } : null,
  }
})
console.log('样式:', JSON.stringify(styles, null, 1))
await browser.close()
