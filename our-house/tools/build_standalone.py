#!/usr/bin/env python3
"""Bundle the site into self-contained HTML files (fonts, images, CSS and JS inlined).

Usage:  python3 tools/build_standalone.py
Output: dist/index.html and dist/menu.html (one file per page), plus
        dist/our-house.html: both pages in one file, for emailing or opening on a phone.
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
  const home = document.querySelector('[data-page="home"]');
  const menu = document.querySelector('[data-page="menu"]');
  const route = () => {
    const id = decodeURIComponent(location.hash.slice(1));
    const target = id && document.getElementById(id);
    const showMenu = id === 'menu-page' || (target && menu.contains(target));
    menu.hidden = !showMenu;
    home.hidden = showMenu;
    if (target && id !== 'menu-page') target.scrollIntoView();
    else if (showMenu || !id) window.scrollTo(0, 0);
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


def main() -> None:
    DIST.mkdir(exist_ok=True)
    home = (ROOT / "index.html").read_text(encoding="utf-8")
    menu = (ROOT / "menu.html").read_text(encoding="utf-8")

    for name, html in (("index.html", home), ("menu.html", menu)):
        out = inline(html)
        check(out, name, "|index\\.html|menu\\.html")
        (DIST / name).write_text(out, encoding="utf-8")

    menu_main = re.search(r'<main id="main">(.*?)</main>', menu, re.S).group(1)
    menu_main = menu_main.replace('href="index.html#', 'href="#').replace('href="index.html"', 'href="#top"')
    combined = replace_once(home, '<main id="main">', '<main id="main" data-page="home">')
    combined = replace_once(combined, "  </main>", f'  </main>\n  <main id="menu-page" data-page="menu" hidden>{menu_main}</main>')
    combined = combined.replace('href="menu.html"', 'href="#menu-page"')
    combined = replace_once(combined, '<script src="js/main.js" defer></script>', '<script src="js/main.js" defer></script>' + ROUTER)
    combined = inline(combined)
    check(combined, "our-house.html", "")
    (DIST / "our-house.html").write_text(combined, encoding="utf-8")

    for f in ("index.html", "menu.html", "our-house.html"):
        print(f"Wrote dist/{f} ({(DIST / f).stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
