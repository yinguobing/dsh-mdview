// dsh-mdview 离线冒烟测试：不启动 DSH，只验证 bundle 能装载、apply 能跑、渲染出 HTML。
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const fakeReact = {
  useMemo: (fn) => fn(),
  createElement: (type, props) => ({ type, props }),
}

const stylesSeen = []
const context = {
  console,
  URL,
  document: {
    baseURI: 'http://10.10.10.2:3080/',
    querySelector: () => null,
    head: { appendChild: (tag) => stylesSeen.push(tag) },
    createElement: () => ({ setAttribute() {}, textContent: '' }),
  },
  window: {},
}
context.globalThis = context
vm.createContext(context)

let captured
context.window.__ModuleLoader__ = {
  load: ({ id, factory }) => {
    captured = { id, factory }
  },
}

const code = readFileSync(new URL('./lib/client.js', import.meta.url), 'utf8')
vm.runInContext(code, context)

if (!captured) throw new Error('bundle 没有调用 window.__ModuleLoader__.load')
console.log('id:', captured.id)

const mod = captured.factory((name) => {
  if (name === 'react') return fakeReact
  throw new Error('unexpected require: ' + name)
})
console.log('exports:', Object.keys(mod))

const registered = []
let body
const ctx = {
  effect: (fn) => fn(),
  documentPreviews: { register: (def) => (registered.push(def), () => {}) },
  slots: {
    inject: (name, fn) => fn(),
    register: (opts, component) => {
      body = component
      return () => {}
    },
  },
}
mod.apply(ctx)

console.log('renderer:', registered.map((d) => `${d.id} [${d.priority}] ${d.extensions.join(',')} ${d.loading}`))
if (!body) throw new Error('正文组件没有注册')

const md = `---
title: 测试
---

# 一级标题

正文里有 **粗体**、\`行内代码\`、[链接](https://yinguobing.com)。

## 二级标题

| 列一 | 列二 |
| --- | --- |
| a | b |

- 项目一
- 项目二

\`\`\`js
const a = 1
\`\`\`

> 引用一句

![相对图](assets/a.png)
`

const rendered = body({
  content: { kind: 'text', text: md, pages: [], eof: true },
  resourceAddress: 'dsh-resource://file/session/s1/home/xiaobai/dsh-mdview/README.md',
  useResource: () => ({ value: { absolutePath: '/home/xiaobai/dsh-mdview/README.md' } }),
})
const html = rendered?.props?.dangerouslySetInnerHTML?.__html ?? ''
if (!html) throw new Error('渲染结果为空')

const checks = {
  '标题 id': /<h1 id="/.test(html),
  'frontmatter 已剥离': !html.includes('title: 测试'),
  '表格': html.includes('<table>'),
  '代码块': html.includes('<pre>'),
  '引用块': html.includes('<blockquote>'),
  '行内代码': html.includes('<code>行内代码</code>'),
  '链接': html.includes('href="https://yinguobing.com"'),
  '相对图片改写成 api/file': /src="http:\/\/10\.10\.10\.2:3080\/api\/file\?path=%2Fhome%2Fxiaobai%2Fdsh-mdview%2Fassets%2Fa\.png"/.test(html),
  '样式已注入 head': stylesSeen.length === 1,
}

let ok = true
for (const [name, pass] of Object.entries(checks)) {
  console.log(`${pass ? '✓' : '✗'} ${name}`)
  if (!pass) ok = false
}
console.log('\n--- HTML 前 600 字 ---\n' + html.slice(0, 600))
process.exit(ok ? 0 : 1)
