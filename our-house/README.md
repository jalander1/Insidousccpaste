# Our House: website concept

A proof-of-concept redesign of the Our House cocktail & wine bar site (Gloucester Food Dock), replacing the WordPress site. It's a plain static site with no build tools or dependencies.

## View it

- **Quickest:** open `dist/our-house.html` in any browser. It's one self-contained file (fonts, photos, styles and scripts all inlined), so you can email it or AirDrop it to a phone.
- **Working copy:** open `index.html`, or serve the folder (`python3 -m http.server`) and visit `http://localhost:8000`.

After editing anything, rebuild the single file with `python3 tools/build_standalone.py`.

## What's on the page

| Section | What it does |
| --- | --- |
| Header | Live **Open now / Closed** status (UK time), sticky nav, "Book a group" button |
| Hero | Animated logo, "lit windows" that glow when the bar is open |
| Awning ticker | Scrolling one-liners: walk-ins, monthly cocktails, £20 flights |
| Intro | Who we are in one line + four reasons to come |
| Menu | Photo header, key-fob sticker, then a clean list menu (styled after Bisous Chicago) with five categories. The line drawing changes with each category |
| Wine flight | £20 blind-tasting flight, red/white toggle |
| Our story | Short timeline (2014 distillery → bar) with the siblings' photo |
| Reviews | Real Google reviews from the old site |
| Visit | Address, directions, call button, opening hours with today highlighted |
| Groups & questions | Enquiry form for 6+ tables, tastings and questions |
| Phones | Floating quick-action bar: Menu · Directions · Call |

## Updating things

- **Opening hours:** edit `HOURS` at the top of `js/main.js` (drives the live status and the hours table). Also update the footer summary and the `openingHoursSpecification` block in `index.html`.
- **Menu:** it's plain HTML in `index.html`, under `<!-- Cocktails -->`, `<!-- Wine by the glass -->`, and so on. Copy an `<li class="mp-item">` to add a drink.
- **Photos:** drop new files into `images/` with the same names. The current ones are small thumbnails, and the two menu photo bands (`menu-table.jpg`, `drinks-table.jpg`) are crops of old-site screenshots, so full-size originals will look much sharper.
- **Enquiry form:** right now it opens the visitor's email app with everything filled in (to info@ourhousebar.co.uk). To receive submissions directly, point the form at a form service (Formspree, Netlify Forms, etc.).

## Before going live

- Remove `<meta name="robots" content="noindex">` from `index.html`.
- Confirm opening hours. Instagram and the Food Dock listing disagree; this uses Instagram's (Tue–Wed 4–10, Thu 1–10, Fri–Sat 1–midnight, Sun 1–9, Mon closed).
- Check prices and the menu against the current printed menu. Obvious typos from the printed version were tidied (Daiquiri, Limoncello, Grenache, Mosaic, Cornish Orchards).

## Credits

- Logo traced to vector from the existing brand artwork.
- Fonts: Fraunces, DM Sans (SIL OFL 1.1) and Yellowtail (Apache 2.0). See `fonts/LICENSE.txt`.
