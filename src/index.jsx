/**
 * dsh-mdview — Markdown 只读视图，接管右侧栏 .md 的排版。
 *
 * 挂载方式：向 `ctx.documentPreviews` 注册一个 extension 档位的 Markdown 实现，
 * 再把正文注册到 keyed slot `sidebar.right.tab.document`。extension 档位优先于
 * 产品自带的 builtin Markdown，所以 .md 默认就用这一套排版；想对比时仍可在预览
 * 工具栏的渲染器下拉里切回内置的「Markdown」。
 *
 * 文件读取、自动刷新、分页、地址解析、错误态都由内置预览负责，这里只管排版。
 */

import { Marked } from 'marked'
import hljs from 'highlight.js/lib/core'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import python from 'highlight.js/lib/languages/python'
import bash from 'highlight.js/lib/languages/bash'
import json from 'highlight.js/lib/languages/json'
import yaml from 'highlight.js/lib/languages/yaml'
import xml from 'highlight.js/lib/languages/xml'
import cssLang from 'highlight.js/lib/languages/css'
import sql from 'highlight.js/lib/languages/sql'
import rust from 'highlight.js/lib/languages/rust'
import go from 'highlight.js/lib/languages/go'
import cpp from 'highlight.js/lib/languages/cpp'
import diff from 'highlight.js/lib/languages/diff'
import markdownLang from 'highlight.js/lib/languages/markdown'
import css from './styles.css'

/* 只注册真用得到的语言，别把 2.7MB 全打进来 */
const LANGS = {
  javascript, typescript, python, bash, json, yaml, xml, css: cssLang,
  sql, rust, go, cpp, diff, markdown: markdownLang,
}
for (const [name, def] of Object.entries(LANGS)) hljs.registerLanguage(name, def)

/** Markdown 里常见的语言别名 → highlight.js 的注册名。 */
const ALIAS = {
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript', node: 'javascript',
  ts: 'typescript', tsx: 'typescript',
  py: 'python', python3: 'python',
  sh: 'bash', shell: 'bash', zsh: 'bash', console: 'bash',
  yml: 'yaml',
  html: 'xml', htm: 'xml', svg: 'xml', vue: 'xml',
  rs: 'rust',
  golang: 'go',
  'c++': 'cpp', cc: 'cpp', h: 'cpp', hpp: 'cpp',
  patch: 'diff',
  md: 'markdown',
  postgres: 'sql', postgresql: 'sql', mysql: 'sql',
}

/**
 * 代码块高亮；语言不认识或高亮失败就退回纯文本（转义后原样显示）。
 * highlight.js 10 与 11 的 highlight() 签名不同，两种都试。
 */
function highlightCode(code, lang) {
  const name = ALIAS[lang] ?? lang
  if (!name) return escapeHtml(code)
  let out
  try {
    if (!hljs.getLanguage(name)) return escapeHtml(code)
    out = hljs.highlight(code, { language: name, ignoreIllegals: true })
  } catch {
    try {
      out = hljs.highlight(name, code, true)
    } catch {
      return escapeHtml(code)
    }
  }
  return out && typeof out.value === 'string' ? out.value : escapeHtml(code)
}

const React = require('react')
const { useMemo } = React

const IMPL_ID = 'dsh-mdview/reader'

/* ── 样式：宿主没有 css 加载器，直接把串塞进 head ─────────────── */
const CSS_FLAG = 'data-dsh-mdview-css'
if (typeof document !== 'undefined' && document.querySelector(`style[${CSS_FLAG}]`) === null) {
  const tag = document.createElement('style')
  tag.setAttribute(CSS_FLAG, '')
  tag.textContent = css
  document.head.appendChild(tag)
}

/* ── Markdown 解析 ──────────────────────────────────────────── */

/** 当前渲染的文档绝对路径，图片解析要用；同步渲染，所以模块级变量够用。 */
let documentPath
const marked = new Marked({ gfm: true, breaks: false })
marked.use({
  walkTokens(token) {
    if (token.type === 'image') token.href = resolveImage(token.href, documentPath)
  },
  renderer: {
    // 代码块走 highlight.js；语言不认识就纯文本，绝不让内容丢失
    code(token) {
      const lang = (token.lang ?? '').trim().split(/\s+/)[0]
      const body = highlightCode(token.text ?? '', lang)
      const cls = lang ? `hljs language-${escapeHtml(lang)}` : 'hljs'
      return `<pre><code class="${cls}">${body}</code></pre>\n`
    },
    // 标题留锚点，将来做大纲跳转直接用
    heading(token) {
      const inner = this.parser.parseInline(token.tokens)
      const id = slugify(plainText(token.tokens))
      return `<h${token.depth}${id ? ` id="${id}"` : ''}>${inner}</h${token.depth}>\n`
    },
    // 表格包一层滚动容器：窄侧栏里宽表格横向滚动，窄表格撑满宽度
    table(token) {
      const align = (value) => (value ? ` style="text-align:${value}"` : '')
      const head = token.header
        .map((cell) => `<th${align(cell.align)}>${this.parser.parseInline(cell.tokens)}</th>`)
        .join('')
      const body = token.rows
        .map(
          (row) =>
            `<tr>${row.map((cell) => `<td${align(cell.align)}>${this.parser.parseInline(cell.tokens)}</td>`).join('')}</tr>`,
        )
        .join('')
      return `<div class="mdv-table"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>\n`
    },
  },
})

/**
 * 解析一段累计的 Markdown 文本。
 * @param {string} text - 文档全文（分页读到哪儿算到哪儿）
 * @param {string|undefined} absolutePath - 宿主报告的源文件绝对路径
 * @returns {string} HTML
 */
function parse(text, absolutePath) {
  documentPath = absolutePath
  try {
    return marked.parse(text ?? '')
  } catch (error) {
    return `<pre class="mdv-error">${escapeHtml(String(error?.message ?? error))}</pre>`
  }
}

/**
 * 把 Markdown 里的相对图片变成宿主已鉴权的文件地址：`api/file?path=`。
 * 与内置预览同一套规则，只是不认 Windows 盘符之外的抽象路径。
 * @param {string} src - 原始 Markdown 图片地址
 * @param {string|undefined} absolutePath - 源文件绝对路径
 * @returns {string} 可用的 URL
 */
function resolveImage(src, absolutePath) {
  if (typeof src !== 'string' || src.length === 0) return src
  const cut = src.search(/[?#]/)
  let path
  try {
    path = decodeURIComponent(cut === -1 ? src : src.slice(0, cut))
  } catch {
    return src
  }
  const suffix = cut === -1 ? '' : src.slice(cut)
  if (path.length === 0) return src
  // 已经是绝对 URL / data: / 协议相对，原样交给浏览器
  if (/^[a-z][a-z\d+.-]*:/i.test(path) || path.startsWith('//')) return src
  if (path.startsWith('/')) {
    path = normalizePath(path)
  } else {
    if (!absolutePath) return src
    const dir = absolutePath.slice(0, absolutePath.lastIndexOf('/') + 1)
    path = normalizePath(dir + path)
  }
  try {
    return new URL(`api/file?path=${encodeURIComponent(path)}${suffix}`, document.baseURI).href
  } catch {
    return src
  }
}

/** 折叠 . 与 .. 段。 */
function normalizePath(path) {
  const out = []
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') out.pop()
    else out.push(segment)
  }
  return '/' + out.join('/')
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 标题锚点：拉丁字母小写连字符化，中文保留。 */
function slugify(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\u4e00-\u9fff-]/g, '')
    .slice(0, 64)
}

/** 把行内 token 摊平成纯文本。 */
function plainText(tokens) {
  if (!Array.isArray(tokens)) return ''
  return tokens.map((token) => (token.tokens ? plainText(token.tokens) : (token.text ?? ''))).join('')
}

/**
 * YAML frontmatter 不参与 Markdown 解析（先藏在正文之外）。
 * @param {string} text - 原文
 */
function stripFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)(?:\r?\n|$)/.exec(text ?? '')
  if (!match) return text ?? ''
  return (text ?? '').slice(match[0].length)
}

/* ── 正文组件 ──────────────────────────────────────────────── */

/**
 * 正文：内容已由预览宿主读好，这里只做解析与排版。
 * @param {object} props - 宿主给的 DocumentPreviewProps
 */
function MarkdownView({ content, resourceAddress, useResource }) {
  const absolutePath = useResource?.(resourceAddress)?.value?.absolutePath
  const text = content?.kind === 'text' ? content.text : ''
  const html = useMemo(() => parse(stripFrontmatter(text), absolutePath), [text, absolutePath])

  if (content?.kind !== 'text') return null
  return React.createElement('article', {
    className: 'mdv',
    dangerouslySetInnerHTML: { __html: html },
    'data-mdview': 'reader',
  })
}

/* ── 插件体 ────────────────────────────────────────────────── */

/**
 * 注册 Markdown 实现与它的正文。
 * @param {object} ctx - 浏览器端 cordis 上下文
 */
function apply(ctx) {
  const previews = ctx.documentPreviews
  const slots = ctx.slots

  if (previews && typeof previews.register === 'function') {
    ctx.effect(
      () =>
        previews.register({
          id: IMPL_ID,
          extensions: ['md', 'markdown'],
          priority: 'extension',
          // 名字只描述这套排版本身，不绑定任何参考来源
          title: () => (String(navigator?.language ?? '').toLowerCase().startsWith('zh') ? '精排版' : 'Typeset'),
          loading: 'text-pages',
          wrap: false,
        }),
      'dsh-mdview: metadata',
    )
  } else {
    console.warn('dsh-mdview: documentPreviews 不可用，未注册渲染器')
  }

  if (!slots || typeof slots.register !== 'function') {
    console.warn('dsh-mdview: slots 不可用，未注册正文')
    return
  }
  ctx.effect(
    () =>
      slots.inject('sidebar.right.tab.document', () =>
        slots.register({ name: 'sidebar.right.tab.document', key: IMPL_ID }, MarkdownView),
      ),
    'dsh-mdview: body',
  )
}

module.exports = { apply, inject: ['documentPreviews', 'slots'] }
