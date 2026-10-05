// Inline markdown flattened to styled runs: one shape for every consumer, a
// paragraph the terminal wraps and a table cell this mod wraps itself. Pure:
// no `$`, no elements.

import { clickableHref } from './links'
import type { Inline } from './parse'
import { toScript } from './scripts'
import { COLOR } from './style'
import type { Icons, Options } from './style'
import { cells } from './width'

export type RunStyle = {
  bold?: true
  italic?: true
  underline?: true
  strikethrough?: true
  inverse?: true
  color?: string
  backgroundColor?: string
}

// `href` set: the run is part of a clickable link.
export type Run = { text: string; style: RunStyle; href?: string }

export type InlineContext = {
  icons: Icons
  links: Options['links']
  math: (tex: string) => string
}

const SPAN_STYLE: Record<'strong' | 'em' | 'del' | 'underline' | 'mark' | 'code', RunStyle> = {
  strong: { bold: true },
  em: { italic: true },
  del: { strikethrough: true },
  underline: { underline: true },
  mark: COLOR.mark,
  code: { color: COLOR.code, backgroundColor: COLOR.codeBackground },
}

export function toRuns(nodes: readonly Inline[], ctx: InlineContext, style: RunStyle = {}): Run[] {
  const runs: Run[] = []
  const add = (text: string, extra: RunStyle = {}, href?: string) => {
    if (text) runs.push(href ? { text, style: { ...style, ...extra }, href } : { text, style: { ...style, ...extra } })
  }

  for (const node of nodes) {
    switch (node.kind) {
      case 'text':
        add(node.text)
        break
      case 'break':
        add('\n')
        break
      case 'code':
        add(node.text, SPAN_STYLE.code)
        break
      case 'math':
        add(ctx.math(node.tex), { color: COLOR.math })
        break
      case 'span':
        if (node.style === 'sub' || node.style === 'sup') add(script(plainText(node.children), node.style))
        else if (node.style === 'kbd') add(` ${plainText(node.children)} `, { inverse: true })
        else runs.push(...toRuns(node.children, ctx, { ...style, ...SPAN_STYLE[node.style] }))
        break
      case 'link':
        runs.push(...link(node.href, ctx.icons.link(node.href), node.children, ctx, style))
        break
      case 'image':
        runs.push(...link(node.href, ctx.icons.image, [{ kind: 'text', text: node.alt || 'image' }], ctx, style))
        break
      case 'wiki':
        add(`${glued(ctx.icons.wiki)}${node.label}`, { color: COLOR.link })
        break
      case 'footnote':
        add(script(String(node.index), 'sup'), { color: COLOR.link })
        break
    }
  }

  return mergeRuns(runs)
}

// An https link is clickable (OSC 8; a terminal without hyperlinks shows the
// URL after it); any other href is written after the label, dimmed.
function link(href: string, icon: string, children: readonly Inline[], ctx: InlineContext, style: RunStyle): Run[] {
  const clickable = ctx.links === 'clickable' ? clickableHref(href) : undefined
  const label = toRuns(children, ctx, { ...style, color: COLOR.link, underline: true })
  const runs: Run[] = [{ text: glued(icon), style: { ...style, color: COLOR.link } }, ...label]
  if (clickable) return runs.map(run => ({ ...run, href: clickable }))
  if (showsHref(href, plainText(children))) runs.push({ text: ` (${href})`, style: { ...style, color: COLOR.linkDim } })

  return runs
}

// An icon's trailing space made non-breaking, so a wrap never strands the icon
// at a line's end away from its label.
function glued(icon: string): string {
  return icon.replace(/ $/, '\u00a0')
}

// The URL is written after the label unless the label already is the URL
// (autolinks: `www.example.com`, `me@example.com`, a bare https URL).
function showsHref(href: string, label: string): boolean {
  const bare = (text: string) => text.replace(/^(?:https?:\/\/|mailto:)/i, '').replace(/\/$/, '')

  return href !== '' && bare(href) !== bare(label)
}

// Neighbouring runs of one style and link become one run.
function mergeRuns(runs: Run[]): Run[] {
  const merged: Run[] = []
  for (const run of runs) {
    const last = merged[merged.length - 1]
    if (last && last.href === run.href && sameStyle(last.style, run.style)) {
      merged[merged.length - 1] = { ...last, text: last.text + run.text }
    } else {
      merged.push(run)
    }
  }

  return merged
}

function sameStyle(a: RunStyle, b: RunStyle): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof RunStyle>

  return [...keys].every(key => a[key] === b[key])
}

// The characters an inline run shows, styles dropped.
function plainText(nodes: readonly Inline[]): string {
  return nodes
    .map(node => {
      switch (node.kind) {
        case 'text':
        case 'code':
          return node.text
        case 'math':
          return node.tex
        case 'break':
          return ' '
        case 'image':
          return node.alt
        case 'wiki':
          return node.label
        case 'footnote':
          return String(node.index)
        case 'link':
        case 'span':
          return plainText(node.children)
      }
    })
    .join('')
}

// Unicode super- or subscript when every character has one; else ^(x) / _(x).
export function script(text: string, style: 'sub' | 'sup'): string {
  return toScript(text, style) ?? `${style === 'sup' ? '^' : '_'}(${text})`
}

type Token = { kind: 'word'; parts: Run[] } | { kind: 'space'; run: Run } | { kind: 'newline' }

// Word-wraps runs into lines of at most `width` cells, styles kept. A word is
// any stretch without spaces, across runs (`**bold**text`, an icon and its
// label); one wider than the line is broken. `\n` forces a break; spaces at a
// break vanish.
export function wrapRuns(runs: readonly Run[], width: number): Run[][] {
  const tokens: Token[] = []
  for (const run of runs) {
    for (const piece of run.text.split(/(\n| +)/)) {
      const last = tokens[tokens.length - 1]
      if (!piece) continue
      if (piece === '\n') tokens.push({ kind: 'newline' })
      else if (piece.startsWith(' ')) tokens.push({ kind: 'space', run: { ...run, text: piece } })
      else if (last?.kind === 'word') last.parts.push({ ...run, text: piece })
      else tokens.push({ kind: 'word', parts: [{ ...run, text: piece }] })
    }
  }

  const lines: Run[][] = [[]]
  let used = 0
  const line = () => lines[lines.length - 1]!
  const push = (run: Run) => {
    line().push(run)
    used += cells(run.text)
  }
  const breakLine = () => {
    const last = line()[line().length - 1]
    if (last && /^ +$/.test(last.text)) line().pop()
    lines.push([])
    used = 0
  }
  // A part that does not fit is split by characters, line by line.
  const place = (part: Run) => {
    let rest = part.text
    while (rest) {
      if (used > 0 && used + cells([...rest][0]!) > width) breakLine()
      const [head, tail] = splitAt(rest, width - used)
      push({ ...part, text: head })
      rest = tail
    }
  }

  for (const token of tokens) {
    if (token.kind === 'newline') {
      breakLine()
    } else if (token.kind === 'space') {
      if (used > 0 && used + cells(token.run.text) < width) push(token.run)
    } else {
      if (used > 0 && used + runsWidth(token.parts) > width) breakLine()
      token.parts.forEach(place)
    }
  }

  return lines.map(mergeRuns)
}

// The longest prefix of `text` that fits in `room` cells, and the rest; at
// least one character, so a wide character in a narrow column still moves on.
function splitAt(text: string, room: number): [string, string] {
  let head = ''
  for (const char of text) {
    if (head && cells(head + char) > room) break
    head += char
  }

  return [head, text.slice(head.length)]
}

export function runsWidth(runs: readonly Run[]): number {
  return runs.reduce((sum, run) => sum + cells(run.text), 0)
}
