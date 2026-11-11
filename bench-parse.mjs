// bench-parse.mjs — 长文档解析耗时与输出完整性（不碰 DSH，纯 node）。
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const root = new URL('./', import.meta.url).pathname
const fakeReact = { useMemo: (fn) => fn(), createElement: (t, p) => ({ type: t, props: p }) }
const context = {
  console,
  URL,
  document: { baseURI: 'http://x/', querySelector: () => null, head: { appendChild() {} }, createElement: () => ({ setAttribute() {}, textContent: '' }) },
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

const files = [
  ['sample.md', root + 'sample.md'],
  ['MEMORY.md', '/home/xiaobai/xiaobai/MEMORY.md'],
  ['日记 2026-11-11', '/home/xiaobai/xiaobai/memory/2026-11-11.md'],
]

for (const [label, path] of files) {
  let text
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    console.log(`${label}: 读不到，跳过`)
    continue
  }
  const args = {
    content: { kind: 'text', text, pages: [], eof: true },
    resourceAddress: 'dsh-resource://file/session/s1/x/' + path,
    useResource: () => ({ value: { absolutePath: path } }),
  }
  // 预热一次
  body(args)
  const runs = []
  for (let i = 0; i < 15; i += 1) {
    const t0 = performance.now()
    body(args)
    runs.push(performance.now() - t0)
  }
  runs.sort((a, b) => a - b)
  const html = body(args).props.dangerouslySetInnerHTML.__html
  console.log(
    `${label.padEnd(18)} ${(text.length / 1024).toFixed(1).padStart(6)}KB  ` +
      `中位 ${runs[7].toFixed(1)}ms  最慢 ${runs[runs.length - 1].toFixed(1)}ms  ` +
      `HTML ${(html.length / 1024).toFixed(1)}KB  标题 ${(html.match(/<h[1-6]/g) ?? []).length} ` +
      `表格 ${(html.match(/<table>/g) ?? []).length} 代码块 ${(html.match(/<pre>/g) ?? []).length}`,
  )
}
