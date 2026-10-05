"""Replay a capture's raw bytes through pyte and write the reply's cells as HTML spans.

Usage: uv run --with pyte==0.8.2 python tohtml.py PREFIX COLS > fragment.html
Writes PREFIX.chars (the characters used, for font subsetting).
Underline is kept only on link text (the emulator smears it elsewhere).
"""

import html
import sys

import pyte

NAMED = {
    "black": "000000", "red": "cd3131", "green": "0dbc79", "brown": "e5e510", "blue": "2472c8",
    "magenta": "bc3fbc", "cyan": "11a8cd", "white": "e5e5e5",
}
LINK = "b1b9f9"

prefix, cols = sys.argv[1], int(sys.argv[2])
screen = pyte.Screen(cols, 200)
pyte.ByteStream(screen).feed(open(prefix + ".raw", "rb").read())
rows = ["".join(screen.buffer[y][x].data for x in range(cols)) for y in range(screen.lines)]
start = next(y for y, row in enumerate(rows) if "Reply with the single word" in row) + 1
end = next(y for y, row in enumerate(rows) if "fixture-end" in row)


def color(value):
    if value == "default":
        return None
    return "#" + NAMED.get(value, value)


out, chars = [], set()
for y in range(start, end):
    line = screen.buffer[y]
    width = len(rows[y].rstrip())
    for x in range(cols - 1, width - 1, -1):
        if line[x].bg != "default":
            width = x + 1
            break
    spans, x = [], 0
    while x < width:
        char = line[x]
        key = (char.fg, char.bg, char.bold, char.italics, char.strikethrough, char.reverse, char.underscore and char.fg == LINK and not char.bold)
        text = ""
        while x < width:
            cell = line[x]
            if (cell.fg, cell.bg, cell.bold, cell.italics, cell.strikethrough, cell.reverse, cell.underscore and cell.fg == LINK and not cell.bold) != key:
                break
            text += cell.data
            chars.add(cell.data)
            x += 1
        fg, bg, bold, italic, strike, reverse, underline = key
        fg, bg = color(fg), color(bg)
        if reverse:
            fg, bg = bg or "#1c1c1c", fg or "#e6e6e6"
        style = []
        if fg:
            style.append(f"color:{fg}")
        if bg:
            style.append(f"background:{bg}")
        if bold:
            style.append("font-weight:700")
        if italic:
            style.append("font-style:italic")
        decorations = [d for d, on in (("underline", underline), ("line-through", strike)) if on]
        if decorations:
            style.append("text-decoration:" + " ".join(decorations))
        body = html.escape(text)
        # Half-block border rows: paint the half with CSS, glyphs leave seams.
        if fg and set(text) <= {"▄", "▀"} and len(set(text)) == 1:
            half = "to bottom, transparent 50%, " + fg + " 50%" if text[0] == "▄" else "to bottom, " + fg + " 50%, transparent 50%"
            spans.append(f'<span style="background:linear-gradient({half})">{" " * len(text)}</span>')
            continue
        spans.append(f'<span style="{";".join(style)}">{body}</span>' if style else body)
    out.append('<div class="row">' + ("".join(spans) or " ") + "</div>")

print("".join(out))
open(prefix + ".chars", "w").write("".join(sorted(chars)))
