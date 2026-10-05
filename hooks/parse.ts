// Markdown to a small block/inline tree, by marked (GFM) plus the syntax
// render-markdown.nvim draws on top of it: callouts, footnotes, wiki links,
// ==highlight==, $math$, custom checkbox states and a subset of inline HTML.
// Pure: no `$`, so tests import it directly. Never throws on half-written
// input, because replies are parsed while they stream.

import { Marked } from './vendor/marked.js'
import type { Token, TokenizerExtension, Tokens } from './vendor/marked.js'

import { CALLOUTS, CHECK_COLORS } from './style'

export type SpanStyle = 'strong' | 'em' | 'del' | 'mark' | 'underline' | 'kbd' | 'code' | 'sub' | 'sup'

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'span'; style: SpanStyle; children: Inline[] }
  | { kind: 'link'; href: string; children: Inline[] }
  | { kind: 'image'; href: string; alt: string }
  | { kind: 'wiki'; target: string; label: string }
  | { kind: 'footnote'; index: number; label: string }
  | { kind: 'math'; tex: string }
  | { kind: 'break' }

export type Align = 'left' | 'center' | 'right' | null

// `check` is null for a plain item, else a key of CHECK_COLORS.
export type ListItem = { check: string | null; blocks: Block[] }

export type TableBlock = { kind: 'table'; align: Align[]; head: Inline[][]; rows: Inline[][][] }

export type Footnote = { index: number; label: string; blocks: Block[] }

export type Block =
  | { kind: 'heading'; level: number; inline: Inline[] }
  | { kind: 'paragraph'; inline: Inline[] }
  | { kind: 'code'; lang: string; info: string; source: string }
  | { kind: 'math'; tex: string }
  | { kind: 'quote'; blocks: Block[] }
  | { kind: 'callout'; type: string; title: Inline[]; blocks: Block[] }
  | { kind: 'list'; ordered: boolean; start: number; loose: boolean; items: ListItem[] }
  | TableBlock
  | { kind: 'rule' }
  | { kind: 'footnotes'; notes: Footnote[] }

const at = (index: number): number | undefined => (index >= 0 ? index : undefined)

const footnoteDef: TokenizerExtension = {
  name: 'footnoteDef',
  level: 'block',
  start: src => at(src.search(/^\[\^[^\]\s]+\]:/m)),
  tokenizer(src) {
    const def = /^\[\^([^\]\s]+)\]:[ \t]*([^\n]*(?:\n+(?: {4}|\t)[^\n]*)*)(?:\n|$)/.exec(src)
    if (!def) return undefined
    const body = def[2]!.replace(/\n(?: {4}|\t)/g, '\n')

    return { type: 'footnoteDef', raw: def[0], label: def[1], tokens: this.lexer.blockTokens(body, []) }
  },
}

const blockMath: TokenizerExtension = {
  name: 'blockMath',
  level: 'block',
  start: src => at(src.search(/^\$\$/m)),
  tokenizer(src) {
    const math = /^\$\$([^\n]+?)\$\$[ \t]*(?:\n|$)/.exec(src) ?? /^\$\$[ \t]*\n([\s\S]*?)\n[ \t]*\$\$[ \t]*(?:\n|$)/.exec(src)

    return math ? { type: 'blockMath', raw: math[0], text: math[1]!.trim() } : undefined
  },
}

const footnoteRef: TokenizerExtension = {
  name: 'footnoteRef',
  level: 'inline',
  start: src => at(src.indexOf('[^')),
  tokenizer(src) {
    const ref = /^\[\^([^\]\s]+)\]/.exec(src)

    return ref ? { type: 'footnoteRef', raw: ref[0], label: ref[1] } : undefined
  },
}

const wikiLink: TokenizerExtension = {
  name: 'wikiLink',
  level: 'inline',
  start: src => at(src.indexOf('[[')),
  tokenizer(src) {
    const wiki = /^\[\[([^\]\n|]+)(?:\|([^\]\n]+))?\]\]/.exec(src)

    return wiki ? { type: 'wikiLink', raw: wiki[0], target: wiki[1]!.trim(), alias: wiki[2]?.trim() } : undefined
  },
}

const highlight: TokenizerExtension = {
  name: 'highlight',
  level: 'inline',
  start: src => at(src.indexOf('==')),
  tokenizer(src) {
    const mark = /^==(?=[^\s=])([\s\S]*?[^\s=])==(?!=)/.exec(src)

    return mark ? { type: 'highlight', raw: mark[0], tokens: this.lexer.inlineTokens(mark[1]!) } : undefined
  },
}

// `$x$` after pandoc's rule: no space inside the dollars, no digit right after
// the closing one, so prices ($5 and $10) stay text. Content opening with an
// all-caps name (`$HOME/$USER`, `$PATH:$HOME`) is shell variables, not math.
const inlineMath: TokenizerExtension = {
  name: 'inlineMath',
  level: 'inline',
  start: src => at(src.indexOf('$')),
  tokenizer(src) {
    const math = /^\$\$([^$\n]+?)\$\$/.exec(src) ?? /^\$(?=[^\s$])([^$\n]*?[^\s$\\])\$(?![\d$])/.exec(src)
    if (!math || /^[A-Z_][A-Z0-9_]+\b/.test(math[1]!)) return undefined

    return { type: 'inlineMath', raw: math[0], text: math[1]! }
  },
}

const md = new Marked({
  gfm: true,
  extensions: [footnoteDef, blockMath, footnoteRef, wikiLink, highlight, inlineMath],
})

type Notes = { index: Map<string, number>; defs: Map<string, Token[]> }

export function parseMarkdown(text: string): Block[] {
  const tokens = md.lexer(text.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g, ''))
  const notes: Notes = { index: new Map(), defs: new Map() }
  collectNotes(tokens, notes)
  for (const def of [...notes.defs.values()]) collectNotes(def, notes)

  const blocks = toBlocks(tokens, notes)
  if (notes.defs.size > 0) {
    for (const label of notes.defs.keys()) number(notes, label)
    const ordered = [...notes.defs.entries()].sort(([a], [b]) => notes.index.get(a)! - notes.index.get(b)!)
    blocks.push({
      kind: 'footnotes',
      notes: ordered.map(([label, def]) => ({ index: notes.index.get(label)!, label, blocks: toBlocks(def, notes) })),
    })
  }

  return blocks
}

// Footnotes are numbered by first reference, as GitHub does.
function collectNotes(tokens: readonly Token[], notes: Notes): void {
  for (const token of tokens) {
    if (token.type === 'footnoteRef') number(notes, token.label as string)
    if (token.type === 'footnoteDef') {
      if (!notes.defs.has(token.label as string)) notes.defs.set(token.label as string, token.tokens ?? [])
      continue
    }
    collectNotes(childrenOf(token), notes)
  }
}

function number(notes: Notes, label: string): void {
  if (!notes.index.has(label)) notes.index.set(label, notes.index.size + 1)
}

function childrenOf(token: Token): Token[] {
  switch (token.type) {
    case 'list':
      return (token as Tokens.List).items.flatMap(item => item.tokens)
    case 'table': {
      const table = token as Tokens.Table
      return [...table.header, ...table.rows.flat()].flatMap(cell => cell.tokens)
    }
    default:
      return (token as Tokens.Generic).tokens ?? []
  }
}

function toBlocks(tokens: readonly Token[], notes: Notes): Block[] {
  const blocks: Block[] = []

  for (const token of tokens) {
    switch (token.type) {
      case 'space':
      case 'def':
      case 'checkbox':
      case 'footnoteDef':
        break
      case 'heading': {
        const heading = token as Tokens.Heading
        blocks.push({ kind: 'heading', level: heading.depth, inline: toInline(heading.tokens, notes) })
        break
      }
      case 'paragraph':
      case 'text': {
        const inline = toInline(token.tokens ?? [token], notes)
        if (inline.length > 0) blocks.push({ kind: 'paragraph', inline })
        break
      }
      case 'code': {
        const code = token as Tokens.Code
        const [lang = '', ...info] = (code.lang ?? '').trim().split(/\s+/)
        blocks.push(
          lang === 'math'
            ? { kind: 'math', tex: code.text }
            : { kind: 'code', lang, info: info.join(' '), source: code.text },
        )
        break
      }
      case 'blockMath':
        blocks.push({ kind: 'math', tex: token.text as string })
        break
      case 'blockquote':
        blocks.push(quote(token as Tokens.Blockquote, notes))
        break
      case 'list': {
        const list = token as Tokens.List
        blocks.push({
          kind: 'list',
          ordered: list.ordered,
          start: list.start === '' ? 1 : list.start,
          loose: list.loose,
          items: list.items.map(item => listItem(item, notes)),
        })
        break
      }
      case 'table': {
        const table = token as Tokens.Table
        blocks.push({
          kind: 'table',
          align: table.align,
          head: table.header.map(cell => toInline(cell.tokens, notes)),
          rows: table.rows.map(row => row.map(cell => toInline(cell.tokens, notes))),
        })
        break
      }
      case 'hr':
        blocks.push({ kind: 'rule' })
        break
      case 'html': {
        // Block HTML: comments vanish; the rest is drawn as inline HTML.
        const html = (token as Tokens.HTML).text.replace(/<!--[\s\S]*?(?:-->|$)/g, '').trim()
        if (html) blocks.push({ kind: 'paragraph', inline: toInline(md.Lexer.lexInline(html, md.defaults), notes) })
        break
      }
      default:
        if (token.raw.trim()) blocks.push({ kind: 'paragraph', inline: [{ kind: 'text', text: token.raw.trim() }] })
    }
  }

  return blocks
}

// `> [!NOTE] Optional title` starts a callout; an unknown type stays a quote.
function quote(token: Tokens.Blockquote, notes: Notes): Block {
  const [first = '', ...rest] = token.text.split('\n')
  const head = /^\[!([A-Za-z]+)\][+-]?[ \t]*(.*)$/.exec(first)
  const type = head?.[1]!.toLowerCase() ?? ''
  if (!head || !(type in CALLOUTS)) return { kind: 'quote', blocks: toBlocks(token.tokens, notes) }

  return {
    kind: 'callout',
    type,
    title: head[2] ? toInline(md.Lexer.lexInline(head[2], md.defaults), notes) : [],
    blocks: toBlocks(md.lexer(rest.join('\n')), notes),
  }
}

// GFM task items carry `task`; custom states like `[-]` are plain items whose
// text starts with the marker, so their content is lexed again without it.
function listItem(item: Tokens.ListItem, notes: Notes): ListItem {
  if (item.task) return { check: item.checked ? 'checked' : 'unchecked', blocks: toBlocks(item.tokens, notes) }

  const custom = /^\[([^\]\s])\][ \t]+/.exec(item.text)
  if (custom && custom[1]! in CHECK_COLORS) {
    return { check: custom[1]!, blocks: toBlocks(md.lexer(item.text.slice(custom[0].length)), notes) }
  }

  return { check: null, blocks: toBlocks(item.tokens, notes) }
}

type Frame = { tag: string; attrs: Record<string, string>; children: Inline[] }

// Inline HTML tags drawn as styles; other tags in this set keep their content
// and drop the markup; any tag outside both stays literal text (`Vec<T>`).
const TAG_STYLES: Record<string, SpanStyle> = {
  b: 'strong',
  strong: 'strong',
  i: 'em',
  em: 'em',
  cite: 'em',
  var: 'em',
  dfn: 'em',
  u: 'underline',
  ins: 'underline',
  s: 'del',
  strike: 'del',
  del: 'del',
  mark: 'mark',
  kbd: 'kbd',
  code: 'code',
  tt: 'code',
  samp: 'code',
  sub: 'sub',
  sup: 'sup',
  summary: 'strong',
}
const TAG_PLAIN = new Set([
  'a', 'abbr', 'article', 'big', 'center', 'details', 'div', 'figcaption', 'figure', 'font',
  'label', 'p', 'picture', 'section', 'small', 'span',
])
const TAG = /^<(\/?)([a-zA-Z][\w-]*)((?:\s[^>]*?)?)(\/?)>$/s
const ATTR = /([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g

function toInline(tokens: readonly Token[], notes: Notes): Inline[] {
  const stack: Frame[] = [{ tag: '', attrs: {}, children: [] }]
  const emit = (...nodes: Inline[]) => stack[stack.length - 1]!.children.push(...nodes)

  for (const token of tokens) {
    switch (token.type) {
      case 'text':
        if (token.tokens) emit(...toInline(token.tokens, notes))
        else emit({ kind: 'text', text: decode((token as Tokens.Text).text) })
        break
      case 'escape':
      case 'codespan':
        emit({ kind: token.type === 'escape' ? 'text' : 'code', text: (token as Tokens.Escape).text })
        break
      case 'strong':
      case 'em':
      case 'del':
        emit({ kind: 'span', style: token.type as SpanStyle, children: toInline(token.tokens ?? [], notes) })
        break
      case 'highlight':
        emit({ kind: 'span', style: 'mark', children: toInline(token.tokens ?? [], notes) })
        break
      case 'br':
        emit({ kind: 'break' })
        break
      case 'link': {
        const link = token as Tokens.Link
        emit({ kind: 'link', href: link.href, children: toInline(link.tokens, notes) })
        break
      }
      case 'image': {
        const image = token as Tokens.Image
        emit({ kind: 'image', href: image.href, alt: decode(image.text) })
        break
      }
      case 'footnoteRef': {
        const label = token.label as string
        emit({ kind: 'footnote', index: notes.index.get(label) ?? 0, label })
        break
      }
      case 'wikiLink':
        emit({ kind: 'wiki', target: token.target as string, label: (token.alias ?? token.target) as string })
        break
      case 'inlineMath':
        emit({ kind: 'math', tex: token.text as string })
        break
      case 'html':
        tag((token as Tokens.Tag).text, stack, emit)
        break
      case 'checkbox':
        break
      default:
        emit({ kind: 'text', text: token.raw })
    }
  }

  // An unclosed tag drops its markup and keeps its content.
  while (stack.length > 1) {
    const open = stack.pop()!
    stack[stack.length - 1]!.children.push(...open.children)
  }

  return mergeText(stack[0]!.children)
}

function tag(html: string, stack: Frame[], emit: (...nodes: Inline[]) => void): void {
  if (html.startsWith('<!--')) return
  const parsed = TAG.exec(html.trim())
  const name = parsed?.[2]!.toLowerCase() ?? ''
  if (!parsed || !(name in TAG_STYLES || TAG_PLAIN.has(name) || name === 'br' || name === 'img')) {
    emit({ kind: 'text', text: html })
    return
  }

  const attrs: Record<string, string> = {}
  for (const attr of parsed[3]!.matchAll(ATTR)) attrs[attr[1]!.toLowerCase()] = attr[2] ?? attr[3] ?? attr[4] ?? ''

  if (name === 'br') return emit({ kind: 'break' })
  if (name === 'img') return emit({ kind: 'image', href: attrs.src ?? '', alt: attrs.alt ?? '' })
  if (parsed[4]) return

  if (!parsed[1]) {
    stack.push({ tag: name, attrs, children: [] })
    return
  }

  const depth = stack.findLastIndex(frame => frame.tag === name)
  if (depth < 1) return
  while (stack.length > depth + 1) {
    const inner = stack.pop()!
    stack[stack.length - 1]!.children.push(...inner.children)
  }
  const open = stack.pop()!
  const children = mergeText(open.children)
  const style = TAG_STYLES[name]
  if (name === 'a' && open.attrs.href) emit({ kind: 'link', href: open.attrs.href, children })
  else if (name === 'summary') emit({ kind: 'span', style: 'strong', children: [{ kind: 'text', text: '▸ ' }, ...children] })
  else if (style) emit({ kind: 'span', style, children })
  else emit(...children)
}

function mergeText(nodes: Inline[]): Inline[] {
  const merged: Inline[] = []
  for (const node of nodes) {
    const last = merged[merged.length - 1]
    if (node.kind === 'text' && last?.kind === 'text') merged[merged.length - 1] = { kind: 'text', text: last.text + node.text }
    else merged.push(node)
  }

  return merged
}

// marked resolves numeric references itself; named ones stay for a renderer.
const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®', trade: '™',
  hellip: '…', mdash: '—', ndash: '–', larr: '←', rarr: '→', uarr: '↑', darr: '↓', harr: '↔',
  lArr: '⇐', rArr: '⇒', hArr: '⇔', times: '×', divide: '÷', middot: '·', bull: '•', deg: '°',
  plusmn: '±', laquo: '«', raquo: '»', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', sect: '§',
  para: '¶', euro: '€', pound: '£', yen: '¥', cent: '¢', ne: '≠', le: '≤', ge: '≥', infin: '∞',
  check: '✓', cross: '✗',
}

function decode(text: string): string {
  return text.replace(/&([a-zA-Z]+);/g, (entity, name: string) => ENTITIES[name] ?? entity)
}

// The image a paragraph holds alone (spaces aside): drawn as a picture.
export function soleImage(inline: readonly Inline[]): Extract<Inline, { kind: 'image' }> | undefined {
  const parts = inline.filter(node => !(node.kind === 'text' && node.text.trim() === ''))
  const [image] = parts

  return parts.length === 1 && image?.kind === 'image' ? image : undefined
}

// Every block, nested ones included.
export function eachBlock(blocks: readonly Block[], visit: (block: Block) => void): void {
  for (const block of blocks) {
    visit(block)
    if (block.kind === 'quote' || block.kind === 'callout') eachBlock(block.blocks, visit)
    else if (block.kind === 'list') block.items.forEach(item => eachBlock(item.blocks, visit))
    else if (block.kind === 'footnotes') block.notes.forEach(note => eachBlock(note.blocks, visit))
  }
}
