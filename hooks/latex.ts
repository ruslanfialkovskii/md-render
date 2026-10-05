// TeX math to Unicode text, built in, so formulas need no external converter.
// Inline math becomes one line (`∑ᵢ₌₁ⁿ xᵢ`, `√(x+1)`, `ℝⁿ`); display math is
// laid out in two dimensions as utftex does: stacked fractions, limits above
// and below big operators, matrices with tall brackets. Pure; never throws:
// input it cannot read comes back as written.

import { toScript } from './scripts'
import { cells } from './width'

const SYMBOLS: Record<string, string> = {
  // Greek
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ϵ', varepsilon: 'ε', zeta: 'ζ', eta: 'η',
  theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ', varkappa: 'ϰ', lambda: 'λ', mu: 'μ', nu: 'ν',
  xi: 'ξ', omicron: 'ο', pi: 'π', varpi: 'ϖ', rho: 'ρ', varrho: 'ϱ', sigma: 'σ', varsigma: 'ς',
  tau: 'τ', upsilon: 'υ', phi: 'ϕ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω', digamma: 'ϝ',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ',
  Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω', aleph: 'ℵ', beth: 'ℶ', gimel: 'ℷ',
  // Binary operators
  pm: '±', mp: '∓', times: '×', div: '÷', cdot: '⋅', ast: '∗', star: '⋆', circ: '∘', bullet: '∙',
  oplus: '⊕', ominus: '⊖', otimes: '⊗', oslash: '⊘', odot: '⊙', cap: '∩', cup: '∪', sqcap: '⊓',
  sqcup: '⊔', vee: '∨', wedge: '∧', lor: '∨', land: '∧', setminus: '∖', wr: '≀', diamond: '⋄',
  triangleleft: '◁', triangleright: '▷', dagger: '†', ddagger: '‡', amalg: '⨿',
  // Relations
  leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠', equiv: '≡', approx: '≈', sim: '∼',
  simeq: '≃', cong: '≅', propto: '∝', ll: '≪', gg: '≫', prec: '≺', succ: '≻', preceq: '⪯',
  succeq: '⪰', subset: '⊂', supset: '⊃', subseteq: '⊆', supseteq: '⊇', subsetneq: '⊊',
  supsetneq: '⊋', sqsubseteq: '⊑', sqsupseteq: '⊒', in: '∈', ni: '∋', notin: '∉', vdash: '⊢',
  dashv: '⊣', models: '⊨', perp: '⊥', mid: '∣', parallel: '∥', asymp: '≍', doteq: '≐', bowtie: '⋈',
  leqslant: '⩽', geqslant: '⩾', lesssim: '≲', gtrsim: '≳', triangleq: '≜', coloneqq: '≔',
  approxeq: '≊', nless: '≮', ngtr: '≯',
  // Arrows
  to: '→', rightarrow: '→', leftarrow: '←', gets: '←', leftrightarrow: '↔', Rightarrow: '⇒',
  Leftarrow: '⇐', Leftrightarrow: '⇔', implies: '⟹', impliedby: '⟸', iff: '⟺', mapsto: '↦',
  longrightarrow: '⟶', longleftarrow: '⟵', longleftrightarrow: '⟷', Longrightarrow: '⟹',
  Longleftarrow: '⟸', Longleftrightarrow: '⟺', longmapsto: '⟼', uparrow: '↑', downarrow: '↓',
  updownarrow: '↕', Uparrow: '⇑', Downarrow: '⇓', nearrow: '↗', searrow: '↘', swarrow: '↙',
  nwarrow: '↖', hookrightarrow: '↪', hookleftarrow: '↩', rightleftharpoons: '⇌', leadsto: '⇝',
  // Miscellaneous
  infty: '∞', partial: '∂', nabla: '∇', forall: '∀', exists: '∃', nexists: '∄', emptyset: '∅',
  varnothing: '∅', neg: '¬', lnot: '¬', top: '⊤', bot: '⊥', angle: '∠', measuredangle: '∡',
  triangle: '△', square: '□', Box: '□', blacksquare: '■', Diamond: '◇', prime: '′', hbar: 'ℏ',
  hslash: 'ℏ', ell: 'ℓ', wp: '℘', Re: 'ℜ', Im: 'ℑ', imath: 'ı', jmath: 'ȷ', sharp: '♯', flat: '♭',
  natural: '♮', clubsuit: '♣', diamondsuit: '♢', heartsuit: '♡', spadesuit: '♠', checkmark: '✓',
  dag: '†', ddag: '‡', S: '§', P: '¶', copyright: '©', pounds: '£', degree: '°', therefore: '∴',
  because: '∵', cdots: '⋯', ldots: '…', dots: '…', dotsc: '…', dotsb: '⋯', vdots: '⋮', ddots: '⋱',
  colon: ':', surd: '√', backslash: '\\', lbrace: '{', rbrace: '}', langle: '⟨', rangle: '⟩',
  lceil: '⌈', rceil: '⌉', lfloor: '⌊', rfloor: '⌋', vert: '|', Vert: '‖', lvert: '|', rvert: '|',
  lVert: '‖', rVert: '‖', '|': '‖', '{': '{', '}': '}', '#': '#', $: '$', '%': '%', '&': '&', _: '_',
  // Spacing
  ',': ' ', ':': ' ', ';': ' ', '>': ' ', ' ': ' ', '!': '', quad: '  ', qquad: '    ',
  enspace: ' ', thinspace: ' ', medspace: ' ', thickspace: ' ',
}

// Big operators: limits go above and below in display math (`stacked`).
const OPERATORS: Record<string, { v: string; stacked: boolean }> = {
  sum: { v: '∑', stacked: true },
  prod: { v: '∏', stacked: true },
  coprod: { v: '∐', stacked: true },
  bigcup: { v: '⋃', stacked: true },
  bigcap: { v: '⋂', stacked: true },
  bigoplus: { v: '⨁', stacked: true },
  bigotimes: { v: '⨂', stacked: true },
  bigvee: { v: '⋁', stacked: true },
  bigwedge: { v: '⋀', stacked: true },
  bigsqcup: { v: '⨆', stacked: true },
  int: { v: '∫', stacked: false },
  iint: { v: '∬', stacked: false },
  iiint: { v: '∭', stacked: false },
  oint: { v: '∮', stacked: false },
}

// Named functions, upright; the ones that take limits below in display math.
const FUNCTIONS = new Set([
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh',
  'coth', 'log', 'ln', 'lg', 'exp', 'arg', 'dim', 'hom', 'ker', 'deg',
])
const LIMIT_FUNCTIONS = new Set(['lim', 'limsup', 'liminf', 'max', 'min', 'sup', 'inf', 'det', 'gcd', 'lcm', 'Pr'])

const ACCENTS: Record<string, string> = {
  hat: '̂', widehat: '̂', check: '̌', tilde: '̃', widetilde: '̃',
  acute: '́', grave: '̀', dot: '̇', ddot: '̈', breve: '̆', bar: '̄',
  vec: '⃗', overrightarrow: '⃗', overline: '̅', underline: '̲',
}
// Accents that mark every character of a longer argument, not only the last.
const SPREAD = new Set(['overline', 'underline'])

const FONTS: Record<string, 'bb' | 'cal' | 'frak' | 'plain'> = {
  mathbb: 'bb', mathcal: 'cal', mathscr: 'cal', mathfrak: 'frak',
  mathbf: 'plain', mathrm: 'plain', mathit: 'plain', mathsf: 'plain', mathtt: 'plain', mathop: 'plain',
  boldsymbol: 'plain', bm: 'plain', text: 'plain', textrm: 'plain', textbf: 'plain', textit: 'plain',
  textsf: 'plain', texttt: 'plain', mbox: 'plain', hbox: 'plain', operatorname: 'plain',
}

// Letterlike symbols that stand in for the gaps of the mathematical alphabets.
const FONT_EXCEPTIONS: Record<'bb' | 'cal' | 'frak', Record<string, string>> = {
  bb: { C: 'ℂ', H: 'ℍ', N: 'ℕ', P: 'ℙ', Q: 'ℚ', R: 'ℝ', Z: 'ℤ' },
  cal: { B: 'ℬ', E: 'ℰ', F: 'ℱ', H: 'ℋ', I: 'ℐ', L: 'ℒ', M: 'ℳ', R: 'ℛ', e: 'ℯ', g: 'ℊ', o: 'ℴ' },
  frak: { C: 'ℭ', H: 'ℌ', I: 'ℑ', R: 'ℜ', Z: 'ℨ' },
}
const FONT_BASE: Record<'bb' | 'cal' | 'frak', [upper: number, lower: number]> = {
  bb: [0x1d538, 0x1d552],
  cal: [0x1d49c, 0x1d4b6],
  frak: [0x1d504, 0x1d51e],
}

const NEGATED: Record<string, string> = { '=': '≠', '∈': '∉', '⊂': '⊄', '⊃': '⊅', '⊆': '⊈', '⊇': '⊉', '≡': '≢', '∼': '≁', '<': '≮', '>': '≯' }

const VULGAR: Record<string, string> = {
  '1/2': '½', '1/3': '⅓', '2/3': '⅔', '1/4': '¼', '3/4': '¾', '1/5': '⅕', '2/5': '⅖', '3/5': '⅗',
  '4/5': '⅘', '1/6': '⅙', '5/6': '⅚', '1/7': '⅐', '1/8': '⅛', '3/8': '⅜', '5/8': '⅝', '7/8': '⅞',
  '1/9': '⅑', '1/10': '⅒',
}

// The delimiters around an environment's rows; none for the others.
const ENVIRONMENTS: Record<string, [left: string, right: string]> = {
  pmatrix: ['(', ')'],
  bmatrix: ['[', ']'],
  Bmatrix: ['{', '}'],
  vmatrix: ['|', '|'],
  Vmatrix: ['‖', '‖'],
  cases: ['{', ''],
}

// A delimiter's top, middle and bottom pieces, for one spanning several rows.
const PIECES: Record<string, [top: string, middle: string, bottom: string]> = {
  '(': ['⎛', '⎜', '⎝'],
  ')': ['⎞', '⎟', '⎠'],
  '[': ['⎡', '⎢', '⎣'],
  ']': ['⎤', '⎥', '⎦'],
  '{': ['⎧', '⎪', '⎩'],
  '}': ['⎫', '⎪', '⎭'],
  '|': ['│', '│', '│'],
  '‖': ['‖', '‖', '‖'],
}

type Node =
  | { k: 'text'; v: string }
  | { k: 'group'; items: Node[] }
  | { k: 'frac'; num: Node[]; den: Node[] }
  | { k: 'binom'; top: Node[]; bottom: Node[] }
  | { k: 'sqrt'; index: Node[]; body: Node[] }
  | { k: 'script'; base: Node; sup?: Node[]; sub?: Node[] }
  | { k: 'op'; v: string; stacked: boolean }
  | { k: 'accent'; mark: string; spread: boolean; body: Node[] }
  | { k: 'font'; font: 'bb' | 'cal' | 'frak' | 'plain'; body: Node[] }
  | { k: 'env'; name: string; rows: Node[][][] }
  | { k: 'delim'; left: string; body: Node[]; right: string }

type Token = { t: 'cmd' | 'char' | 'ws' | '{' | '}' | '^' | '_' | '&' | 'row' | '[' | ']'; v: string }

function tokenize(tex: string): Token[] {
  const tokens: Token[] = []
  for (let i = 0; i < tex.length; ) {
    const char = tex[i]!
    if (char === '\\') {
      const name = /^\\([a-zA-Z]+|.)/.exec(tex.slice(i))
      const v = name?.[1] ?? ''
      tokens.push(v === '\\' ? { t: 'row', v } : { t: 'cmd', v })
      i += 1 + v.length
    } else if (/\s/.test(char)) {
      while (i < tex.length && /\s/.test(tex[i]!)) i++
      tokens.push({ t: 'ws', v: ' ' })
    } else if ('{}^_&[]'.includes(char)) {
      tokens.push({ t: char as Token['t'], v: char })
      i++
    } else {
      const code = tex.codePointAt(i)!
      const v = String.fromCodePoint(code)
      tokens.push({ t: 'char', v })
      i += v.length
    }
  }

  return tokens
}

class Parser {
  private at = 0
  private readonly tokens: Token[]

  constructor(tokens: Token[]) {
    this.tokens = tokens
  }

  private peek(): Token | undefined {
    return this.tokens[this.at]
  }

  private skipSpace(): void {
    while (this.peek()?.t === 'ws') this.at++
  }

  // A sequence of nodes up to a closing brace, `\right`, `\end` or (inside
  // an environment) a cell or row break.
  sequence(stop: (token: Token) => boolean): Node[] {
    const nodes: Node[] = []
    for (let token = this.peek(); token && !stop(token); token = this.peek()) {
      const node = this.scripted()
      if (node) nodes.push(node)
    }

    return nodes
  }

  // An atom and the scripts and primes after it.
  private scripted(): Node | undefined {
    const token = this.peek()!
    let base: Node | undefined
    if (token.t === '^' || token.t === '_') base = { k: 'text', v: '' }
    else base = this.atom()
    if (!base) return undefined

    let sup: Node[] | undefined
    let sub: Node[] | undefined
    for (;;) {
      const next = this.peek()
      if (next?.t === '^' && !sup) {
        this.at++
        sup = this.argument()
      } else if (next?.t === '_' && !sub) {
        this.at++
        sub = this.argument()
      } else if (next?.t === 'char' && next.v === "'") {
        this.at++
        base = { k: 'group', items: [base, { k: 'text', v: '′' }] }
      } else {
        break
      }
    }

    return sup || sub ? { k: 'script', base, ...(sup ? { sup } : {}), ...(sub ? { sub } : {}) } : base
  }

  // One argument: a braced group, or a single atom (`x^2`, `\frac12`).
  argument(): Node[] {
    this.skipSpace()
    const token = this.peek()
    if (!token) return []
    if (token.t === '{') {
      this.at++
      const nodes = this.sequence(next => next.t === '}')
      this.at++

      return nodes
    }
    const atom = this.atom()

    return atom ? [atom] : []
  }

  // Raw text of a braced argument: an environment's name, a colour.
  private word(): string {
    this.skipSpace()
    if (this.peek()?.t !== '{') return ''
    this.at++
    let text = ''
    for (let token = this.peek(); token && token.t !== '}'; token = this.peek()) {
      text += token.t === 'cmd' ? `\\${token.v}` : token.v
      this.at++
    }
    this.at++

    return text
  }

  private atom(): Node | undefined {
    const token = this.peek()!
    this.at++
    switch (token.t) {
      case 'ws':
        return { k: 'text', v: ' ' }
      case 'char':
        return { k: 'text', v: token.v }
      case '[':
      case ']':
        return { k: 'text', v: token.v }
      case '{': {
        const items = this.sequence(next => next.t === '}')
        this.at++

        return { k: 'group', items }
      }
      case '}':
        return undefined
      case '&':
        return { k: 'text', v: ' ' }
      case 'row':
        return { k: 'text', v: '; ' }
      case 'cmd':
        return this.command(token.v)
      default:
        return { k: 'text', v: token.v }
    }
  }

  private command(name: string): Node | undefined {
    if (name in SYMBOLS) return { k: 'text', v: SYMBOLS[name]! }
    if (name in OPERATORS) return { k: 'op', ...OPERATORS[name]! }
    if (FUNCTIONS.has(name)) return { k: 'text', v: name }
    if (LIMIT_FUNCTIONS.has(name)) return { k: 'op', v: name, stacked: true }
    if (name in ACCENTS) return { k: 'accent', mark: ACCENTS[name]!, spread: SPREAD.has(name), body: this.argument() }
    if (name in FONTS) return { k: 'font', font: FONTS[name]!, body: this.argument() }

    switch (name) {
      case 'frac':
      case 'dfrac':
      case 'tfrac':
      case 'cfrac':
        return { k: 'frac', num: this.argument(), den: this.argument() }
      case 'binom':
      case 'dbinom':
      case 'tbinom':
        return { k: 'binom', top: this.argument(), bottom: this.argument() }
      case 'sqrt': {
        let index: Node[] = []
        this.skipSpace()
        if (this.peek()?.t === '[') {
          this.at++
          index = this.sequence(next => next.t === ']')
          this.at++
        }

        return { k: 'sqrt', index, body: this.argument() }
      }
      case 'left': {
        const left = this.delimiter()
        const body = this.sequence(next => next.t === 'cmd' && next.v === 'right')
        this.at++

        return { k: 'delim', left, body, right: this.delimiter() }
      }
      case 'right':
        return undefined
      case 'begin': {
        const env = this.word()
        if (env === 'array') this.word()
        const rows: Node[][][] = [[[]]]
        for (let token = this.peek(); token && !(token.t === 'cmd' && token.v === 'end'); token = this.peek()) {
          const row = rows[rows.length - 1]!
          if (token.t === '&') {
            this.at++
            row.push([])
          } else if (token.t === 'row') {
            this.at++
            rows.push([[]])
          } else {
            const node = this.scripted()
            if (node) row[row.length - 1]!.push(node)
          }
        }
        this.at++
        this.word()
        // A trailing `\\` leaves an empty last row.
        const last = rows[rows.length - 1]!
        if (rows.length > 1 && last.length === 1 && last[0]!.length === 0) rows.pop()

        return { k: 'env', name: env.replace(/\*$/, ''), rows }
      }
      case 'not': {
        const next = this.argument()
        const text = linear(next)

        return { k: 'text', v: NEGATED[text] ?? `${text}̸` }
      }
      case 'big':
      case 'Big':
      case 'bigg':
      case 'Bigg':
      case 'bigl':
      case 'bigr':
      case 'Bigl':
      case 'Bigr':
      case 'biggl':
      case 'biggr':
      case 'Biggl':
      case 'Biggr':
      case 'displaystyle':
      case 'textstyle':
      case 'scriptstyle':
      case 'limits':
      case 'nolimits':
      case 'nonumber':
      case 'notag':
        return { k: 'text', v: '' }
      case 'color':
      case 'label':
        this.word()
        return { k: 'text', v: '' }
      case 'textcolor':
      case 'colorbox':
        this.word()
        return { k: 'group', items: this.argument() }
      case 'phantom':
      case 'hphantom':
      case 'vphantom':
        this.argument()
        return { k: 'text', v: '' }
      case 'boxed':
      case 'fbox':
        return { k: 'group', items: [{ k: 'text', v: '[' }, ...this.argument(), { k: 'text', v: ']' }] }
      case 'overset':
      case 'stackrel': {
        const over = this.argument()

        return { k: 'script', base: { k: 'group', items: this.argument() }, sup: over }
      }
      case 'underset': {
        const under = this.argument()

        return { k: 'script', base: { k: 'group', items: this.argument() }, sub: under }
      }
      case 'overbrace':
      case 'underbrace':
      case 'cancel':
      case 'bcancel':
      case 'xcancel':
      case 'sout':
      case 'substack':
        return { k: 'group', items: this.argument() }
      case 'pmod':
        return { k: 'group', items: [{ k: 'text', v: ' (mod ' }, ...this.argument(), { k: 'text', v: ')' }] }
      case 'bmod':
      case 'mod':
        return { k: 'text', v: ' mod ' }
      case 'tag':
        return { k: 'group', items: [{ k: 'text', v: '    (' }, ...this.argument(), { k: 'text', v: ')' }] }
      default:
        return { k: 'text', v: `\\${name}` }
    }
  }

  // The delimiter after `\left` or `\right`; `.` is none.
  private delimiter(): string {
    this.skipSpace()
    const token = this.peek()
    if (!token) return ''
    this.at++
    if (token.t === 'cmd') return SYMBOLS[token.v] ?? ''
    if (token.v === '.') return ''

    return token.v
  }
}

function parse(tex: string): Node[] {
  return new Parser(tokenize(tex)).sequence(() => false)
}

// ---- one line --------------------------------------------------------------

function linear(nodes: readonly Node[]): string {
  return nodes.map(line).join('')
}

function line(node: Node): string {
  switch (node.k) {
    case 'text':
      return node.v
    case 'group':
      return linear(node.items)
    case 'frac': {
      const num = linear(node.num).trim()
      const den = linear(node.den).trim()
      const simple = (text: string) => /^[\p{L}\p{N}.′]+$/u.test(text)

      return VULGAR[`${num}/${den}`] ?? `${simple(num) ? num : `(${num})`}/${simple(den) ? den : `(${den})`}`
    }
    case 'binom':
      return `C(${linear(node.top).trim()}, ${linear(node.bottom).trim()})`
    case 'sqrt': {
      const body = linear(node.body).trim()
      const index = linear(node.index).trim()
      const root = index === '3' ? '∛' : index === '4' ? '∜' : index ? `${toScript(index, 'sup') ?? `^${index}`}√` : '√'

      return [...body].length === 1 || /^[\p{L}\p{N}]+$/u.test(body) ? `${root}${body}` : `${root}(${body})`
    }
    case 'script': {
      const base = line(node.base)
      const sub = node.sub ? scripted(linear(node.sub).trim(), 'sub') : ''
      const sup = node.sup ? scripted(linear(node.sup).trim(), 'sup') : ''

      return base + sub + sup
    }
    case 'op':
      return node.v
    case 'accent':
      return accent(linear(node.body), node.mark, node.spread)
    case 'font':
      return font(linear(node.body), node.font)
    case 'env':
      return environment(node)
    case 'delim':
      return `${node.left}${linear(node.body)}${node.right}`
  }
}

// A script as Unicode when every character has a form; else ^x or ^(xy).
function scripted(text: string, style: 'sub' | 'sup'): string {
  const mark = style === 'sup' ? '^' : '_'

  return toScript(text, style) ?? ([...text].length === 1 ? `${mark}${text}` : `${mark}(${text})`)
}

function accent(text: string, mark: string, spread: boolean): string {
  const chars = [...text]
  if (chars.length === 0) return mark.trim()
  if (spread) return chars.map(char => char + mark).join('')

  return chars.join('') + mark
}

function font(text: string, style: 'bb' | 'cal' | 'frak' | 'plain'): string {
  if (style === 'plain') return text

  return [...text]
    .map(char => {
      const exception = FONT_EXCEPTIONS[style][char]
      if (exception) return exception
      const [upper, lower] = FONT_BASE[style]
      if (/[A-Z]/.test(char)) return String.fromCodePoint(upper + char.charCodeAt(0) - 65)
      if (/[a-z]/.test(char)) return String.fromCodePoint(lower + char.charCodeAt(0) - 97)
      if (style === 'bb' && /[0-9]/.test(char)) return String.fromCodePoint(0x1d7d8 + char.charCodeAt(0) - 48)

      return char
    })
    .join('')
}

function environment(node: Extract<Node, { k: 'env' }>): string {
  const body = node.rows.map(row => row.map(cell => linear(cell).trim()).join(' ')).join('; ')
  if (node.name === 'cases') return `{ ${body} }`
  const [left, right] = ENVIRONMENTS[node.name] ?? ['', '']

  return `${left}${body}${right}`
}

// ---- two dimensions ----------------------------------------------------------

// Lines of equal width and the line the formula's baseline runs through.
type Box = { rows: string[]; base: number }

const width = (box: Box) => Math.max(0, ...box.rows.map(cells))
const pad = (text: string, size: number) => text + ' '.repeat(Math.max(0, size - cells(text)))
const center = (text: string, size: number) => {
  const space = Math.max(0, size - cells(text))

  return ' '.repeat(Math.floor(space / 2)) + text + ' '.repeat(Math.ceil(space / 2))
}
const flat = (text: string): Box => ({ rows: [text], base: 0 })

// Boxes side by side, baselines aligned.
function beside(boxes: readonly Box[]): Box {
  if (boxes.length === 0) return flat('')
  const above = Math.max(...boxes.map(box => box.base))
  const below = Math.max(...boxes.map(box => box.rows.length - 1 - box.base))
  const rows = Array.from({ length: above + below + 1 }, () => '')
  for (const box of boxes) {
    const size = width(box)
    rows.forEach((_, r) => {
      rows[r] += pad(box.rows[r - (above - box.base)] ?? '', size)
    })
  }

  return { rows, base: above }
}

// Boxes stacked and centred; `base` is the row of the one at `at`.
function stacked(boxes: readonly Box[], at: number): Box {
  const size = Math.max(...boxes.map(width))
  let base = 0
  const rows: string[] = []
  boxes.forEach((box, k) => {
    if (k === at) base = rows.length + box.base
    rows.push(...box.rows.map(row => center(row, size)))
  })

  return { rows, base }
}

function layout(nodes: readonly Node[]): Box {
  return beside(nodes.map(box))
}

function box(node: Node): Box {
  switch (node.k) {
    case 'frac': {
      const num = layout(node.num)
      const den = layout(node.den)
      const bar = flat('─'.repeat(Math.max(width(num), width(den))))

      return stacked([num, bar, den], 1)
    }
    case 'binom': {
      const inner = stacked([layout(node.top), layout(node.bottom)], 0)

      return beside([delimiter(inner, '('), inner, delimiter(inner, ')')])
    }
    case 'script': {
      const sup = node.sup ? linear(node.sup).trim() : ''
      const sub = node.sub ? linear(node.sub).trim() : ''
      const base = box(node.base)
      // A stacked operator takes its limits above and below.
      if (node.base.k === 'op' && node.base.stacked) {
        const parts = [...(sup ? [layout(node.sup!)] : []), base, ...(sub ? [layout(node.sub!)] : [])]

        return stacked(parts, sup ? 1 : 0)
      }
      // Scripts Unicode can write stay on the line; others are raised or lowered.
      const supText = sup ? toScript(sup, 'sup') : ''
      const subText = sub ? toScript(sub, 'sub') : ''
      if (supText !== undefined && subText !== undefined && base.rows.length === 1) {
        return flat(base.rows[0]! + subText + supText)
      }
      const scripts = stacked(
        [...(sup ? [layout(node.sup!)] : []), flat(''), ...(sub ? [layout(node.sub!)] : [])],
        sup ? 1 : 0,
      )

      return beside([base, leftAligned(scripts)])
    }
    case 'env':
      return matrix(node)
    case 'delim': {
      const inner = layout(node.body)
      if (inner.rows.length === 1) return flat(`${node.left}${inner.rows[0]}${node.right}`)

      return beside([delimiter(inner, node.left), inner, delimiter(inner, node.right)])
    }
    case 'group':
      return layout(node.items)
    default:
      return flat(line(node))
  }
}

// Rows with their leading spaces gone, padded back to one width.
function leftAligned(box: Box): Box {
  const rows = box.rows.map(row => row.replace(/^ +/, ''))
  const size = Math.max(...rows.map(cells))

  return { rows: rows.map(row => pad(row, size)), base: box.base }
}

// A delimiter as tall as `inner`: as written on one row; on several its top,
// middle and bottom pieces (a brace with its centre piece), or itself repeated.
function delimiter(inner: Box, char: string): Box {
  const height = inner.rows.length
  const pieces = PIECES[char]
  if (height === 1 || !pieces) return { rows: inner.rows.map(() => char), base: inner.base }
  const [top, middle, bottom] = pieces
  const centre = top === '⎧' ? '⎨' : top === '⎫' ? '⎬' : middle
  const rows = Array.from({ length: height }, (_, r) =>
    r === 0 ? top : r === height - 1 ? bottom : r === Math.floor((height - 1) / 2) ? centre : middle,
  )

  return { rows, base: inner.base }
}

function matrix(node: Extract<Node, { k: 'env' }>): Box {
  const cellsOf = node.rows.map(row => row.map(cell => layout(trimmed(cell))))
  const columns = Math.max(...cellsOf.map(row => row.length))
  const widths = Array.from({ length: columns }, (_, k) => Math.max(0, ...cellsOf.map(row => (row[k] ? width(row[k]) : 0))))
  const isAligned = node.name.startsWith('align') || node.name === 'split' || node.name === 'gather'
  const gap = isAligned ? ' ' : node.name === 'cases' ? '    ' : '  '
  const rows = cellsOf.map(row =>
    beside(
      widths.flatMap((size, k) => {
        const cell = row[k] ?? flat('')
        const padded = {
          rows: cell.rows.map(text => (isAligned && k % 2 === 0 ? ' '.repeat(size - cells(text)) + text : pad(text, size))),
          base: cell.base,
        }

        return k === 0 ? [padded] : [flat(gap), padded]
      }),
    ),
  )
  // Rows trimmed and padded to one width; the baseline runs through the middle.
  const lines = stacked(rows, 0).rows.map(row => row.replace(/\s+$/, ''))
  const size = Math.max(...lines.map(cells))
  const inner: Box = { rows: lines.map(row => pad(row, size)), base: Math.floor((lines.length - 1) / 2) }
  const [left, right] = ENVIRONMENTS[node.name] ?? ['', '']

  return beside([
    ...(left ? [delimiter(inner, left), flat(' ')] : []),
    inner,
    ...(right ? [flat(' '), delimiter(inner, right)] : []),
  ])
}

// A cell without the spaces around it.
function trimmed(nodes: readonly Node[]): Node[] {
  const isSpace = (node: Node | undefined) => node?.k === 'text' && node.v.trim() === ''
  let start = 0
  let end = nodes.length
  while (start < end && isSpace(nodes[start])) start++
  while (end > start && isSpace(nodes[end - 1])) end--

  return nodes.slice(start, end)
}

// ---- entry points --------------------------------------------------------------

// Inline math: one line.
export function inlineMath(tex: string): string {
  try {
    return linear(parse(tex)).replace(/ {2,}/g, ' ').trim()
  } catch {
    return tex
  }
}

// Display math: lines of equal width, laid out in two dimensions.
export function displayMath(tex: string): string[] {
  try {
    const formula = layout(parse(tex.trim()))
    const rows = formula.rows.map(row => row.replace(/\s+$/, ''))
    const size = Math.max(...rows.map(cells))

    return rows.map(row => pad(row, size))
  } catch {
    return tex.split('\n')
  }
}
