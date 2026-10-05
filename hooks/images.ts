// Pictures for image-only paragraphs, the pure half: where an href points,
// what `sips` says about a file, how many cells a picture takes. The loader
// lives in register.tsx, since `$` is never passed across an import.
//
// Local files only by default. `remote` also downloads https images: a reply
// that writes an image URL then makes this machine fetch it, which is how a
// prompt injection leaks data, so it is the person's choice to make.

import type { ImageSource } from 'claude-code'

import { clickableHref } from './links'

export type Picture = { source: ImageSource; columns: number; rows: number }

// Cells are about twice as tall as wide; a picture is at most this big.
const MAX_COLUMNS = 60
const MAX_ROWS = 24
const PIXELS_PER_COLUMN = 8

// Where an href's picture comes from: a file here, a URL to download, or
// nowhere (a URL while only local files are allowed, another scheme).
export function locate(
  href: string,
  mode: 'local' | 'remote',
  place: { home: string; cwd: string },
): { path: string } | { url: string } | undefined {
  if (/^https?:/i.test(href)) {
    const url = mode === 'remote' ? clickableHref(href) : undefined

    return url ? { url } : undefined
  }
  if (href.startsWith('file://')) return { path: decoded(new URL(href).pathname) }
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return undefined
  const path = decoded(href)
  if (path.startsWith('/')) return { path }
  if (path.startsWith('~/')) return { path: `${place.home}${path.slice(1)}` }

  return { path: `${place.cwd}/${path.replace(/^\.\//, '')}` }
}

// `sips -g pixelWidth -g pixelHeight -g format` output, read.
export function readSips(stdout: string): { width: number; height: number; format: string } | undefined {
  const width = Number(/pixelWidth: (\d+)/.exec(stdout)?.[1])
  const height = Number(/pixelHeight: (\d+)/.exec(stdout)?.[1])
  const format = /format: (\w+)/.exec(stdout)?.[1] ?? ''

  return width > 0 && height > 0 ? { width, height, format } : undefined
}

// Cells for a picture of `width` × `height` pixels, aspect kept.
export function fitCells(width: number, height: number): { columns: number; rows: number } {
  let columns = Math.min(MAX_COLUMNS, Math.max(1, Math.round(width / PIXELS_PER_COLUMN)))
  let rows = Math.max(1, Math.round((columns * height) / width / 2))
  if (rows > MAX_ROWS) {
    rows = MAX_ROWS
    columns = Math.max(1, Math.round((rows * 2 * width) / height))
  }

  return { columns, rows }
}

// FNV-1a, for cache file names.
export function hash(text: string): string {
  let value = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    value ^= text.charCodeAt(i)
    value = Math.imul(value, 0x01000193) >>> 0
  }

  return value.toString(16).padStart(8, '0')
}

// Markdown writes a space in a path as %20.
function decoded(path: string): string {
  try {
    return decodeURIComponent(path)
  } catch {
    return path
  }
}
