#!/bin/sh
# Once per machine: start a session in work/ whose reply render.sh later swaps
# for a fixture. Costs one Haiku call; answers the folder-trust dialog.
set -eu
H=$(cd "$(dirname "$0")" && pwd)
MOD=${MOD:-$(cd "$H/../.." && pwd)}
mkdir -p "$H/work" "$H/out"
cd "$H"
uv run --quiet --with pyte==0.8.2 python capture.py --cwd "$H/work" --out "$H/out/seed" --trust \
  --until '(Crunched|Cogitated|Worked|Baked|Brewed|Churned|Cooked|Sautéed) for' --settle 3 --timeout 120 \
  -- claude --settings '{"tui":"default"}' --plugin-dir "$MOD" --model haiku "Reply with the single word: ok"
DIR=$HOME/.claude/projects/$(printf '%s' "$H/work" | sed 's#[^A-Za-z0-9]#-#g')
basename "$(ls -t "$DIR"/*.jsonl | head -1)" .jsonl > "$H/session-id"
echo "seeded session $(cat "$H/session-id")"
