#!/usr/bin/env node
/**
 * build.mjs — 把 src/ 打成 DSH 认识的浏览器插件文件 lib/client.js。
 *
 * 逻辑很薄：esbuild 把 marked + React 组件 + CSS 串打成一个 CJS 包（react 是 external），
 * 再套上 DSH 的经典脚本契约 —— `window.__ModuleLoader__.load({ id, factory })`，
 * factory 收到宿主给的 require，React 就从那里拿。
 */

import { build } from 'esbuild'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const PLUGIN_ID = 'dsh-mdview'
const outfile = resolve(root, 'dist/client.cjs')

await mkdir(dirname(outfile), { recursive: true })

await build({
  entryPoints: [resolve(root, 'src/index.jsx')],
  outfile,
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: ['chrome110'],
  external: ['react'],
  loader: { '.css': 'text' },
  jsx: 'transform',
  jsxFactory: 'React.createElement',
  jsxFragment: 'React.Fragment',
  logLevel: 'info',
  legalComments: 'none',
})

const bundle = await readFile(outfile, 'utf8')

const wrapped = `/**
 * ${PLUGIN_ID} — 由 build.mjs 生成，不要手改。
 * 源码在 src/，改完跑 node build.mjs。
 */
window.__ModuleLoader__.load({
  id: ${JSON.stringify(PLUGIN_ID)},
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
${bundle}
    return module.exports
  },
})
`

await writeFile(resolve(root, 'lib/client.js'), wrapped, 'utf8')
console.log(`✓ lib/client.js (${(wrapped.length / 1024).toFixed(1)} KB)`)
