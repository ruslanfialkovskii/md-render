#!/bin/sh
# Render a markdown fixture through md-render in a real Claude Code session.
# Usage: render.sh FIXTURE.md OUT_PREFIX [COLUMNS]
# Swaps the seeded session's assistant text for the fixture, resumes the session
# in a pseudo-terminal (no model call) and dumps the screen via capture.py.
# Env: OPTIONS (md-render options as JSON), THEME (light, dark, ...), MOD (the
# plugin folder; this repository by default), BASELINE=1 (built-in renderer),
# HARNESS_TERM_PROGRAM=ghostty with HARNESS_TERM=xterm-ghostty (take the kitty
# graphics path).
set -eu
H=$(cd "$(dirname "$0")" && pwd)
MOD=${MOD:-$(cd "$H/../.." && pwd)}
SESSION=$(cat "$H/session-id" 2>/dev/null) || { echo "run seed.sh once first" >&2; exit 1; }
TRANSCRIPT=$HOME/.claude/projects/$(printf '%s' "$H/work" | sed 's#[^A-Za-z0-9]#-#g')/$SESSION.jsonl

# Classic renderer only: a fullscreen boot the harness kills counts as a failed
# start, and repeated ones turn fullscreen off on this machine.
PLUGIN="--plugin-dir $MOD"
OPTIONS=${OPTIONS:-\{\}}
SETTINGS="{${THEME:+\"theme\":\"$THEME\",}\"tui\":\"default\",\"pluginConfigs\":{\"md-render\":{\"options\":$OPTIONS}}}"
[ "${BASELINE:-}" = 1 ] && PLUGIN=""
python3 "$H/setfixture.py" "$TRANSCRIPT" "$1"
mkdir -p "$H/out"
cd "$H"
FORCE_HYPERLINK=${FORCE_HYPERLINK:-1} uv run --quiet --with pyte==0.8.2 python capture.py --cwd "$H/work" --out "$2" --cols "${3:-110}" \
  --until 'fixture-end' --settle 2 --timeout 60 -- claude --resume "$SESSION" --settings "$SETTINGS" $PLUGIN
