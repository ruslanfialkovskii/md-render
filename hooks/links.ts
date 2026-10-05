// The href a `Link` may carry, or undefined. One href `Link` refuses voids the
// whole reply's drawing, so this mirrors its rules: https (or http://localhost),
// no user@host, no raw `@`, printable ASCII, at most 2048 characters, spelled
// exactly as `new URL(href).href` spells it.
export function clickableHref(href: string): string | undefined {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return undefined
  }
  const isAllowed = url.protocol === 'https:' || (url.protocol === 'http:' && url.hostname === 'localhost')
  if (!isAllowed || url.username !== '' || url.password !== '') return undefined

  // An `@` in a path or query is legal but refused raw: encode it.
  const spelled = url.href.replace(/@/g, '%40')
  try {
    if (new URL(spelled).href !== spelled) return undefined
  } catch {
    return undefined
  }

  return spelled.length <= 2048 && /^[\x21-\x7e]+$/.test(spelled) ? spelled : undefined
}
