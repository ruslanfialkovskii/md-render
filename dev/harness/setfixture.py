"""Replace the last assistant text block of a saved session transcript with a fixture file."""

import json
import sys

path, fixture = sys.argv[1], sys.argv[2]
text = open(fixture).read().rstrip("\n")
lines = open(path).read().splitlines()
for i in range(len(lines) - 1, -1, -1):
    row = json.loads(lines[i])
    content = (row.get("message") or {}).get("content")
    if row.get("type") == "assistant" and isinstance(content, list) and content and content[0].get("type") == "text":
        content[0]["text"] = text
        lines[i] = json.dumps(row, ensure_ascii=False)
        break
else:
    sys.exit("no assistant text block found")
open(path, "w").write("\n".join(lines) + "\n")
