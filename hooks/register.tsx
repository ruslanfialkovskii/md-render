import type { EngineInterface, RenderElement, Register } from 'claude-code'

import { fitCells, hash, locate, readSips } from './images'
import type { Picture } from './images'
import { displayMath, inlineMath } from './latex'
import { diagramSource } from './mermaid'
import { eachBlock, parseMarkdown, soleImage } from './parse'
import { renderMarkdown } from './render'
import { resolveOptions } from './style'

// Drawn trees by (width, bullet, text): a message redraws on every scroll and
// resize, its text changing only while it streams. Oldest entry goes first.
const CACHE_SIZE = 64

export const register: Register = (on, raw) => {
  if (raw.enabled === false) return

  // A change in /config reloads the module, so options are read once here.
  const options = resolveOptions(raw)
  const math =
    options.math === 'unicode'
      ? { inline: inlineMath, display: displayMath }
      : { inline: (tex: string) => tex, display: (tex: string) => tex.split('\n') }
  const cache = new Map<string, RenderElement>()

  // Terminal only: the desktop and IDE surfaces draw markdown natively.
  on('ui.render', { component: 'AssistantMessage', surface: 'terminal' }, async ($, e, next) => {
    const { text, isFirstOfReply } = e.props
    if (text.trim() === '') return next(e)
    const width = Math.max(20, e.viewport?.columns ?? 80)
    const key = `${width}:${isFirstOfReply ? 1 : 0}:${text}`

    let tree = cache.get(key)
    if (tree) {
      cache.delete(key)
    } else {
      const blocks = parseMarkdown(text)
      // An image alone in its paragraph is drawn as a picture, once loaded.
      const pictures = new Map<string, Picture>()
      if (options.images !== 'off') {
        const hrefs = new Set<string>()
        eachBlock(blocks, block => {
          const image = block.kind === 'paragraph' ? soleImage(block.inline) : undefined
          if (image) hrefs.add(image.href)
        })
        const mode = options.images === 'remote' ? 'remote' : 'local'
        for (const href of hrefs) {
          const picture = await loadPicture($, href, mode)
          if (picture) pictures.set(href, picture)
        }
      }
      // A mermaid block is drawn as a diagram when mermaid-ascii reads it.
      const diagrams = new Map<string, string[]>()
      if (options.mermaid === 'ascii') {
        const sources = new Set<string>()
        eachBlock(blocks, block => {
          if (block.kind === 'code' && block.lang === 'mermaid') sources.add(block.source)
        })
        for (const source of sources) {
          const lines = await loadDiagram($, source, options.mermaidCommand)
          if (lines) diagrams.set(source, lines)
        }
      }
      tree = renderMarkdown($.ui.resolve(e), blocks, { width, isFirstOfReply, options, math, pictures, diagrams })
      if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value!)
    }
    cache.set(key, tree)

    return tree
  }).catch(($, e, next) => next(e))
}

// One load per href while it succeeds: a message redraws many times. A failed
// load is forgotten, so a file that appears later is drawn on a later redraw.
const loads = new Map<string, Promise<Picture | undefined>>()

function loadPicture($: EngineInterface, href: string, mode: 'local' | 'remote'): Promise<Picture | undefined> {
  const key = `${mode}:${href}`
  let load = loads.get(key)
  if (!load) {
    load = readPicture($, href, mode)
      .catch(() => undefined)
      .then(picture => {
        if (!picture) loads.delete(key)

        return picture
      })
    loads.set(key, load)
  }

  return load
}

// Measures the file with `sips` and converts it to PNG when it is not one;
// the terminal reads the PNG itself. Downloads first, for a remote URL.
async function readPicture($: EngineInterface, href: string, mode: 'local' | 'remote'): Promise<Picture | undefined> {
  const home = (await $.env.get('HOME')) ?? ''
  const cwd = (await $.process.run(['pwd'])).stdout.trim()
  const where = locate(href, mode, { home, cwd })
  if (!where) return undefined

  const cacheDir = `${(await $.env.get('TMPDIR')) ?? '/tmp/'}`.replace(/\/?$/, '/md-render')
  let path: string
  if ('url' in where) {
    path = `${cacheDir}/${hash(where.url)}`
    await $.process.run(['mkdir', '-p', cacheDir])
    // https only, redirects included: the check on the URL must hold for where it lands.
    const curl = ['curl', '-sSfL', '--proto', '=https', '--proto-redir', '=https', '--max-redirs', '3']
    const limits = ['--max-time', '10', '--max-filesize', '20000000']
    const download = await $.process.run([...curl, ...limits, '-o', path, where.url], { timeoutMs: 15_000 })
    if (download.exitCode !== 0) return undefined
  } else {
    path = where.path
  }

  const info = await $.process.run(['sips', '-g', 'pixelWidth', '-g', 'pixelHeight', '-g', 'format', path])
  const size = info.exitCode === 0 ? readSips(info.stdout) : undefined
  if (!size) return undefined

  let png = path
  if (size.format !== 'png') {
    png = `${cacheDir}/${hash(path)}.png`
    await $.process.run(['mkdir', '-p', cacheDir])
    const convert = await $.process.run(['sips', '-s', 'format', 'png', path, '--out', png])
    if (convert.exitCode !== 0) return undefined
  }

  return { source: { file: png, format: 'png' }, ...fitCells(size.width, size.height) }
}

// One conversion per diagram source while it succeeds.
const diagrams = new Map<string, Promise<string[] | undefined>>()

function loadDiagram($: EngineInterface, source: string, command: string): Promise<string[] | undefined> {
  const key = `${command}\n${source}`
  let load = diagrams.get(key)
  if (!load) {
    load = readDiagram($, source, command)
      .catch(() => undefined)
      .then(lines => {
        if (!lines) diagrams.delete(key)

        return lines
      })
    diagrams.set(key, load)
  }

  return load
}

// The configured mermaid-ascii; for the default name, also where mise installs
// it, since a mise tool is often missing from Claude Code's PATH. Undefined
// when none runs or it cannot read the diagram (it draws flowcharts, sequence
// and ER diagrams).
async function readDiagram($: EngineInterface, source: string, command: string): Promise<string[] | undefined> {
  const home = (await $.env.get('HOME')) ?? ''
  const mise = `${home}/.local/share/mise/installs/mermaid-ascii/latest/mermaid-ascii`
  const binaries = command === 'mermaid-ascii' ? [command, mise] : [command]
  for (const binary of binaries) {
    const run = await $.process
      .run([binary, '-f', '-', '-x', '5', '-y', '1'], { stdin: diagramSource(source), timeoutMs: 10_000 })
      .catch(() => undefined)
    if (run?.exitCode === 0 && run.stdout.trim()) return run.stdout.replace(/\s+$/, '').split('\n').map(line => line.trimEnd())
  }

  return undefined
}
