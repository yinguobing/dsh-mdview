// dsh-inspect-mdv.mjs — 检查真实页面里 .mdv 内部元素的计算样式，找样式串味。
import { execSync } from 'node:child_process'
import { chromium } from '/home/xiaobai/node_modules/playwright-core/index.mjs'

const token = execSync(
  "journalctl --user -u dsh-web.service --since 'today' --no-pager | grep -o 'token=[A-Za-z0-9_-]*' | tail -1",
  { shell: '/bin/bash' },
).toString().trim().replace('token=', '')

const browser = await chromium.launch({
  executablePath:
    '/home/xiaobai/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell',
})
const page = await browser.newPage({ viewport: { width: 1700, height: 1050 } })
await page.goto(`http://10.10.10.2:3080/?token=${token}`, { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForTimeout(2000)
await page.getByText(/Markdown 插件/).first().click()
await page.waitForTimeout(3500)
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button,a,[role="link"]')].find((el) => /2026-11-11\.md/.test(el.textContent || ''))
  btn?.click()
})
await page.waitForTimeout(4500)

const report = await page.evaluate(() => {
  const root = document.querySelector('.mdv')
  if (!root) return { error: 'no .mdv' }
  const pick = (sel) => {
    const el = root.querySelector(sel)
    if (!el) return null
    const cs = getComputedStyle(el)
    return {
      tag: el.tagName,
      text: (el.textContent || '').slice(0, 24),
      bg: cs.backgroundColor,
      color: cs.color,
      padding: cs.padding,
      border: cs.border,
      borderRadius: cs.borderRadius,
      font: `${cs.fontWeight} ${cs.fontSize}/${cs.lineHeight}`,
    }
  }
  const children = [...root.children].slice(0, 8).map((el) => {
    const cs = getComputedStyle(el)
    return `${el.tagName}: mt=${cs.marginTop} mb=${cs.marginBottom} fs=${cs.fontSize} lh=${cs.lineHeight}`
  })
  return {
    root: {
      width: root.getBoundingClientRect().width,
      fs: getComputedStyle(root).fontSize,
      lh: getComputedStyle(root).lineHeight,
      padding: getComputedStyle(root).padding,
    },
    strong: pick('strong'),
    h1: pick('h1'),
    h2: pick('h2'),
    p: pick('p'),
    code: pick('code'),
    children,
  }
})
console.log(JSON.stringify(report, null, 1))
await browser.close()
