// Options, colours and icons, after render-markdown.nvim's defaults (MIT,
// https://github.com/MeanderingProgrammer/render-markdown.nvim). Colours
// are Claude Code theme keys, so they follow the person's theme (light, dark,
// daltonized, ANSI); backgrounds use the theme's own muted tints.

import type { PluginOptions } from 'claude-code'

import { languageIcon } from './languages'

const CHOICES = {
  icons: ['nerd', 'unicode'],
  headings: ['full', 'block', 'plain'],
  codeBlocks: ['full', 'block', 'box', 'plain'],
  tables: ['full', 'normal', 'compact'],
  tableBorders: ['square', 'round', 'double', 'heavy'],
  links: ['clickable', 'url'],
  math: ['unicode', 'raw'],
  images: ['local', 'remote', 'off'],
  mermaid: ['ascii', 'code'],
} as const

type Choice<K extends keyof typeof CHOICES> = (typeof CHOICES)[K][number]

export type Options = {
  icons: Choice<'icons'>
  headings: Choice<'headings'>
  headingBorders: boolean
  codeBlocks: Choice<'codeBlocks'>
  codeBorders: boolean
  tables: Choice<'tables'>
  tableBorders: Choice<'tableBorders'>
  links: Choice<'links'>
  math: Choice<'math'>
  images: Choice<'images'>
  mermaid: Choice<'mermaid'>
  // The mermaid-ascii binary: a name on PATH or a full path.
  mermaidCommand: string
  indent: boolean
}

// The manifest's `userConfig` values; anything unset or unknown takes the
// first choice, which is also the manifest's default.
export function resolveOptions(raw: PluginOptions): Options {
  const pick = <K extends keyof typeof CHOICES>(key: K): Choice<K> => {
    const value = raw[key]
    const choices: readonly string[] = CHOICES[key]

    return (typeof value === 'string' && choices.includes(value) ? value : choices[0]) as Choice<K>
  }

  return {
    icons: pick('icons'),
    headings: pick('headings'),
    headingBorders: raw.headingBorders === true,
    codeBlocks: pick('codeBlocks'),
    codeBorders: raw.codeBorders === true,
    tables: pick('tables'),
    tableBorders: pick('tableBorders'),
    links: pick('links'),
    math: pick('math'),
    images: pick('images'),
    mermaid: pick('mermaid'),
    mermaidCommand:
      typeof raw.mermaidCommand === 'string' && raw.mermaidCommand.trim() ? raw.mermaidCommand.trim() : 'mermaid-ascii',
    indent: raw.indent === true,
  }
}

export const COLOR = {
  bullet: 'text',
  code: 'permission',
  codeBackground: 'userMessageBackground',
  blockBackground: 'composerSidebarBackground',
  codeInfo: 'inactive',
  link: 'suggestion',
  linkDim: 'inactive',
  marker: 'permission',
  math: 'success',
  mark: { color: 'inverseText', backgroundColor: 'warning' },
  rule: 'inactive',
}

// H1..H6: the text colour and the muted tint of the same hue behind it.
export const HEADINGS = [
  { color: 'permission', backgroundColor: 'selectionBg' },
  { color: 'success', backgroundColor: 'diffAddedDimmed' },
  { color: 'warning', backgroundColor: 'diffRemovedDimmed' },
  { color: 'background', backgroundColor: 'memoryBackgroundColor' },
  { color: 'autoAccept', backgroundColor: 'bashMessageBackgroundColor' },
  { color: 'inactive', backgroundColor: 'userMessageBackground' },
]

// The bar of a quote, by how deeply it is nested.
export const QUOTE_BARS = ['inactive', 'permission', 'success', 'warning', 'autoAccept', 'background']

// Checkbox states; a one-character key is a custom state: `[-]`.
export const CHECK_COLORS: Record<string, string> = {
  unchecked: 'permission',
  checked: 'success',
  '-': 'warning',
}

const INFO = 'permission'
const SUCCESS = 'success'
const HINT = 'autoAccept'
const WARN = 'warning'
const ERROR = 'error'
const QUOTE = 'inactive'

// GitHub alerts and Obsidian callouts, keyed by the lower-cased `[!TYPE]`.
export const CALLOUTS: Record<string, { label: string; color: string; nerd: string; unicode: string }> = {
  note: { label: 'Note', color: INFO, nerd: '\u{F02FD} ', unicode: 'ℹ ' },
  tip: { label: 'Tip', color: SUCCESS, nerd: '\u{F0336} ', unicode: '★ ' },
  important: { label: 'Important', color: HINT, nerd: '\u{F017E} ', unicode: '‼ ' },
  warning: { label: 'Warning', color: WARN, nerd: '\u{F002A} ', unicode: '⚠ ' },
  caution: { label: 'Caution', color: ERROR, nerd: '\u{F0CE6} ', unicode: '✖ ' },
  abstract: { label: 'Abstract', color: INFO, nerd: '\u{F0A38} ', unicode: '≡ ' },
  summary: { label: 'Summary', color: INFO, nerd: '\u{F0A38} ', unicode: '≡ ' },
  tldr: { label: 'Tldr', color: INFO, nerd: '\u{F0A38} ', unicode: '≡ ' },
  info: { label: 'Info', color: INFO, nerd: '\u{F02FD} ', unicode: 'ℹ ' },
  todo: { label: 'Todo', color: INFO, nerd: '\u{F05E1} ', unicode: '☐ ' },
  hint: { label: 'Hint', color: SUCCESS, nerd: '\u{F0336} ', unicode: '★ ' },
  success: { label: 'Success', color: SUCCESS, nerd: '\u{F012C} ', unicode: '✔ ' },
  check: { label: 'Check', color: SUCCESS, nerd: '\u{F012C} ', unicode: '✔ ' },
  done: { label: 'Done', color: SUCCESS, nerd: '\u{F012C} ', unicode: '✔ ' },
  question: { label: 'Question', color: WARN, nerd: '\u{F0625} ', unicode: '? ' },
  help: { label: 'Help', color: WARN, nerd: '\u{F0625} ', unicode: '? ' },
  faq: { label: 'Faq', color: WARN, nerd: '\u{F0625} ', unicode: '? ' },
  attention: { label: 'Attention', color: WARN, nerd: '\u{F002A} ', unicode: '⚠ ' },
  failure: { label: 'Failure', color: ERROR, nerd: '\u{F0156} ', unicode: '✘ ' },
  fail: { label: 'Fail', color: ERROR, nerd: '\u{F0156} ', unicode: '✘ ' },
  missing: { label: 'Missing', color: ERROR, nerd: '\u{F0156} ', unicode: '✘ ' },
  danger: { label: 'Danger', color: ERROR, nerd: '\u{F140C} ', unicode: '✖ ' },
  error: { label: 'Error', color: ERROR, nerd: '\u{F140C} ', unicode: '✖ ' },
  bug: { label: 'Bug', color: ERROR, nerd: '\u{F0A30} ', unicode: '✱ ' },
  example: { label: 'Example', color: HINT, nerd: '\u{F0279} ', unicode: '❖ ' },
  quote: { label: 'Quote', color: QUOTE, nerd: '\u{F11A8} ', unicode: '❝ ' },
  cite: { label: 'Cite', color: QUOTE, nerd: '\u{F11A8} ', unicode: '❝ ' },
}

export type Icons = {
  headings: string[]
  bullets: string[]
  checks: Record<string, string>
  callout: (type: string) => string
  footnote: string
  image: string
  wiki: string
  link: (href: string) => string
  language: (lang: string) => { icon: string; color: string } | undefined
}

// Nerd Font glyphs are written as code points; the trailing space gives a
// glyph that draws two cells wide room to do so.
const NERD_LINKS = {
  email: '\u{F0013} ',
  hyperlink: '\u{F0339} ',
  web: '\u{F059F} ',
}

// Matched against the link's host; the longest matching domain wins.
const NERD_DOMAINS: Record<string, string> = {
  'apple.com': '\u{E635} ',
  'discord.com': '\u{F066F} ',
  'github.com': '\u{F02A4} ',
  'gitlab.com': '\u{F0BA0} ',
  'google.com': '\u{F02AD} ',
  'ycombinator.com': '\u{F2E5} ',
  'linkedin.com': '\u{F033B} ',
  'microsoft.com': '\u{ED04} ',
  'neovim.io': '\u{E6AE} ',
  'reddit.com': '\u{F044D} ',
  'slack.com': '\u{F04B1} ',
  'stackoverflow.com': '\u{F04CC} ',
  'steampowered.com': '\u{F1B6} ',
  'twitter.com': '\u{F099} ',
  'wikipedia.org': '\u{F05AC} ',
  'x.com': '\u{E8C9} ',
  'youtube.com': '\u{F05C3} ',
  'youtu.be': '\u{F05C3} ',
}

function nerdLink(href: string): string {
  if (href.startsWith('mailto:')) return NERD_LINKS.email
  if (!/^https?:\/\//i.test(href)) return NERD_LINKS.hyperlink

  const host = /^https?:\/\/([^/?#:]+)/i.exec(href)?.[1]?.toLowerCase() ?? ''
  const domain = Object.keys(NERD_DOMAINS)
    .filter(name => host === name || host.endsWith(`.${name}`))
    .sort((a, b) => b.length - a.length)[0]

  return domain ? NERD_DOMAINS[domain]! : NERD_LINKS.web
}

const NERD: Icons = {
  headings: ['\u{F0CA1} ', '\u{F0CA3} ', '\u{F0CA5} ', '\u{F0CA7} ', '\u{F0CA9} ', '\u{F0CAB} '],
  bullets: ['●', '○', '◆', '◇'],
  checks: { unchecked: '\u{F0131} ', checked: '\u{F0C52} ', '-': '\u{F0954} ' },
  callout: type => CALLOUTS[type]?.nerd ?? '',
  footnote: '\u{F0BD4} ',
  image: '\u{F0976} ',
  wiki: '\u{F15D6} ',
  link: nerdLink,
  language: languageIcon,
}

// For terminals without a Nerd Font: one-cell symbols, no language icons.
const UNICODE: Icons = {
  headings: ['◉ ', '◎ ', '○ ', '◆ ', '◇ ', '▪ '],
  bullets: ['●', '○', '◆', '◇'],
  checks: { unchecked: '☐ ', checked: '☑ ', '-': '◐ ' },
  callout: type => CALLOUTS[type]?.unicode ?? '',
  footnote: '† ',
  image: '▣ ',
  wiki: '⧉ ',
  link: href => (href.startsWith('mailto:') ? '✉ ' : '↗ '),
  language: () => undefined,
}

export function iconsFor(options: Options): Icons {
  return options.icons === 'nerd' ? NERD : UNICODE
}
