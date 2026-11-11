// dsh-click-file-chip.mjs — 点开对话里的 .md 文件引用 chip，验证预览是否走新渲染器。
import { execSync } from 'node:child_process'
import { chromium } from '/home/xiaobai/node_modules/playwright-core/index.mjs'

const out = '/home/xiaobai/tmp/chip'
const token = execSync(
  "journalctl --user -u dsh-web.service --since 'today' --no-pager | grep -o 'token=[A-Za-z0-9_-]*' | tail -1",
  { shell: '/bin/bash' },
).toString().trim().replace('token=', '')

const browser = await chromium.launch({
  executablePath:
    '/home/xiaobai/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell',
})
const page = await browser.newPage({ viewport: { width: 1700, height: 1050 }, deviceScaleFactor: 1.5 })
const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

await page.goto(`http://10.10.10.2:3080/?token=${token}`, { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForTimeout(2000)
await page.getByText(/Markdown 插件/).first().click()
await page.waitForTimeout(4000)

const clicked = await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button,a,[role="link"]')].find((el) =>
    /sample\.md/.test(el.textContent || ''),
  )
  if (!btn) return false
  btn.click()
  return true
})
console.log('点了 chip:', clicked)

await page.waitForTimeout(5000)
await page.screenshot({ path: `${out}-after-click.png` })
const state = await page.evaluate(() => ({
  mdv: !!document.querySelector('.mdv'),
  mdvText: document.querySelector('.mdv')?.innerText?.slice(0, 120) ?? '',
  h2Count: document.querySelectorAll('.mdv h2').length,
  tableCount: document.querySelectorAll('.mdv .mdv-table').length,
  bodyHasPreview: /排版 Markdown|Markdown/.test(document.body.innerText),
}))
console.log('渲染状态:', JSON.stringify(state, null, 1))
console.log('--- errors ---')
console.log(errors.length ? errors.slice(0, 6).join('\n') : '(无)')
await browser.close()
