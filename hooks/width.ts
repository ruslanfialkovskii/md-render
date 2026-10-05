// Terminal cells a string takes, close to the string-width the terminal layout
// measures with: East Asian wide and fullwidth characters and pictographic
// emoji take two, combining marks and zero-width characters none, the rest
// (Nerd Font glyphs included) one.

const ZERO = /[\p{Mn}\p{Me}​-‏⁠-⁤︀-️]/u
const WIDE = /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦\u{1F300}-\u{1F64F}\u{1F900}-\u{1F9FF}\u{20000}-\u{3FFFD}]/u

export function cells(text: string): number {
  let width = 0
  for (const char of text) {
    if (ZERO.test(char)) continue
    width += WIDE.test(char) ? 2 : 1
  }

  return width
}
