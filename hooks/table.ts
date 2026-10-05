// Pipe tables laid out as lines of styled runs: borders, padded and aligned
// cells, wrapped to fit. A Box has no per-side borders, so the grid is text,
// measured in terminal cells. Pure: no `$`, no elements.

import { runsWidth, toRuns, wrapRuns } from './inline'
import type { InlineContext, Run, RunStyle } from './inline'
import type { Align, TableBlock } from './parse'
import { COLOR } from './style'
import type { Options } from './style'
import { cells } from './width'

// render-markdown.nvim's border presets: top, delimiter and bottom rows
// (left, middle, right), then the vertical and horizontal lines.
const BORDERS: Record<Options['tableBorders'], { rows: string[][]; vertical: string; horizontal: string }> = {
  square: { rows: [['┌', '┬', '┐'], ['├', '┼', '┤'], ['└', '┴', '┘']], vertical: '│', horizontal: '─' },
  round: { rows: [['╭', '┬', '╮'], ['├', '┼', '┤'], ['╰', '┴', '╯']], vertical: '│', horizontal: '─' },
  double: { rows: [['╔', '╦', '╗'], ['╠', '╬', '╣'], ['╚', '╩', '╝']], vertical: '║', horizontal: '═' },
  heavy: { rows: [['┏', '┳', '┓'], ['┣', '╋', '┫'], ['┗', '┻', '┛']], vertical: '┃', horizontal: '━' },
}
// Marks a column's alignment in the delimiter row: at the side it aligns to.
const INDICATOR = '━'
const PAD = 1
// A column narrower than this breaks words; the table is cut at the edge instead.
const MIN_COLUMN = 3

const BORDER: RunStyle = { color: COLOR.rule }
const HEAD: RunStyle = { bold: true }

export function layoutTable(
  b: TableBlock,
  room: number,
  ctx: InlineContext,
  style: { lines: 'full' | 'normal'; border: Options['tableBorders'] },
): Run[][] {
  const head = b.head.map(cell => toRuns(cell, ctx, HEAD))
  const rows = b.rows.map(row => b.head.map((_, k) => toRuns(row[k] ?? [], ctx)))
  const all = [head, ...rows]
  const natural = head.map((_, k) => Math.max(1, ...all.map(row => longestLine(row[k]!))))
  const minimum = natural.map((width, k) => Math.min(width, Math.max(MIN_COLUMN, ...all.map(row => longestWord(row[k]!)))))
  const widths = fit(natural, minimum, room - head.length * (2 * PAD + 1) - 1)

  const { rows: corners, vertical, horizontal } = BORDERS[style.border]
  const rule = ([left, middle, right]: string[], align: readonly Align[] = []): Run[] => {
    const runs: Run[] = [{ text: left!, style: BORDER }]
    widths.forEach((width, k) => {
      if (k > 0) runs.push({ text: middle!, style: BORDER })
      const span = width + 2 * PAD
      const start = align[k] === 'left' || align[k] === 'center' ? INDICATOR : horizontal
      const end = align[k] === 'right' || align[k] === 'center' ? INDICATOR : horizontal
      runs.push({ text: start, style: { color: start === INDICATOR ? COLOR.marker : COLOR.rule } })
      runs.push({ text: horizontal.repeat(Math.max(0, span - 2)), style: BORDER })
      runs.push({ text: end, style: { color: end === INDICATOR ? COLOR.marker : COLOR.rule } })
    })
    runs.push({ text: right!, style: BORDER })

    return runs
  }
  const row = (cellRuns: readonly Run[][]): Run[][] => {
    const wrapped = cellRuns.map((runs, k) => wrapRuns(runs, widths[k]!))
    const height = Math.max(1, ...wrapped.map(lines => lines.length))

    return Array.from({ length: height }, (_, i) => {
      const line: Run[] = [{ text: vertical, style: BORDER }]
      wrapped.forEach((lines, k) => {
        line.push(...aligned(lines[i] ?? [], widths[k]!, b.align[k] ?? null))
        line.push({ text: vertical, style: BORDER })
      })

      return line
    })
  }

  return [
    ...(style.lines === 'full' ? [rule(corners[0]!)] : []),
    ...row(head),
    rule(corners[1]!, b.align),
    ...rows.flatMap(row),
    ...(style.lines === 'full' ? [rule(corners[2]!)] : []),
  ]
}

// A cell's line padded to its column and aligned in it.
function aligned(runs: readonly Run[], width: number, align: Align): Run[] {
  const space = Math.max(0, width - runsWidth(runs))
  const left = align === 'right' ? space : align === 'center' ? Math.floor(space / 2) : 0
  const pad = (n: number): Run => ({ text: ' '.repeat(n), style: {} })

  return [pad(PAD + left), ...runs, pad(space - left + PAD)]
}

function longestLine(runs: readonly Run[]): number {
  return Math.max(0, ...wrapRuns(runs, Number.POSITIVE_INFINITY).map(runsWidth))
}

function longestWord(runs: readonly Run[]): number {
  const words = runs.flatMap(run => run.text.split(/[\s]+/))

  return Math.max(0, ...words.map(cells))
}

// Natural widths when they fit; else the widest columns shrink first, to their
// longest word, then (when that is not enough) towards MIN_COLUMN.
export function fit(natural: readonly number[], minimum: readonly number[], room: number): number[] {
  const widths = [...natural]
  let excess = widths.reduce((sum, width) => sum + width, 0) - room
  for (const floor of [minimum, widths.map(() => MIN_COLUMN)]) {
    while (excess > 0) {
      let widest = -1
      widths.forEach((width, k) => {
        if (width > floor[k]! && (widest < 0 || width > widths[widest]!)) widest = k
      })
      if (widest < 0) break
      widths[widest] = widths[widest]! - 1
      excess--
    }
  }

  return widths
}
