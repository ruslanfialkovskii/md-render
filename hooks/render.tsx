import type { ElementTable, RenderChildren, RenderElement } from 'claude-code'

import { runsWidth, script, toRuns } from './inline'
import type { InlineContext, Run, RunStyle } from './inline'
import type { Picture } from './images'
import { diagramRuns } from './mermaid'
import { soleImage } from './parse'
import type { Block, Footnote, ListItem, TableBlock } from './parse'
import { CALLOUTS, CHECK_COLORS, COLOR, HEADINGS, QUOTE_BARS, iconsFor } from './style'
import type { Options } from './style'
import { fit, layoutTable } from './table'
import { cells } from './width'

// The column the reply's bullet sits in; the engine draws neither the bullet
// nor the indent around a plugin's tree.
const GUTTER = 2
// Columns of indent per heading level below H1 when `indent` is on.
const INDENT = 2
const JUSTIFY = { left: 'flex-start', center: 'center', right: 'flex-end' } as const
const TABLE_GAP = 2
// Code's source and each string child of a Text are capped at 10000
// characters; one longer string refuses the whole reply, so long text is split.
const CHUNK = 9000

export type RenderOptions = {
  width: number
  isFirstOfReply: boolean
  options: Options
  math: { inline: (tex: string) => string; display: (tex: string) => string[] }
  // Loaded pictures by href, for image-only paragraphs.
  pictures: ReadonlyMap<string, Picture>
  // mermaid-ascii output by diagram source, for mermaid code blocks.
  diagrams: ReadonlyMap<string, string[]>
}

// Where a block is drawn: the columns it has, and how deep in lists and quotes.
type Place = { room: number; list: number; quote: number }

export function renderMarkdown(
  table: ElementTable<'terminal'>,
  blocks: Block[],
  { width, isFirstOfReply, options, math, pictures, diagrams }: RenderOptions,
): RenderElement {
  const { Box, Text, Code, Link, Image } = table
  const icons = iconsFor(options)
  const inline: InlineContext = { icons, links: options.links, math: math.inline }

  // Runs as Text children; a stretch of runs with one href is one Link.
  const draw = (runs: readonly Run[]): RenderChildren[] => {
    const out: RenderChildren[] = []
    for (let i = 0; i < runs.length; ) {
      const href = runs[i]!.href
      let end = i + 1
      while (href && end < runs.length && runs[end]!.href === href) end++
      const texts = runs.slice(i, end).map(run =>
        Object.keys(run.style).length > 0 ? <Text {...run.style}>{pieces(run.text)}</Text> : pieces(run.text),
      )
      out.push(href ? <Link href={href}>{texts}</Link> : texts)
      i = end
    }

    return out
  }

  // A row of half blocks in a background's colour: a thin border above (▄) or
  // below (▀) a tinted block.
  const edge = (char: string, color: string, columns: number): RenderElement => (
    <Text color={color}>{char.repeat(Math.max(1, columns))}</Text>
  )

  // A tinted block: across the room, or (`isBlock`) sized to its content of
  // `columns` cells; with half-block border lines when `borders`.
  const tinted = (
    background: string,
    isBlock: boolean,
    borders: boolean,
    columns: number,
    children: RenderChildren,
  ): RenderElement => (
    <Box flexDirection="column">
      {borders ? edge('▄', background, columns) : null}
      <Box
        flexDirection="column"
        backgroundColor={background}
        paddingX={1}
        {...(isBlock ? { alignSelf: 'flex-start' } : {})}
      >
        {children}
      </Box>
      {borders ? edge('▀', background, columns) : null}
    </Box>
  )

  const heading = (b: Extract<Block, { kind: 'heading' }>, place: Place): RenderElement => {
    const { color, backgroundColor } = HEADINGS[b.level - 1] ?? HEADINGS[HEADINGS.length - 1]!
    const style: RunStyle = { bold: true, color }
    const runs = toRuns([{ kind: 'text', text: icons.headings[b.level - 1] ?? '' }, ...b.inline], inline, style)
    const title = <Text>{draw(runs)}</Text>
    if (options.headings === 'plain') return title

    const isBlock = options.headings === 'block'
    const columns = isBlock ? Math.min(place.room, runsWidth(runs) + 2) : place.room

    return tinted(backgroundColor, isBlock, options.headingBorders, columns, title)
  }

  const codeBlock = (b: Extract<Block, { kind: 'code' }>, place: Place): RenderElement => {
    const source = b.source.replace(/\n+$/, '') || ' '
    // A mermaid block mermaid-ascii could read is drawn as its diagram.
    const diagram = b.lang === 'mermaid' ? diagrams.get(b.source) : undefined
    const parts = diagram
      ? diagramRuns(diagram).map(line => <Text wrap="truncate-end">{draw(line)}</Text>)
      : chunk(source, CHUNK).map(part =>
          b.lang ? <Code source={part} language={b.lang} /> : <Code source={part} />,
        )
    const language = icons.language(b.lang)
    const name = [b.lang, b.info].filter(Boolean).join(' ')
    const header = name ? (
      <Text>
        {language ? <Text color={language.color}>{language.icon} </Text> : null}
        <Text color={COLOR.codeInfo}>{name}</Text>
      </Text>
    ) : null

    if (options.codeBlocks === 'plain') return <Box flexDirection="column">{parts}</Box>
    if (options.codeBlocks === 'box') {
      return (
        <Box flexDirection="column" borderStyle="round" borderDimColor paddingX={1}>
          {header}
          {parts}
        </Box>
      )
    }

    // Without border lines the fence rows stay as tinted rows, the top one
    // carrying the language.
    const isBlock = options.codeBlocks === 'block'
    const longest = Math.max(cells(name) + 2, ...(diagram ?? source.split('\n')).map(line => cells(line)))
    const columns = isBlock ? Math.min(place.room, longest + 2) : place.room
    const fence = options.codeBorders ? [] : [<Text> </Text>]

    return tinted(COLOR.blockBackground, isBlock, options.codeBorders, columns, [
      ...(header ? [header] : fence),
      ...parts,
      ...fence,
    ])
  }

  // A coloured bar down the left side: an empty Box painted with a background.
  const barred = (color: string, children: RenderChildren): RenderElement => (
    <Box flexDirection="row">
      <Box width={1} flexShrink={0} backgroundColor={color} />
      <Box flexDirection="column" flexGrow={1} flexShrink={1} paddingLeft={1}>
        {children}
      </Box>
    </Box>
  )

  const withMarker = (marker: RenderElement, markerWidth: number, body: RenderElement): RenderElement => (
    <Box flexDirection="row">
      <Box width={markerWidth} flexShrink={0}>
        {marker}
      </Box>
      <Box flexDirection="column" flexGrow={1} flexShrink={1}>
        {body}
      </Box>
    </Box>
  )

  const list = (b: Extract<Block, { kind: 'list' }>, place: Place): RenderElement => {
    // A Nerd Font glyph draws two cells wide over its trailing space: give it 3.
    const markerOf = (item: ListItem, n: number) => {
      if (item.check !== null) {
        return { text: icons.checks[item.check]!.trimEnd(), color: CHECK_COLORS[item.check]!, width: 3 }
      }
      const text = b.ordered ? `${b.start + n}.` : icons.bullets[place.list % icons.bullets.length]!

      return { text, color: COLOR.marker, width: cells(text) + 1 }
    }
    const markers = b.items.map(markerOf)
    const markerWidth = Math.max(...markers.map(marker => marker.width))
    const inner = { ...place, room: place.room - markerWidth, list: place.list + 1 }

    return (
      <Box flexDirection="column" gap={b.loose ? 1 : 0}>
        {b.items.map((item, n) =>
          withMarker(
            <Text color={markers[n]!.color}>{markers[n]!.text}</Text>,
            markerWidth,
            stack(item.blocks, inner, b.loose ? 1 : 0),
          ),
        )}
      </Box>
    )
  }

  const grid = (b: TableBlock, place: Place): RenderElement => {
    if (options.tables === 'compact') return compactTable(b, place)
    const lines = layoutTable(b, place.room, inline, { lines: options.tables, border: options.tableBorders })

    return (
      <Box flexDirection="column">
        {lines.map(line => (
          <Text wrap="truncate-end">{draw(line)}</Text>
        ))}
      </Box>
    )
  }

  // Columns as Boxes the terminal wraps, a rule under the header, no borders.
  const compactTable = (b: TableBlock, place: Place): RenderElement => {
    const head = b.head.map(cell => toRuns(cell, inline, { bold: true }))
    const rows = b.rows.map(row => b.head.map((_, k) => toRuns(row[k] ?? [], inline)))
    const natural = head.map((_, k) => Math.max(3, ...[head, ...rows].map(row => runsWidth(row[k]!))))
    const widths = fit(natural, natural, place.room - TABLE_GAP * (head.length - 1))
    const row = (cellRuns: readonly Run[][]) => (
      <Box flexDirection="row" gap={TABLE_GAP}>
        {widths.map((w, k) => (
          <Box width={w} flexShrink={0} justifyContent={JUSTIFY[b.align[k] ?? 'left']}>
            <Text>{draw(cellRuns[k]!)}</Text>
          </Box>
        ))}
      </Box>
    )

    return (
      <Box flexDirection="column">
        {row(head)}
        <Text color={COLOR.rule}>{widths.map(w => '─'.repeat(w)).join('─'.repeat(TABLE_GAP))}</Text>
        {rows.map(row)}
      </Box>
    )
  }

  // A picture scaled down to the room, aspect kept, its alt text under it.
  const drawPicture = (picture: Picture, alt: string, place: Place): RenderElement => {
    const columns = Math.min(picture.columns, place.room)
    const rows = Math.max(1, Math.round((picture.rows * columns) / picture.columns))

    return (
      <Box flexDirection="column">
        <Image source={picture.source} columns={columns} rows={rows} alt={alt || ' '} />
        {alt ? (
          <Text color={COLOR.linkDim}>
            {icons.image}
            {pieces(alt)}
          </Text>
        ) : null}
      </Box>
    )
  }

  const footnotes = (notes: readonly Footnote[], place: Place): RenderElement => {
    const markerWidth = Math.max(...notes.map(note => String(note.index).length)) + 1
    const inner = { ...place, room: place.room - markerWidth }

    return (
      <Box flexDirection="column">
        <Text color={COLOR.linkDim}>
          {icons.footnote}Footnotes {'─'.repeat(Math.max(1, place.room - 13))}
        </Text>
        {notes.map(note =>
          withMarker(
            <Text color={COLOR.link}>{script(String(note.index), 'sup')}</Text>,
            markerWidth,
            stack(note.blocks, inner, 0),
          ),
        )}
      </Box>
    )
  }

  const block = (b: Block, place: Place): RenderElement => {
    const quoted = { ...place, room: place.room - 2, quote: place.quote + 1 }

    switch (b.kind) {
      case 'heading':
        return heading(b, place)
      case 'paragraph': {
        const image = soleImage(b.inline)
        const picture = image && pictures.get(image.href)
        if (image && picture) return drawPicture(picture, image.alt, place)

        return <Text>{draw(toRuns(b.inline, inline))}</Text>
      }
      case 'code':
        return codeBlock(b, place)
      case 'math':
        // Display math, centred; its lines keep their alignment to each other.
        return (
          <Box justifyContent="center">
            <Box flexDirection="column">
              {math.display(b.tex).map(row => (
                <Text color={COLOR.math} wrap="truncate-end">
                  {pieces(row)}
                </Text>
              ))}
            </Box>
          </Box>
        )
      case 'rule':
        return <Text color={COLOR.rule}>{'─'.repeat(Math.max(1, place.room))}</Text>
      case 'quote':
        return barred(QUOTE_BARS[place.quote % QUOTE_BARS.length]!, stack(b.blocks, quoted, 1))
      case 'callout': {
        const callout = CALLOUTS[b.type]!
        const title = b.title.length > 0 ? b.title : [{ kind: 'text' as const, text: callout.label }]
        const runs = toRuns([{ kind: 'text', text: icons.callout(b.type) }, ...title], inline, {
          bold: true,
          color: callout.color,
        })

        return barred(
          callout.color,
          <>
            <Text>{draw(runs)}</Text>
            {stack(b.blocks, quoted, 1)}
          </>,
        )
      }
      case 'list':
        return list(b, place)
      case 'table':
        return grid(b, place)
      case 'footnotes':
        return footnotes(b.notes, place)
    }
  }

  const stack = (items: readonly Block[], place: Place, gap: number): RenderElement => (
    <Box flexDirection="column" gap={gap}>
      {items.map(b => block(b, { ...place, room: Math.max(10, place.room) }))}
    </Box>
  )

  // The reply's top level: with `indent`, each section shifts right by its
  // heading's level, the heading included (org-indent, from H2 on).
  const top = (): RenderElement => {
    const room = width - GUTTER
    if (!options.indent) return stack(blocks, { room, list: 0, quote: 0 }, 1)

    let level = 1
    return (
      <Box flexDirection="column" gap={1}>
        {blocks.map(b => {
          if (b.kind === 'heading') level = b.level
          const indent = INDENT * Math.max(0, level - 1)

          return (
            <Box flexDirection="column" paddingLeft={indent}>
              {block(b, { room: Math.max(10, room - indent), list: 0, quote: 0 })}
            </Box>
          )
        })}
      </Box>
    )
  }

  return (
    <Box flexDirection="row">
      <Box width={GUTTER} flexShrink={0}>
        {isFirstOfReply ? <Text color={COLOR.bullet}>⏺</Text> : null}
      </Box>
      {top()}
    </Box>
  )
}

function pieces(text: string): string[] {
  const parts: string[] = []
  for (let k = 0; k < text.length; k += CHUNK) parts.push(text.slice(k, k + CHUNK))

  return parts
}

function chunk(source: string, size: number): string[] {
  const parts: string[] = []
  let lines: string[] = []
  let length = 0
  for (const line of source.split('\n')) {
    for (let k = 0; k < Math.max(1, line.length); k += size) {
      const piece = line.slice(k, k + size)
      if (lines.length > 0 && length + 1 + piece.length > size) {
        parts.push(lines.join('\n'))
        lines = []
        length = 0
      }
      length += (lines.length > 0 ? 1 : 0) + piece.length
      lines.push(piece)
    }
  }
  parts.push(lines.join('\n'))

  return parts
}
