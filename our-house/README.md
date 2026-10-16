# Our House: website concept

A proof-of-concept redesign of the Our House cocktail & wine bar site (Gloucester Food Dock), replacing the WordPress site. It's a plain static site with no build tools or dependencies.

## View it

- **Quickest:** open `dist/our-house.html` in any browser. It's one self-contained file with all three pages (the links switch between them), so you can email it or AirDrop it to a phone. `dist/index.html`, `dist/menu.html` and `dist/events.html` are the same pages as separate files.
- **Working copy:** open `index.html`, or serve the folder (`python3 -m http.server`) and visit `http://localhost:8000`.

After editing anything, rebuild the single file with `python3 tools/build_standalone.py`.

## What's on the page

Three pages, sharing one header (tasting banner, navigation) and footer (visit, hours, contact):

- **Home** (`index.html`): photo hero with the logo, About, and Cocktails / Wine / Events.
- **Menu** (`menu.html`): the full drinks menu from the printed menu, laid out as a menu book with tabs.
- **Events** (`events.html`): this month's wine and cocktail tastings, each with a "Book your place" email button.

## Updating things

- **This month's events:** edit the event cards in `events.html` (date line, title, description).
- **Opening hours:** edit the Hours column in the footer (same in all three pages).
- **Menu:** plain HTML in `menu.html`. Copy an `<li class="item">` to add a drink.
- **Photos:** drop new files into `images/` with the same names. `exterior.jpg` was upscaled 2× (EDSR); the rest are the originals as supplied.
- **Bookings:** the banner and event buttons open an email to info@ourhousebar.co.uk with the subject filled in. Swap for a booking service when ready.

## Before going live

- Remove `<meta name="robots" content="noindex">` from `index.html`.
- Confirm opening hours. Instagram and the Food Dock listing disagree; this uses Instagram's (Tue–Wed 4–10, Thu 1–10, Fri–Sat 1–midnight, Sun 1–9, Mon closed).
- Check prices and the menu against the current printed menu. Obvious spelling slips were tidied (Daiquiri, Limoncello, Grenache, Mosaic, Cornish Orchards).

## Credits

- Logo traced to vector from the existing brand artwork; the two script lines are set in Yellowtail (converted to outlines) for clarity.
- Fonts: Fraunces and DM Sans (SIL OFL 1.1). See `fonts/LICENSE.txt`.
