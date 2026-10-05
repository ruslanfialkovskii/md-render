import type { On } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'
import type { Engine, FoundElement } from 'claude-code/testing'

import { fitCells, locate, readSips } from '../hooks/images'
import { toRuns, wrapRuns } from '../hooks/inline'
import { displayMath, inlineMath } from '../hooks/latex'
import type { Run } from '../hooks/inline'
import { clickableHref } from '../hooks/links'
import { parseMarkdown } from '../hooks/parse'
import type { Block, Inline, TableBlock } from '../hooks/parse'
import { iconsFor, resolveOptions } from '../hooks/style'
import { fit, layoutTable } from '../hooks/table'
import { cells } from '../hooks/width'

const REPLY = [
  '# Title',
  '',
  'Some **bold**, *italic*, `code`, ~~gone~~, ==marked== and a [link](https://github.com/a/b).',
  '',
  '1. First',
  '   - nested',
  '2. Second',
  '',
  '- [ ] todo',
  '- [x] done',
  '- [-] later',
  '',
  '> quoted',
  '',
  '> [!WARNING]',
  '> Mind the gap[^gap].',
  '',
  '| Name | Size |',
  '| :--- | ---: |',
  '| a | 1 |',
  '',
  '```ts',
  'const x = 1',
  '```',
  '',
  '$$',
  'E = mc^2',
  '$$',
  '',
  '---',
  '',
  '[^gap]: Between train and platform.',
].join('\n')

const MESSAGE = { component: 'AssistantMessage', props: { text: REPLY, isFirstOfReply: true } } as const

// The inline nodes of a one-paragraph document.
const inline = (text: string): Inline[] => {
  const [first] = parseMarkdown(text)
  if (first?.kind !== 'paragraph') throw new Error(`not a paragraph: ${JSON.stringify(first)}`)

  return first.inline
}

const only = <K extends Block['kind']>(text: string, kind: K): Extract<Block, { kind: K }> => {
  const [first] = parseMarkdown(text)
  if (first?.kind !== kind) throw new Error(`expected ${kind}, got ${JSON.stringify(first)}`)

  return first as Extract<Block, { kind: K }>
}

describe('blocks', () => {
  test('reads every block kind', async () => {
    expect(parseMarkdown(REPLY).map(b => b.kind)).toEqual([
      'heading',
      'paragraph',
      'list',
      'list',
      'quote',
      'callout',
      'table',
      'code',
      'math',
      'rule',
      'footnotes',
    ])
  })

  test('nests a list under an ordered item', async () => {
    const list = only('1. First\n   - nested\n2. Second', 'list')
    expect(list).toMatchObject({ ordered: true, loose: false })
    expect(list.items).toHaveLength(2)
    expect(list.items[0]!.blocks.map(b => b.kind)).toEqual(['paragraph', 'list'])
  })

  test('task items and custom states', async () => {
    const list = only('- [ ] todo\n- [x] done\n- [-] later\n- [?] unknown state', 'list')
    expect(list.items.map(item => item.check)).toEqual(['unchecked', 'checked', '-', null])
    expect(list.items[2]!.blocks).toEqual([{ kind: 'paragraph', inline: [{ kind: 'text', text: 'later' }] }])
  })

  test('callouts: GitHub alerts, Obsidian titles, unknown types stay quotes', async () => {
    expect(only('> [!NOTE]\n> Body text.', 'callout')).toMatchObject({
      type: 'note',
      title: [],
      blocks: [{ kind: 'paragraph' }],
    })
    expect(only('> [!tip]- Custom *title*\n> body', 'callout').title).toEqual([
      { kind: 'text', text: 'Custom ' },
      { kind: 'span', style: 'em', children: [{ kind: 'text', text: 'title' }] },
    ])
    expect(only('> [!FOO]\n> body', 'quote').kind).toBe('quote')
  })

  test('table alignment', async () => {
    expect(only('| a | b | c |\n|:--|--:|:-:|\n| 1 | 2 | 3 |', 'table').align).toEqual(['left', 'right', 'center'])
  })

  test('footnotes are numbered by first reference and listed last', async () => {
    const blocks = parseMarkdown('b[^b] then a[^a]\n\n[^a]: Note A\n[^b]: Note B')
    expect(blocks[0]).toMatchObject({
      inline: [
        { kind: 'text', text: 'b' },
        { kind: 'footnote', index: 1, label: 'b' },
        { kind: 'text', text: ' then a' },
        { kind: 'footnote', index: 2, label: 'a' },
      ],
    })
    expect(blocks[1]).toMatchObject({
      kind: 'footnotes',
      notes: [
        { index: 1, label: 'b' },
        { index: 2, label: 'a' },
      ],
    })
  })

  test('math blocks: $$ fences and ```math', async () => {
    expect(only('$$\n\\frac{a}{b}\n$$', 'math').tex).toBe('\\frac{a}{b}')
    expect(only('```math\nx^2\n```', 'math').tex).toBe('x^2')
  })

  test('HTML: comments vanish, known tags style, unknown tags stay text', async () => {
    expect(parseMarkdown('<!-- hidden -->\n\nshown')).toEqual([
      { kind: 'paragraph', inline: [{ kind: 'text', text: 'shown' }] },
    ])
    expect(inline('Press <kbd>Ctrl</kbd>+<b>C</b> on Vec<T>')).toEqual([
      { kind: 'text', text: 'Press ' },
      { kind: 'span', style: 'kbd', children: [{ kind: 'text', text: 'Ctrl' }] },
      { kind: 'text', text: '+' },
      { kind: 'span', style: 'strong', children: [{ kind: 'text', text: 'C' }] },
      { kind: 'text', text: ' on Vec<T>' },
    ])
  })

  test('half-written input while streaming', async () => {
    expect(parseMarkdown('text\n\n```py\nprint(1)')).toEqual([
      { kind: 'paragraph', inline: [{ kind: 'text', text: 'text' }] },
      { kind: 'code', lang: 'py', info: '', source: 'print(1)' },
    ])
    expect(parseMarkdown('| a | b |\n|---|---|\n| 1')[0]).toMatchObject({ kind: 'table' })
    expect(parseMarkdown('**unclosed bold')).toEqual([
      { kind: 'paragraph', inline: [{ kind: 'text', text: '**unclosed bold' }] },
    ])
  })
})

describe('inline', () => {
  test('emphasis, code, highlight and links', async () => {
    expect(inline('**a** *b* `c` ~~d~~ ==e== [f](https://a.io "t")')).toEqual([
      { kind: 'span', style: 'strong', children: [{ kind: 'text', text: 'a' }] },
      { kind: 'text', text: ' ' },
      { kind: 'span', style: 'em', children: [{ kind: 'text', text: 'b' }] },
      { kind: 'text', text: ' ' },
      { kind: 'code', text: 'c' },
      { kind: 'text', text: ' ' },
      { kind: 'span', style: 'del', children: [{ kind: 'text', text: 'd' }] },
      { kind: 'text', text: ' ' },
      { kind: 'span', style: 'mark', children: [{ kind: 'text', text: 'e' }] },
      { kind: 'text', text: ' ' },
      { kind: 'link', href: 'https://a.io', children: [{ kind: 'text', text: 'f' }] },
    ])
  })

  test('leaves plain text alone', async () => {
    const cases = ['snake_case_name', '2 * 3 * 4', '~5 min', '$5 and $10', 'a == b and c == d', 'export $PATH:$HOME']
    for (const text of cases) {
      expect(inline(text)).toEqual([{ kind: 'text', text }])
    }
  })

  test('math, but not shell variables', async () => {
    expect(inline('so $x^2$ grows')).toEqual([
      { kind: 'text', text: 'so ' },
      { kind: 'math', tex: 'x^2' },
      { kind: 'text', text: ' grows' },
    ])
    expect(inline('cd $HOME/$USER')).toEqual([{ kind: 'text', text: 'cd $HOME/$USER' }])
  })

  test('wiki links, images, reference links and autolinks', async () => {
    expect(inline('[[Page|Alias]] ![logo](https://a.io/l.png)')).toEqual([
      { kind: 'wiki', target: 'Page', label: 'Alias' },
      { kind: 'text', text: ' ' },
      { kind: 'image', href: 'https://a.io/l.png', alt: 'logo' },
    ])
    expect(parseMarkdown('[docs][d]\n\n[d]: https://docs.io')).toEqual([
      { kind: 'paragraph', inline: [{ kind: 'link', href: 'https://docs.io', children: [{ kind: 'text', text: 'docs' }] }] },
    ])
    expect(inline('see www.example.com or me@example.com')).toMatchObject([
      { kind: 'text', text: 'see ' },
      { kind: 'link', href: 'http://www.example.com' },
      { kind: 'text', text: ' or ' },
      { kind: 'link', href: 'mailto:me@example.com' },
    ])
  })

  test('entities decode in prose, not in code', async () => {
    expect(inline('a &amp; b &copy; &#169; `&amp;`')).toEqual([
      { kind: 'text', text: 'a & b © © ' },
      { kind: 'code', text: '&amp;' },
    ])
  })
})

// Stands in for the engine's own drawing beneath the plugin.
const engine = (on: On) => on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine drawing' }))

describe('drawing', () => {
  test('the terminal draws the reply with its own tree and bullet', async $ => {
    const ui = await $.ui.mount({ plugin: 'md-render', surface: 'terminal', ...MESSAGE })
    expect(await ui.drawn()).toMatchObject({ type: 'Box' })
    expect(await ui.find({ type: 'Text', text: '⏺' })).toBeDefined()
    expect(await ui.findAll({ type: 'Code' })).toHaveLength(1)
    expect(await ui.find({ type: 'Text', text: /Warning/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Footnotes/ })).toBeDefined()
    await ui.unmount()
  })

  test('https links are clickable; other links show the URL unless the label is it', async $ => {
    const text = '[runbook](https://example.com/runbook) [old](http://example.com/old) www.example.com me@example.com'
    const ui = await $.ui.mount({
      plugin: 'md-render',
      surface: 'terminal',
      component: 'AssistantMessage',
      props: { text, isFirstOfReply: true },
    })
    expect((await ui.findAll({ type: 'Link' })).map(found => found.props.href)).toEqual(['https://example.com/runbook'])
    const urls = (await ui.findAll({ type: 'Text', text: /^ \(/ })).map(found => found.text)
    expect(urls).toEqual([' (http://example.com/old)'])
    await ui.unmount()
  })

  test('links: url mode shows every URL and draws no Link', { options: { links: 'url' } }, async $ => {
    const ui = await $.ui.mount({
      plugin: 'md-render',
      surface: 'terminal',
      component: 'AssistantMessage',
      props: { text: '[runbook](https://example.com/runbook) www.example.com', isFirstOfReply: true },
    })
    expect(await ui.findAll({ type: 'Link' })).toHaveLength(0)
    const urls = (await ui.findAll({ type: 'Text', text: /^ \(/ })).map(found => found.text)
    expect(urls).toEqual([' (https://example.com/runbook)'])
    await ui.unmount()
  })

  test('awkward hrefs never get the reply refused', async $ => {
    const hrefs = [
      'https://example.com',
      'https://EXAMPLE.com/a b',
      'https://例え.jp/パス?q=値#frag',
      'https://example.com/@user',
      'https://user:pw@example.com/',
      'https://example.com/(paren)',
      'http://localhost:3000/x',
      'javascript:alert(1)',
      './relative/path.md',
      `https://example.com/${'a'.repeat(2100)}`,
    ]
    const text = hrefs.map((href, k) => `[l${k}](<${href}>)`).join(' ')
    const ui = await $.ui.mount({
      plugin: 'md-render',
      surface: 'terminal',
      component: 'AssistantMessage',
      props: { text, isFirstOfReply: true },
    })
    expect(await ui.drawn()).toMatchObject({ type: 'Box' })
    expect(await ui.findAll({ type: 'Link' })).toHaveLength(6)
    await ui.unmount()
  })

  test('a later block of the same reply has no bullet', async $ => {
    const ui = await $.ui.mount({
      plugin: 'md-render',
      surface: 'terminal',
      component: 'AssistantMessage',
      props: { text: 'More text.', isFirstOfReply: false },
    })
    expect(await ui.find({ type: 'Text', text: '⏺' })).toBeUndefined()
    await ui.unmount()
  })

  test('text past the 10000-character child cap still draws', async $ => {
    const text = `${'word '.repeat(2400)}\n\n\`\`\`\n${'x'.repeat(12000)}\n\`\`\``
    const ui = await $.ui.mount({
      plugin: 'md-render',
      surface: 'terminal',
      component: 'AssistantMessage',
      props: { text, isFirstOfReply: true },
    })
    expect(await ui.drawn()).toMatchObject({ type: 'Box' })
    expect(await ui.findAll({ type: 'Code' })).toHaveLength(2)
    await ui.unmount()
  })

  test('other surfaces keep the built-in renderer', async ($, on) => {
    engine(on)
    for (const surface of ['desktop', 'vscode', 'mobile'] as const) {
      const ui = await $.ui.mount({ plugin: 'md-render', surface, ...MESSAGE })
      expect(await ui.find({ text: /engine drawing/ })).toBeDefined()
      await ui.unmount()
    }
  })

  test('the switch off leaves the engine drawing', { options: { enabled: false } }, async ($, on) => {
    engine(on)
    const ui = await $.ui.mount({ plugin: 'md-render', surface: 'terminal', ...MESSAGE })
    expect(await ui.find({ text: /engine drawing/ })).toBeDefined()
    await ui.unmount()
  })
})

describe('cells', () => {
  test('counts terminal cells, not UTF-16 units', async () => {
    expect(cells('abc')).toBe(3)
    expect(cells('\u{F0CA1} Release')).toBe(9)
    expect(cells('例え')).toBe(4)
    expect(cells('é')).toBe(1)
    expect(cells('😀!')).toBe(3)
  })
})

describe('clickableHref', () => {
  test('keeps https and localhost, spelled as URL spells them', async () => {
    expect(clickableHref('https://example.com')).toBe('https://example.com/')
    expect(clickableHref('HTTPS://Example.COM/a b')).toBe('https://example.com/a%20b')
    expect(clickableHref('https://例え.jp/パス')).toBe('https://xn--r8jz45g.jp/%E3%83%91%E3%82%B9')
    expect(clickableHref('https://example.com/@user')).toBe('https://example.com/%40user')
    expect(clickableHref('http://localhost:3000/x')).toBe('http://localhost:3000/x')
  })

  test('refuses everything else', async () => {
    for (const href of [
      'http://example.com',
      'https://user:pw@example.com/',
      'javascript:alert(1)',
      'mailto:me@example.com',
      './relative.md',
      'not a url',
      `https://example.com/${'a'.repeat(2100)}`,
    ]) {
      expect(clickableHref(href)).toBeUndefined()
    }
  })
})

// The Boxes of a drawing that carry a prop, by that prop's value.
const boxesWith = async (ui: { findAll: (query: { type: string }) => Promise<FoundElement[]> }, prop: string) =>
  (await ui.findAll({ type: 'Box' })).map(box => box.props[prop]).filter(value => value !== undefined)

const draw = ($: Engine, text: string) =>
  $.ui.mount({
    plugin: 'md-render',
    surface: 'terminal',
    component: 'AssistantMessage',
    props: { text, isFirstOfReply: true },
  })

const STYLED = '# One\n\n## Two\n\n```python\nprint(1)\n```\n\n> outer\n>\n> > inner\n\n> [!NOTE]\n> body'

describe('options', () => {
  test('defaults: tinted headings and code block, bars by quote depth, Nerd icons', async $ => {
    const ui = await draw($, STYLED)
    const backgrounds = await boxesWith(ui, 'backgroundColor')
    expect(backgrounds).toEqual(
      expect.arrayContaining(['selectionBg', 'diffAddedDimmed', 'composerSidebarBackground', 'inactive', 'permission']),
    )
    expect(await ui.find({ type: 'Text', text: /\u{E606}/u })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /\u{F02FD}/u })).toBeDefined()
    await ui.unmount()
  })

  test(
    'plain headings, boxed code, unicode icons',
    { options: { headings: 'plain', codeBlocks: 'box', icons: 'unicode' } },
    async $ => {
      const ui = await draw($, STYLED)
      const backgrounds = await boxesWith(ui, 'backgroundColor')
      expect(backgrounds).not.toContain('selectionBg')
      expect(backgrounds).not.toContain('composerSidebarBackground')
      expect(await boxesWith(ui, 'borderStyle')).toEqual(['round'])
      expect(await ui.find({ type: 'Text', text: /ℹ Note/ })).toBeDefined()
      await ui.unmount()
    },
  )

  test('border lines and indent', { options: { headingBorders: true, codeBorders: true, indent: true } }, async $ => {
    const ui = await draw($, STYLED)
    expect((await ui.findAll({ type: 'Text', text: /^▄+$/ })).length).toBe(3)
    expect((await ui.findAll({ type: 'Text', text: /^▀+$/ })).length).toBe(3)
    expect(await boxesWith(ui, 'paddingLeft')).toContain(2)
    await ui.unmount()
  })
})

const CONTEXT = { icons: iconsFor(resolveOptions({})), links: 'clickable' as const, math: (tex: string) => tex }
const textOf = (lines: readonly Run[][]) => lines.map(line => line.map(run => run.text).join(''))
const tableOf = (markdown: string) => only(markdown, 'table') as TableBlock

describe('wrapRuns', () => {
  test('wraps words, keeps styles, breaks long words, honours newlines', async () => {
    const runs: Run[] = [
      { text: 'alpha beta ', style: {} },
      { text: 'gamma', style: { bold: true } },
      { text: '\nsupercalifragilistic', style: {} },
    ]
    const lines = wrapRuns(runs, 10)
    expect(textOf(lines)).toEqual(['alpha beta', 'gamma', 'supercalif', 'ragilistic'])
    expect(lines[1]).toEqual([{ text: 'gamma', style: { bold: true } }])
  })

  test('a word runs across styles, so an icon wraps with its label', async () => {
    const runs = toRuns(
      [
        { kind: 'text', text: 'See the ' },
        { kind: 'link', href: 'https://a.io/r', children: [{ kind: 'text', text: 'runbook.' }] },
      ],
      CONTEXT,
    )
    expect(textOf(wrapRuns(runs, 12))).toEqual(['See the', '\u{F059F} runbook.'])
  })

  test('a wide character in a narrow column still moves on', async () => {
    expect(textOf(wrapRuns([{ text: '例例例', style: {} }], 1))).toEqual(['例', '例', '例'])
  })

  test('links keep their href on every wrapped piece', async () => {
    const runs = toRuns([{ kind: 'link', href: 'https://a.io/x', children: [{ kind: 'text', text: 'one two three' }] }], CONTEXT)
    const lines = wrapRuns(runs, 8)
    expect(lines.length).toBeGreaterThan(1)
    expect(lines.flat().every(run => run.href === 'https://a.io/x')).toBe(true)
  })
})

describe('tables', () => {
  test('a square grid with alignment indicators', async () => {
    const lines = layoutTable(tableOf('| a | bb |\n|:--|--:|\n| 1 | 2 |'), 80, CONTEXT, { lines: 'full', border: 'square' })
    expect(textOf(lines)).toEqual([
      '┌───┬────┐',
      '│ a │ bb │',
      '├━──┼───━┤',
      '│ 1 │  2 │',
      '└───┴────┘',
    ])
  })

  test('fit shrinks the widest column first, words before characters', async () => {
    expect(fit([10, 30], [5, 8], 25)).toEqual([10, 15])
    expect(fit([20, 20], [18, 18], 30)).toEqual([15, 15])
    expect(fit([4, 4], [4, 4], 20)).toEqual([4, 4])
  })

  test('a wide table wraps its cells and every line keeps one width', async () => {
    const markdown = [
      '| Service | Notes |',
      '| --- | --- |',
      '| api-gateway | Handles every public request and terminates TLS before routing |',
      '| 名前サービス | 日本語のセル |',
    ].join('\n')
    const lines = layoutTable(tableOf(markdown), 36, CONTEXT, { lines: 'normal', border: 'round' })
    const widths = textOf(lines).map(cells)
    expect(new Set(widths).size).toBe(1)
    expect(widths[0]).toBeLessThanOrEqual(36)
    expect(textOf(lines)[0]!.startsWith('│')).toBe(true)
    expect(lines.length).toBeGreaterThan(4)
  })

  test('drawn as a grid by default, with clickable links in cells', async $ => {
    const markdown = '| a | b |\n|---|---|\n| [x](https://a.io) | 2 |'
    const ui = await draw($, markdown)
    expect(await ui.find({ type: 'Text', text: /┌/ })).toBeDefined()
    expect((await ui.findAll({ type: 'Link' })).map(found => found.props.href)).toEqual(['https://a.io/'])
    await ui.unmount()
  })

  test('round borders', { options: { tableBorders: 'round' } }, async $ => {
    const ui = await draw($, '| a | b |\n|---|---|\n| 1 | 2 |')
    expect(await ui.find({ type: 'Text', text: /╭/ })).toBeDefined()
    await ui.unmount()
  })

  test('compact tables draw no grid', { options: { tables: 'compact' } }, async $ => {
    const ui = await draw($, '| a | b |\n|---|---|\n| 1 | 2 |')
    expect(await ui.find({ type: 'Text', text: /[┌╭│]/ })).toBeUndefined()
    await ui.unmount()
  })
})

describe('math', () => {
  test('inline math becomes one line of Unicode', async () => {
    const cases: [string, string][] = [
      ['e^{i\\pi} + 1 = 0', 'e^(iπ) + 1 = 0'],
      ['\\sum_{i=1}^{n} x_i', '∑ᵢ₌₁ⁿ xᵢ'],
      ['\\frac{1}{2} + \\frac{a+b}{c}', '½ + (a+b)/c'],
      ['\\sqrt{2} \\sqrt{x+1} \\sqrt[3]{y}', '√2 √(x+1) ∛y'],
      ['\\mathbb{R}^n \\to \\mathcal{L}', 'ℝⁿ → ℒ'],
      ['\\alpha \\leq \\beta \\neq \\gamma', 'α ≤ β ≠ γ'],
      ['\\int_0^\\infty e^{-x} dx', '∫₀^∞ e⁻ˣ dx'],
      ["f'(x) \\not= \\hat{y}", 'f′(x) ≠ y\u0302'],
      ['\\text{if } x > 0', 'if x > 0'],
      ['\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}', '(a b; c d)'],
      ['\\unknown{x}', '\\unknownx'],
    ]
    for (const [tex, text] of cases) expect(inlineMath(tex)).toBe(text)
  })

  test('display math stacks fractions and limits', async () => {
    expect(displayMath('\\frac{a+b}{c}')).toEqual(['a+b', '───', ' c ']) 
    expect(displayMath('\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}')).toEqual([
      ' n      n(n+1)',
      ' ∑  i = ──────',
      'i=1       2   ',
    ])
    expect(displayMath('x^2')).toEqual(['x²'])
  })

  test('display math draws matrices and cases with tall delimiters', async () => {
    expect(displayMath('\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}')).toEqual(['⎛ a  b ⎞', '⎝ c  d ⎠'])
    const cases = displayMath('|x| = \\begin{cases} x & x \\geq 0 \\\\ -x & x < 0 \\end{cases}')
    expect(cases).toHaveLength(2)
    expect(cases[0]).toContain('⎧')
    expect(cases[1]).toContain('⎩')
  })

  test('raw mode keeps TeX as written', { options: { math: 'raw' } }, async $ => {
    const ui = await draw($, 'so $x^2$ here')
    expect(await ui.find({ type: 'Text', text: 'x^2' })).toBeDefined()
    await ui.unmount()
  })
})

// Stands in for the engine's env and processes: a home, a working directory,
// and sips reporting a 256 × 128 PNG; curl succeeds.
const machine = (on: On, runs: string[][] = []) => {
  on('env.get', ($, e) => ({ value: e.name === 'HOME' ? '/home/me' : '/tmp/' }))
  on('process.run', ($, e) => {
    runs.push([...e.argv])
    const stdout = e.argv[0] === 'pwd' ? '/work\n' : e.argv[0] === 'sips' ? 'pixelWidth: 256\npixelHeight: 128\nformat: png\n' : ''

    return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
}

describe('images', () => {
  test('locate: local paths, opt-in https, nothing else', async () => {
    const place = { home: '/home/me', cwd: '/work' }
    expect(locate('https://a.io/x.png', 'local', place)).toBeUndefined()
    expect(locate('https://a.io/x.png', 'remote', place)).toEqual({ url: 'https://a.io/x.png' })
    expect(locate('http://a.io/x.png', 'remote', place)).toBeUndefined()
    expect(locate('file:///tmp/a%20b.png', 'local', place)).toEqual({ path: '/tmp/a b.png' })
    expect(locate('~/p.png', 'local', place)).toEqual({ path: '/home/me/p.png' })
    expect(locate('./img/a.png', 'local', place)).toEqual({ path: '/work/img/a.png' })
    expect(locate('data:image/png;base64,AAA', 'local', place)).toBeUndefined()
  })

  test('readSips and fitCells', async () => {
    expect(readSips('  pixelWidth: 256\n  pixelHeight: 128\n  format: jpeg\n')).toEqual({ width: 256, height: 128, format: 'jpeg' })
    expect(readSips('Error: not an image')).toBeUndefined()
    expect(fitCells(256, 256)).toEqual({ columns: 32, rows: 16 })
    expect(fitCells(1024, 1024)).toEqual({ columns: 48, rows: 24 })
    expect(fitCells(1600, 400)).toEqual({ columns: 60, rows: 8 })
  })

  test('an image alone in its paragraph draws as a picture; inline ones stay text', async ($, on) => {
    machine(on)
    const ui = await draw($, '![diagram](docs/arch.png)\n\nInline ![x](y.png) stays text.')
    const images = await ui.findAll({ type: 'Image' })
    expect(images).toHaveLength(1)
    expect(images[0]!.props).toMatchObject({ source: { file: '/work/docs/arch.png', format: 'png' }, columns: 32, rows: 8, alt: 'diagram' })
    await ui.unmount()
  })

  test('remote images are fetched only when opted in', async ($, on) => {
    const runs: string[][] = []
    machine(on, runs)
    const ui = await draw($, '![chart](https://a.io/chart.png)')
    expect(await ui.findAll({ type: 'Image' })).toHaveLength(0)
    expect(runs.some(argv => argv[0] === 'curl')).toBe(false)
    await ui.unmount()
  })

  test('remote opt-in downloads with curl', { options: { images: 'remote' } }, async ($, on) => {
    const runs: string[][] = []
    machine(on, runs)
    const ui = await draw($, '![chart](https://a.io/remote-chart.png)')
    expect(await ui.findAll({ type: 'Image' })).toHaveLength(1)
    expect(runs.find(argv => argv[0] === 'curl')).toContain('https://a.io/remote-chart.png')
    await ui.unmount()
  })

  test('images off draws none', { options: { images: 'off' } }, async ($, on) => {
    machine(on)
    const ui = await draw($, '![diagram](docs/off.png)')
    expect(await ui.findAll({ type: 'Image' })).toHaveLength(0)
    await ui.unmount()
  })
})

describe('mermaid', () => {
  test('a mermaid block draws as its diagram, strokes coloured', async ($, on) => {
    const runs: string[][] = []
    on('env.get', () => ({ value: '/home/me' }))
    on('process.run', ($, e) => {
      runs.push([...e.argv])
      const stdout = e.argv[0] === 'mermaid-ascii' ? '┌───┐\n│ A ├──►\n└───┘\n' : ''

      return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    })
    const ui = await draw($, '```mermaid\nflowchart LR\n  A --> B\n  classDef hot fill:#f00\n```')
    expect(await ui.findAll({ type: 'Code' })).toHaveLength(0)
    expect(await ui.find({ type: 'Text', text: '┌───┐' })).toBeDefined()
    expect(runs.find(argv => argv[0] === 'mermaid-ascii')).toEqual(['mermaid-ascii', '-f', '-', '-x', '5', '-y', '1'])
    await ui.unmount()
  })

  test('without mermaid-ascii the block stays code', async ($, on) => {
    on('env.get', () => ({ value: '/home/me' }))
    on('process.run', () => ({ deny: 'no such command' }))
    const ui = await draw($, '```mermaid\nflowchart LR\n  X --> Y\n```')
    expect(await ui.findAll({ type: 'Code' })).toHaveLength(1)
    await ui.unmount()
  })
})
