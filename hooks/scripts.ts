// Unicode superscript and subscript letters. Unicode has no full set: what a
// table lacks cannot be raised or lowered as text.

const SUPERSCRIPT: Record<string, string> = {
  0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹',
  '+': '⁺', '-': '⁻', '−': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
  a: 'ᵃ', b: 'ᵇ', c: 'ᶜ', d: 'ᵈ', e: 'ᵉ', f: 'ᶠ', g: 'ᵍ', h: 'ʰ', i: 'ⁱ', j: 'ʲ', k: 'ᵏ', l: 'ˡ', m: 'ᵐ',
  n: 'ⁿ', o: 'ᵒ', p: 'ᵖ', r: 'ʳ', s: 'ˢ', t: 'ᵗ', u: 'ᵘ', v: 'ᵛ', w: 'ʷ', x: 'ˣ', y: 'ʸ', z: 'ᶻ',
  A: 'ᴬ', B: 'ᴮ', D: 'ᴰ', E: 'ᴱ', G: 'ᴳ', H: 'ᴴ', I: 'ᴵ', J: 'ᴶ', K: 'ᴷ', L: 'ᴸ', M: 'ᴹ', N: 'ᴺ',
  O: 'ᴼ', P: 'ᴾ', R: 'ᴿ', T: 'ᵀ', U: 'ᵁ', V: 'ⱽ', W: 'ᵂ',
  α: 'ᵅ', β: 'ᵝ', γ: 'ᵞ', δ: 'ᵟ', ε: 'ᵋ', ϵ: 'ᵋ', θ: 'ᶿ', ι: 'ᶥ', φ: 'ᵠ', ϕ: 'ᵠ', χ: 'ᵡ',
  '′': '′', '∘': '°',
}

const SUBSCRIPT: Record<string, string> = {
  0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉',
  '+': '₊', '-': '₋', '−': '₋', '=': '₌', '(': '₍', ')': '₎',
  a: 'ₐ', e: 'ₑ', h: 'ₕ', i: 'ᵢ', j: 'ⱼ', k: 'ₖ', l: 'ₗ', m: 'ₘ', n: 'ₙ', o: 'ₒ', p: 'ₚ', r: 'ᵣ',
  s: 'ₛ', t: 'ₜ', u: 'ᵤ', v: 'ᵥ', x: 'ₓ',
  β: 'ᵦ', γ: 'ᵧ', ρ: 'ᵨ', φ: 'ᵩ', ϕ: 'ᵩ', χ: 'ᵪ',
}

// A script inside a script (`e^{-x^2}`) stays at the one level text has.
for (const table of [SUPERSCRIPT, SUBSCRIPT]) {
  for (const char of Object.values(table)) table[char] = char
}

// `text` raised or lowered when every character can be (spaces dropped);
// undefined when one cannot.
export function toScript(text: string, style: 'sub' | 'sup'): string | undefined {
  const table = style === 'sup' ? SUPERSCRIPT : SUBSCRIPT
  const chars = [...text.replace(/\s+/g, '')]
  if (chars.length === 0 || !chars.every(char => char in table)) return undefined

  return chars.map(char => table[char]).join('')
}
