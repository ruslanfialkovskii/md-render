// Mermaid diagrams as text, the pure half: the source mermaid-ascii takes and
// its output as styled runs. The process call lives in register.tsx, since
// `$` is never passed across an import.

import type { Run } from './inline'
import { COLOR } from './style'

// Styling lines draw as stray boxes in mermaid-ascii; they carry no structure.
export function diagramSource(source: string): string {
  return source
    .split('\n')
    .filter(line => !/^\s*(classDef|class|style|linkStyle)\s/.test(line))
    .join('\n')
}

// Box-drawing and arrow characters only: ASCII ones (-, |, >) also occur in labels.
const LINES = /[─│┌┐└┘├┤┬┴┼╭╮╰╯═║╔╗╚╝╠╣╦╩╬┈┄┆┊►◄▲▼▶◀]+/g

// A diagram's lines with its box and arrow strokes in the marker colour.
export function diagramRuns(lines: readonly string[]): Run[][] {
  return lines.map(line => {
    const runs: Run[] = []
    let at = 0
    for (const stroke of line.matchAll(LINES)) {
      if (stroke.index > at) runs.push({ text: line.slice(at, stroke.index), style: {} })
      runs.push({ text: stroke[0], style: { color: COLOR.marker } })
      at = stroke.index + stroke[0].length
    }
    if (at < line.length) runs.push({ text: line.slice(at), style: {} })

    return runs
  })
}
