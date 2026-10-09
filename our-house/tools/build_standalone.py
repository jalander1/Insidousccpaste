#!/usr/bin/env python3
"""Bundle the site into one self-contained HTML file (fonts, images, CSS and JS inlined).

Usage:  python3 tools/build_standalone.py
Output: dist/our-house.html. Handy for emailing or opening straight from a phone.
"""
import base64
import mimetypes
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "dist" / "our-house.html"

mimetypes.add_type("font/woff2", ".woff2")
mimetypes.add_type("image/svg+xml", ".svg")


def data_uri(path: Path) -> str:
    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode()}"


def replace_once(text: str, old: str, new: str) -> str:
    if text.count(old) != 1:
        raise SystemExit(f"Expected exactly one occurrence of: {old}")
    return text.replace(old, new)


def main() -> None:
    html = (ROOT / "index.html").read_text(encoding="utf-8")

    css = (ROOT / "css" / "style.css").read_text(encoding="utf-8")
    css = re.sub(r'url\("\.\./(fonts/[^"]+)"\)', lambda m: f'url("{data_uri(ROOT / m.group(1))}")', css)
    js = (ROOT / "js" / "main.js").read_text(encoding="utf-8")

    html = re.sub(r'\s*<link rel="preload"[^>]*as="font"[^>]*>', "", html)
    html = replace_once(html, '<link rel="stylesheet" href="css/style.css">', f"<style>\n{css}</style>")
    html = replace_once(html, '<script src="js/main.js" defer></script>', f"<script>\n{js}</script>")
    html = re.sub(r'(src|href)="(images/[^"]+)"', lambda m: f'{m.group(1)}="{data_uri(ROOT / m.group(2))}"', html)

    leftovers = re.findall(r'(?:src|href)="(?!https?:|mailto:|tel:|#|data:)([^"]+)"', html)
    if leftovers:
        raise SystemExit(f"Un-inlined local references: {leftovers}")

    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(html, encoding="utf-8")
    print(f"Wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
