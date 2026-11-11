// dsh-live-shot.mjs — 打开真实的 dsh web 页面截图，并抓控制台错误。
// 用法：node dsh-live-shot.mjs [输出前缀]
import { execSync } from 'node:child_process'
import { chromium } from '/home/xiaobai/node_modules/playwright-core/index.mjs'

const out = process.argv[2] ?? '/home/xiaobai/tmp/dsh-live'
const token =
  execSync("journalctl --user -u dsh-web.service --since 'today' --no-pager | grep -o 'token=[A-Za-z0-9_-]*' | tail -1", {
    shell: '/bin/bash',
  })
    .toString()
    .trim()
    .replace('token=', '')

if (!token) throw new Error('拿不到 token')
const url = `http://10.10.10.2:3080/?token=${token}`

const browser = await chromium.launch({
  executablePath: '/home/xiaobai/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell',
})
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 })

const problems = []
page.on('console', (msg) => {
  if (msg.type() === 'error' || msg.type() === 'warning') problems.push(`[${msg.type()}] ${msg.text()}`)
})
page.on('pageerror', (err) => problems.push(`[pageerror] ${err.message}`))

await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForTimeout(4000)
await page.screenshot({ path: `${out}-home.png` })

// 插件有没有被加载进模块表
const loaded = await page.evaluate(() => {
  const boot = window.__DSH_BOOT__
  return {
    entries: (boot?.entries ?? []).map((e) => e.id).filter((id) => id.startsWith('dsh-')),
    hasMdview: (boot?.entries ?? []).some((e) => e.id === 'dsh-mdview'),
  }
})
console.log('BOOT 本地插件:', loaded.entries.join(', '))
console.log('包含 dsh-mdview:', loaded.hasMdview)

console.log('--- 控制台问题 ---')
console.log(problems.length === 0 ? '(无)' : problems.slice(0, 20).join('\n'))

await browser.close()
