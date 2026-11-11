// dsh-disable-plugin.mjs — 在 Plugins 页把某个已装插件关掉（走 HMR，无需重启）。
import { execSync } from 'node:child_process'
import { chromium } from '/home/xiaobai/node_modules/playwright-core/index.mjs'

const name = process.argv[2] ?? 'MarkText'
const out = process.argv[3] ?? '/home/xiaobai/tmp/plugin-toggle'
const token = execSync(
  "journalctl --user -u dsh-web.service --since 'today' --no-pager | grep -o 'token=[A-Za-z0-9_-]*' | tail -1",
  { shell: '/bin/bash' },
).toString().trim().replace('token=', '')

const browser = await chromium.launch({
  executablePath:
    '/home/xiaobai/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell',
})
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 1.5 })
await page.goto(`http://10.10.10.2:3080/?token=${token}`, { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForTimeout(2000)

await page.getByText('Plugins', { exact: true }).first().click()
await page.waitForTimeout(2500)

// 滚动到目标插件
const row = page.getByText(new RegExp(name, 'i')).first()
await row.scrollIntoViewIfNeeded()
await page.waitForTimeout(800)
await page.screenshot({ path: `${out}-before.png` })

// 同一行里的开关：向上找容器，再找 role=switch / input[type=checkbox]
const toggled = await page.evaluate((pattern) => {
  const re = new RegExp(pattern, 'i')
  const labels = [...document.querySelectorAll('*')].filter(
    (el) => el.children.length === 0 && re.test(el.textContent || ''),
  )
  for (const label of labels) {
    let node = label
    for (let depth = 0; depth < 6 && node; depth += 1) {
      node = node.parentElement
      if (!node) break
      const control = node.querySelector('[role="switch"], input[type="checkbox"]')
      if (control) {
        const state = control.getAttribute('aria-checked') ?? String(control.checked)
        control.click()
        return { found: true, state, text: (label.textContent || '').slice(0, 40) }
      }
    }
  }
  return { found: false }
}, name)
console.log('开关操作:', JSON.stringify(toggled))

await page.waitForTimeout(3000)
await page.screenshot({ path: `${out}-after.png` })
await browser.close()
