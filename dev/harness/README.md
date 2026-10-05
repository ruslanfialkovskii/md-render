# Capture harness

Renders markdown through md-render in a real Claude Code session and captures
the screen, colours included, without anyone looking at it. A pseudo-terminal
runs `claude`, and [pyte](https://github.com/selectel/pyte) (a terminal
emulator in Python) replays what it writes.

## Use

```sh
dev/harness/seed.sh                                            # once: one Haiku call, answers the trust dialog
dev/harness/render.sh dev/harness/fixtures/showcase.md dev/harness/out/showcase 100
command cat dev/harness/out/showcase.ans                       # the capture, in colour
```

Each capture writes `.txt` (the screen), `.runs` (styled runs per line, colours
as hex), `.ans` (an ANSI replay) and `.raw` (the bytes Claude Code wrote).
Renders after the seed resume the seeded session, so they make no model calls.
`tohtml.py` turns a capture into HTML spans.

Variants: `OPTIONS='{"tables":"compact"}'`, `THEME=light`, `BASELINE=1` (the
built-in renderer), `HARNESS_TERM_PROGRAM=ghostty HARNESS_TERM=xterm-ghostty`
(Claude Code takes the kitty graphics path; look for `\x1b_G` in `.raw`).

## Caveats

- Classic renderer only (`--settings '{"tui":"default"}'`). A fullscreen launch
  the harness kills counts as a failed start, and repeated ones turn
  fullscreen off on the machine.
- Underlines on plain text in `.runs` and `.ans` are an emulator artefact;
  `.raw` has none there.
- Needs `uv` (it fetches pyte 0.8.2), and macOS `sips` for the image fixture.
