# Our House: website concept

A proof-of-concept redesign of the Our House cocktail & wine bar site (Gloucester Food Dock), replacing the WordPress site. It's a plain static site with no build tools or dependencies.

## View it

- **Quickest:** open `dist/our-house.html` in any browser. It's one self-contained file with both pages (the Menu link switches between them), so you can email it or AirDrop it to a phone. `dist/index.html` and `dist/menu.html` are the same pages as separate files.
- **Working copy:** open `index.html`, or serve the folder (`python3 -m http.server`) and visit `http://localhost:8000`.

After editing anything, rebuild the single file with `python3 tools/build_standalone.py`.

## What's on the page

Two pages:

- **Home** (`index.html`): photo hero with the logo (the header sits over the photo and turns solid on scroll), About, reviews, Visit (address and hours) and Contact.
- **Menu** (`menu.html`): the full drinks menu from the printed menu, laid out as a menu book with tabs for Cocktails, Wine, Beer & cider and Zero & low.

## Updating things

- **Opening hours:** edit the hours list in the Visit section of `index.html`.
- **Menu:** plain HTML in `menu.html`. Copy an `<li class="item">` to add a drink.
- **Photos:** drop new files into `images/` with the same names. The photos are crops from screenshots, so full-size originals will look sharper.
- **Contact form:** opens the visitor's email app addressed to info@ourhousebar.co.uk. Swap for a form service to receive messages directly.

## Before going live

- Remove `<meta name="robots" content="noindex">` from `index.html`.
- Confirm opening hours. Instagram and the Food Dock listing disagree; this uses Instagram's (Tue–Wed 4–10, Thu 1–10, Fri–Sat 1–midnight, Sun 1–9, Mon closed).
- Check prices and the menu against the current printed menu. Obvious spelling slips were tidied (Daiquiri, Limoncello, Grenache, Mosaic, Cornish Orchards).

## Credits

- Logo traced to vector from the existing brand artwork.
- Fonts: Fraunces and DM Sans (SIL OFL 1.1). See `fonts/LICENSE.txt`.
