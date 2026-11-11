// 用真实浏览器看排版：把 sample.md 渲染成 HTML，套上侧栏宽度与深浅两套主题，截两张图。
// 用途：改样式时自己先看，不必每次都重启 dsh-web。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import vm from 'node:vm'
import { chromium } from '/home/xiaobai/node_modules/playwright-core/index.mjs'

const root = new URL('./', import.meta.url).pathname
const out = root + 'screens'
mkdirSync(out, { recursive: true })

/* ── 1. 用插件自己的 bundle 渲染 markdown ─────────────────── */
const fakeReact = { useMemo: (fn) => fn(), createElement: (type, props) => ({ type, props }) }
const context = {
  console,
  URL,
  document: {
    baseURI: 'http://10.10.10.2:3080/',
    querySelector: () => null,
    head: { appendChild() {} },
    createElement: () => ({ setAttribute() {}, textContent: '' }),
  },
  window: {},
}
context.globalThis = context
vm.createContext(context)
let captured
context.window.__ModuleLoader__ = { load: (v) => { captured = v } }
vm.runInContext(readFileSync(root + 'lib/client.js', 'utf8'), context)

const mod = captured.factory((name) => (name === 'react' ? fakeReact : null))
let body
mod.apply({
  effect: (fn) => fn(),
  documentPreviews: { register: () => () => {} },
  slots: { inject: (_n, fn) => fn(), register: (_o, c) => ((body = c), () => {}) },
})

const md = readFileSync(root + 'sample.md', 'utf8')
const html = body({
  content: { kind: 'text', text: md, pages: [], eof: true },
  resourceAddress: 'dsh-resource://file/session/s1/x/sample.md',
  useResource: () => ({ value: { absolutePath: root + 'sample.md' } }),
}).props.dangerouslySetInnerHTML.__html

// 离线页面没有 api/file 路由，把图片就地换成 data URI，别在截图里留破图
const inlined = html.replace(/src="[^"]*api\/file\?path=([^"]+)"/g, (whole, encoded) => {
  try {
    const file = decodeURIComponent(encoded)
    const bytes = readFileSync(file)
    const ext = file.split('.').pop().toLowerCase()
    const mime = ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/webp'
    return `src="data:${mime};base64,${bytes.toString('base64')}"`
  } catch {
    return whole
  }
})

const css = readFileSync(root + 'src/styles.css', 'utf8')

/* ── 2. 近似 DSH 主题 token ───────────────────────────────── */
const tokens = {
  light: `
:root{
  --dsw-alias-label-primary:#1c1d1f; --dsw-alias-label-secondary:#5b6068;
  --dsw-alias-label-tertiary:#8b9097;
  --dsw-alias-border-l1:rgba(0,0,0,.06); --dsw-alias-border-l2:rgba(0,0,0,.11);
  --dsw-alias-bg-layer-2:rgba(0,0,0,.035);
  --dsw-alias-markdown-code-block:rgba(0,0,0,.042);
  --dsw-alias-markdown-inline-code:rgba(0,0,0,.055);
  --dsw-alias-markdown-tag:rgba(255,214,102,.35);
  --dsw-alias-link:#0a66c2; --dsw-alias-brand-primary:#1fa87a;
  --dsw-alias-state-error-primary:#c0392b;
  --dsh-font-family-text:-apple-system,"PingFang SC","HarmonyOS Sans SC","Noto Sans CJK SC",sans-serif;
  --ds-font-family-code:ui-monospace,"JetBrains Mono","DejaVu Sans Mono",monospace;
  background:#fbfbfa; color:#1c1d1f;
}`,
  dark: `
:root{
  --dsw-alias-label-primary:#e8e8e6; --dsw-alias-label-secondary:#a3a5a8;
  --dsw-alias-label-tertiary:#75787c;
  --dsw-alias-border-l1:rgba(255,255,255,.07); --dsw-alias-border-l2:rgba(255,255,255,.12);
  --dsw-alias-bg-layer-2:rgba(255,255,255,.045);
  --dsw-alias-markdown-code-block:rgba(255,255,255,.055);
  --dsw-alias-markdown-inline-code:rgba(255,255,255,.09);
  --dsw-alias-markdown-tag:rgba(255,214,102,.25);
  --dsw-alias-link:#7aa9f5; --dsw-alias-brand-primary:#3ecf9a;
  --dsw-alias-state-error-primary:#e07a6c;
  --dsh-font-family-text:-apple-system,"PingFang SC","HarmonyOS Sans SC","Noto Sans CJK SC",sans-serif;
  --ds-font-family-code:ui-monospace,"JetBrains Mono","DejaVu Sans Mono",monospace;
  background:#17181a; color:#e8e8e6;
}`,
}

/* ── 3. 出图 ─────────────────────────────────────────────── */
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH })
const shots = []
for (const [theme, tokenCss] of Object.entries(tokens)) {
  for (const width of [420, 700]) {
    const page = await browser.newPage({ viewport: { width, height: 1100 }, deviceScaleFactor: 2 })
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8">
<style>${tokenCss}</style>
<style>${css}</style>
<style>html,body{margin:0}body{font-family:var(--dsh-font-family-text)}</style>
</head><body><article class="mdv">${inlined}</article></body></html>`)
    const file = `${out}/${theme}-${width}.png`
    await page.screenshot({ path: file, fullPage: true })
    shots.push(file)
    await page.close()
  }
}
await browser.close()
writeFileSync(out + '/index.txt', shots.join('\n'))
console.log(shots.join('\n'))
