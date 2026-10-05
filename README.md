# md-render

A [Claude Code mod](https://code.claude.com/docs/en/plugins/mods/overview) that
draws Claude's replies in the terminal as rich markdown, after
[render-markdown.nvim](https://github.com/MeanderingProgrammer/render-markdown.nvim):
tinted headings, highlighted code, callouts, grid tables, math, mermaid
diagrams and images.

md-render replaces only how a reply is drawn. The stored reply and what Claude
reads stay as they were, ctrl+o still shows the raw text, and the desktop app
and IDE extensions keep their own renderer.

```text
╭─────────────┬──────────┬────────┬──────────╮
│ Service     │ Replicas │    p99 │  Status  │
├━────────────┼─────────━┼───────━┼━────────━┤
│ api-gateway │        3 │ 182 ms │    ok    │
│ auth        │        2 │ 340 ms │ degraded │
╰─────────────┴──────────┴────────┴──────────╯

                     n
      P(fail) = 1 -  ∏  (1 - pᵢ)
                    i=1
```

## Requirements

- Claude Code 2.1.287 or later, in a terminal. Mods are an early-access
  feature: their API may change between releases, and Anthropic can turn
  installed mods off remotely, in which case Claude Code's own renderer draws
  replies.
- A [Nerd Font](https://www.nerdfonts.com/) for the default icons, or set
  `icons` to `unicode`.
- Optional: [mermaid-ascii](https://github.com/AlexanderGrooff/mermaid-ascii)
  for mermaid diagrams; macOS `sips` and a terminal with kitty graphics
  (Ghostty, kitty) for images.

## Install

In a Claude Code session:

```text
/plugin install md-render --marketplace ruslanfialkovskii/md-render
```

Or from your shell:

```sh
claude plugin marketplace add ruslanfialkovskii/md-render
claude plugin install md-render@md-render
```

`/plugin` then shows `1 mod active · md-render` under its tabs. Update with
`claude plugin update md-render@md-render`.

## What it draws

| Element | Drawing |
| --- | --- |
| Headings | Level icon, colour and tinted bar (full width or behind the title), optional half-block border lines |
| Code blocks | Tinted block with the language's icon and name and Claude Code's syntax colours; or boxed, or plain |
| Inline code, `==highlight==`, `<kbd>` | Background tints and inverse keys |
| Lists and task lists | Bullets by depth; checkbox icons for `[ ]`, `[x]` and the custom `[-]` state |
| Quotes | A bar whose colour follows the nesting depth |
| Callouts | GitHub alerts and Obsidian callouts (26 types), with custom titles |
| Tables | Bordered grid (square, round, double, heavy), alignment markers, cells wrapped to fit, CJK widths |
| Links | Icon by site; https links are clickable (OSC 8), other URLs are shown after the label |
| Footnotes, wiki links | Superscript numbers and a notes section; `[[page\|label]]` |
| Math | `$…$` as Unicode on one line; `$$…$$` laid out in two dimensions (fractions, limits, matrices) |
| Mermaid | Flowcharts, sequence and ER diagrams drawn by mermaid-ascii, strokes in the accent colour |
| Images | An image alone in its paragraph is drawn as a picture where the terminal supports kitty graphics |
| HTML | Comments hidden; common inline tags styled; other tags left as written |

Colours are Claude Code theme keys, so md-render follows your theme: light,
dark, daltonized and ANSI.

## Options

Set them in `/config` under `md-render`; a change reloads the mod.

| Option | Values (default first) |
| --- | --- |
| `enabled` | `true`, `false` |
| `icons` | `nerd`, `unicode` |
| `headings` | `full`, `block`, `plain` |
| `headingBorders` | `false`, `true` |
| `codeBlocks` | `full`, `block`, `box`, `plain` |
| `codeBorders` | `false`, `true` |
| `tables` | `full`, `normal`, `compact` |
| `tableBorders` | `square`, `round`, `double`, `heavy` |
| `links` | `clickable`, `url` |
| `math` | `unicode`, `raw` |
| `images` | `local`, `remote`, `off` |
| `mermaid` | `ascii`, `code` |
| `mermaidCommand` | `mermaid-ascii`, or a full path to the binary |
| `indent` | `false`, `true` |

## Images and safety

`local` draws image files on this machine only. `remote` also downloads https
images that a reply names. Downloading a URL a reply wrote is how a prompt
injection leaks data (the data rides in the URL), so leave `remote` off unless
you trust what the replies may contain. Downloads are https only, redirects
included, and capped at 20 MB.

Pictures are measured and, when not PNG, converted with macOS `sips`; converted
files go to `$TMPDIR/md-render/`. Without `sips`, or in a terminal without
kitty graphics, the image's alt text is shown instead.

## What md-render runs

To see what md-render does before you install it, clone the repository and run
`claude plugin validate .claude-plugin/plugin.json` in it:

```text
❯ ./register.tsx hooks: ui.render{component=AssistantMessage, surface=terminal}
❯ ./register.tsx calls: $.env.get (via readDiagram, readPicture), $.process.run (via readDiagram, readPicture), $.ui.resolve
❯ ./register.tsx env reads: HOME, TMPDIR
```

It runs `mermaid-ascii` on mermaid blocks; `pwd`, `mkdir` and `sips` for
images, so `sips` reads the image files a reply names; and `curl` only with
`images` set to `remote`. It reads no other files and makes no other network
requests.

## Turn it off

Set `enabled` to `false` in `/config`, or disable or uninstall the plugin from
the Installed tab of `/plugin`.

## Development

```sh
claude plugin validate --strict .                            # the marketplace
claude plugin validate --strict .claude-plugin/plugin.json   # the plugin and its hooks module
claude plugin test .
```

| Path | Holds |
| --- | --- |
| `hooks/register.tsx` | The hooks module: the render hook, and the image and diagram loaders (`$` stays in this file) |
| `hooks/parse.ts` | Markdown to blocks and inline nodes, with [marked](hooks/vendor/README.md) and extensions |
| `hooks/inline.ts` | Inline content as styled runs, and word wrapping |
| `hooks/render.tsx` | Blocks to Claude Code's elements |
| `hooks/table.ts`, `latex.ts`, `mermaid.ts`, `images.ts` | Grid tables, TeX to Unicode, diagram runs, image paths and sizes |
| `hooks/style.ts`, `languages.ts` | Options, colours and icons |
| `tests/` | Tests for `claude plugin test` |
| `dev/harness/` | Renders fixtures in a real session and captures the screen ([README](dev/harness/README.md)) |

`claude plugin test` runs only while Claude Code's remote switch for mods is on.
With `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`, as in CI, the CLI skips the
remote check and the switch keeps its default.

To try a change without installing it, start Claude Code with
`claude --plugin-dir .` in this folder; saving a file reloads the mod.

## Credits

[marked](https://github.com/markedjs/marked) parses the markdown (MIT, vendored
in `hooks/vendor`). Icons follow
[render-markdown.nvim](https://github.com/MeanderingProgrammer/render-markdown.nvim)'s
defaults, and language icons and colours come from
[nvim-web-devicons](https://github.com/nvim-tree/nvim-web-devicons) (both MIT).

## License

[MIT](LICENSE)
