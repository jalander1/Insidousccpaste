#!/usr/bin/env python3
"""Bundle the site into self-contained HTML files (fonts, images, CSS and JS inlined).

Usage:  python3 tools/build_standalone.py
Output: dist/index.html, dist/menu.html and dist/events.html (one file per page), plus
        dist/our-house.html: all pages in one file, for emailing or opening on a phone.
"""
import base64
import mimetypes
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"

mimetypes.add_type("font/woff2", ".woff2")
mimetypes.add_type("image/svg+xml", ".svg")

# In the combined file, the menu lives in a second <main> shown when its link is followed.
ROUTER = """
<script>
(() => {
  const pages = [...document.querySelectorAll('[data-page]')];
  const home = pages[0];
  const route = () => {
    const id = decodeURIComponent(location.hash.slice(1));
    const target = id && document.getElementById(id);
    const page = (target && pages.find((p) => p === target || p.contains(target))) || home;
    pages.forEach((p) => { p.hidden = p !== page; });
    if (target && target !== page) target.scrollIntoView();
    else window.scrollTo(0, 0);
    window.dispatchEvent(new Event('scroll'));
  };
  window.addEventListener('hashchange', route);
  route();
})();
</script>
"""


def data_uri(path: Path) -> str:
    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode()}"


def replace_once(text: str, old: str, new: str) -> str:
    if text.count(old) != 1:
        raise SystemExit(f"Expected exactly one occurrence of: {old}")
    return text.replace(old, new)


def inline(html: str) -> str:
    css = (ROOT / "css" / "style.css").read_text(encoding="utf-8")
    css = re.sub(r'url\("\.\./(fonts/[^"]+)"\)', lambda m: f'url("{data_uri(ROOT / m.group(1))}")', css)
    js = (ROOT / "js" / "main.js").read_text(encoding="utf-8")
    html = re.sub(r'\s*<link rel="preload"[^>]*as="font"[^>]*>', "", html)
    html = replace_once(html, '<link rel="stylesheet" href="css/style.css">', f"<style>\n{css}</style>")
    html = replace_once(html, '<script src="js/main.js" defer></script>', f"<script>\n{js}</script>")
    return re.sub(r'(src|href)="(images/[^"]+)"', lambda m: f'{m.group(1)}="{data_uri(ROOT / m.group(2))}"', html)


def check(html: str, name: str, allowed: str) -> None:
    leftovers = re.findall(rf'(?:src|href)="(?!https?:|mailto:|tel:|#|data:{allowed})([^"]+)"', html)
    if leftovers:
        raise SystemExit(f"{name}: un-inlined local references: {leftovers}")


PAGES = (("index.html", "home"), ("menu.html", "menu"), ("events.html", "events"))


def main() -> None:
    DIST.mkdir(exist_ok=True)
    html = {name: (ROOT / name).read_text(encoding="utf-8") for name, _ in PAGES}

    for name, _ in PAGES:
        out = inline(html[name])
        check(out, name, "|index\\.html|menu\\.html|events\\.html")
        (DIST / name).write_text(out, encoding="utf-8")

    # Combined file: every page's <main> in one document, switched by the URL hash.
    combined = replace_once(html["index.html"], '<main id="main">', '<main id="main" data-page="home">')
    extra = ""
    for name, key in PAGES[1:]:
        body = re.search(r'<main id="main">(.*?)</main>', html[name], re.S).group(1)
        extra += f'\n  <main id="{key}-page" data-page="{key}" hidden>{body}</main>'
    combined = replace_once(combined, "  </main>", "  </main>" + extra)
    combined = combined.replace('href="index.html#', 'href="#').replace('href="index.html"', 'href="#top"')
    for name, key in PAGES[1:]:
        combined = combined.replace(f'href="{name}"', f'href="#{key}-page"')
    combined = replace_once(combined, '<script src="js/main.js" defer></script>', '<script src="js/main.js" defer></script>' + ROUTER)
    combined = inline(combined)
    check(combined, "our-house.html", "")
    (DIST / "our-house.html").write_text(combined, encoding="utf-8")

    for f in [n for n, _ in PAGES] + ["our-house.html"]:
        print(f"Wrote dist/{f} ({(DIST / f).stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
