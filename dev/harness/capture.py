"""Run a command in a pseudo-terminal, replay its output through pyte, dump the screen.

Usage: uv run --with pyte==0.8.2 python capture.py --cwd DIR --out PREFIX [--until REGEX] -- cmd args...
Writes PREFIX.txt (plain screen), PREFIX.runs (styled runs per line) and PREFIX.ans (ANSI replay to cat).
"""

import argparse
import fcntl
import os
import pty
import re
import select
import signal
import struct
import termios
import time

import pyte

QUERY_REPLIES = [
    # OSC 11: background colour query; answer dark so the theme picks dark.
    (re.compile(rb"\x1b\]11;\?(\x07|\x1b\\)"), b"\x1b]11;rgb:1c1c/1c1c/1c1c\x1b\\"),
    (re.compile(rb"\x1b\]10;\?(\x07|\x1b\\)"), b"\x1b]10;rgb:d0d0/d0d0/d0d0\x1b\\"),
]
# With HARNESS_TERM_PROGRAM=ghostty: answer XTVERSION and kitty graphics
# queries the way Ghostty does, so the app takes the graphics path.
GHOSTTY_REPLIES = [
    (re.compile(rb"\x1b\[>0?q"), b"\x1bP>|ghostty 1.2.3\x1b\\"),
    (re.compile(rb"\x1b_Gi=(\d+)[^\x1b]*a=q[^\x1b]*\x1b\\"), None),
]

NAMED_SGR = {
    "black": 30, "red": 31, "green": 32, "brown": 33, "blue": 34, "magenta": 35, "cyan": 36, "white": 37,
    "brightblack": 90, "brightred": 91, "brightgreen": 92, "brightbrown": 93, "brightblue": 94,
    "brightmagenta": 95, "brightcyan": 96, "brightwhite": 97,
}


class AnsweringScreen(pyte.Screen):
    fd = None

    def write_process_input(self, data):
        if self.fd is not None:
            os.write(self.fd, data.encode())


def style_of(char):
    return (char.fg, char.bg, char.bold, char.italics, char.underscore, char.strikethrough, char.reverse)


def sgr(style):
    fg, bg, bold, italics, underscore, strike, reverse = style
    codes = ["0"]
    if bold:
        codes.append("1")
    if italics:
        codes.append("3")
    if underscore:
        codes.append("4")
    if reverse:
        codes.append("7")
    if strike:
        codes.append("9")
    for value, base in ((fg, 0), (bg, 10)):
        if value == "default":
            continue
        if value in NAMED_SGR:
            codes.append(str(NAMED_SGR[value] + base))
        elif re.fullmatch(r"[0-9a-fA-F]{6}", value):
            r, g, b = (int(value[k : k + 2], 16) for k in (0, 2, 4))
            codes.append(f"{38 + base};2;{r};{g};{b}")
    return "\x1b[" + ";".join(codes) + "m"


def describe(style):
    fg, bg, bold, italics, underscore, strike, reverse = style
    parts = []
    if fg != "default":
        parts.append(f"fg={fg}")
    if bg != "default":
        parts.append(f"bg={bg}")
    for flag, name in ((bold, "bold"), (italics, "italic"), (underscore, "underline"), (strike, "strike"), (reverse, "inverse")):
        if flag:
            parts.append(name)
    return " ".join(parts)


def dump(screen, prefix):
    lines = [screen.buffer[y] for y in range(screen.lines)]
    texts = ["".join(line[x].data for x in range(screen.columns)).rstrip() for line in lines]
    last = max((y for y, t in enumerate(texts) if t), default=0)
    with open(prefix + ".txt", "w") as out:
        for y in range(last + 1):
            out.write(f"{y:3d}|{texts[y]}\n")
    with open(prefix + ".runs", "w") as runs, open(prefix + ".ans", "w") as ans:
        for y in range(last + 1):
            line = lines[y]
            width = len(texts[y])
            # Keep trailing cells that carry a background, so fills show up.
            for x in range(screen.columns - 1, width - 1, -1):
                if line[x].bg != "default" or line[x].reverse:
                    width = x + 1
                    break
            segments = []
            x = 0
            while x < width:
                style = style_of(line[x])
                start = x
                text = ""
                while x < width and style_of(line[x]) == style:
                    text += line[x].data
                    x += 1
                segments.append((start, x, style, text))
            styled = [f"[{a}-{b} {describe(s)}]{t!r}" for a, b, s, t in segments if describe(s)]
            if styled:
                runs.write(f"{y:3d}| " + " ".join(styled) + "\n")
            ans.write("".join(sgr(s) + t for _, _, s, t in segments) + "\x1b[0m\n")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cols", type=int, default=110)
    parser.add_argument("--rows", type=int, default=200)
    parser.add_argument("--cwd", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--until", default=None, help="regex on screen text that ends the capture")
    parser.add_argument("--settle", type=float, default=2.0, help="quiet seconds after --until matched")
    parser.add_argument("--timeout", type=float, default=90.0)
    parser.add_argument("--trust", action="store_true", help="press Enter on a folder-trust dialog")
    parser.add_argument("cmd", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    cmd = args.cmd[1:] if args.cmd and args.cmd[0] == "--" else args.cmd

    screen = AnsweringScreen(args.cols, args.rows)
    stream = pyte.ByteStream(screen)

    pid, fd = pty.fork()
    if pid == 0:
        os.chdir(args.cwd)
        # Drop the parent session's markers (child-session, messaging socket) so the
        # child is a plain top-level session that saves its transcript.
        env = {k: v for k, v in os.environ.items() if not k.startswith(("CLAUDE", "GHOSTTY_", "TERM_PROGRAM"))}
        env.update(TERM="xterm-256color", COLORTERM="truecolor", COLUMNS=str(args.cols), LINES=str(args.rows))
        # Lets a run identify as a given terminal (ghostty: kitty graphics).
        if os.environ.get("HARNESS_TERM_PROGRAM"):
            env["TERM_PROGRAM"] = os.environ["HARNESS_TERM_PROGRAM"]
        if os.environ.get("HARNESS_TERM"):
            env["TERM"] = os.environ["HARNESS_TERM"]
        os.execvpe(cmd[0], cmd, env)

    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", args.rows, args.cols, 0, 0))
    screen.fd = fd
    started = time.time()
    last_data = started
    matched_at = None
    trusted = False
    raw = bytearray()
    try:
        while time.time() - started < args.timeout:
            ready, _, _ = select.select([fd], [], [], 0.2)
            if ready:
                try:
                    chunk = os.read(fd, 65536)
                except OSError:
                    break
                if not chunk:
                    break
                raw.extend(chunk)
                for pattern, reply in QUERY_REPLIES:
                    if pattern.search(chunk):
                        os.write(fd, reply)
                if os.environ.get("HARNESS_TERM_PROGRAM") == "ghostty":
                    for pattern, reply in GHOSTTY_REPLIES:
                        for match in pattern.finditer(chunk):
                            os.write(fd, reply or b"\x1b_Gi=" + match.group(1) + b";OK\x1b\\")
                stream.feed(chunk)
                last_data = time.time()
            text = "\n".join(screen.display)
            if args.trust and not trusted and re.search(r"Yes, I trust this folder", text):
                time.sleep(0.5)
                # The dialog's default is "No, exit": move down to "Yes" first.
                if re.search(r"❯ No, exit", text):
                    os.write(fd, b"\x1b[B")
                    time.sleep(0.3)
                os.write(fd, b"\r")
                trusted = True
            if args.until and matched_at is None and re.search(args.until, text):
                matched_at = time.time()
            if matched_at and time.time() - last_data > args.settle:
                break
    finally:
        dump(screen, args.out)
        with open(args.out + ".raw", "wb") as out:
            out.write(raw)
        for sig in (signal.SIGTERM, signal.SIGKILL):
            try:
                os.kill(pid, sig)
                time.sleep(0.5)
            except ProcessLookupError:
                break
        print(f"matched={matched_at is not None} elapsed={time.time() - started:.1f}s bytes={len(raw)}")


if __name__ == "__main__":
    main()
