# The Rule

A local, single-user app for keeping your standards and gathering months of
honest data about which held, which broke, and why.

Everything lives on this machine. No account, no sync, no cloud, no telemetry,
no notifications. You open it because you decided to.

---

## Getting it running on your Mac

You need [Node.js](https://nodejs.org) (version 22 or newer). Then, in this
folder:

```bash
npm install        # nothing compiles — the database driver ships prebuilt
npm start          # builds everything and opens the app
```

To build the double-clickable app:

```bash
npm run dist
```

That writes the app to `release/mac-arm64/The Rule.app` (and a `.dmg` beside
it). Install it with:

```bash
ditto "release/mac-arm64/The Rule.app" "/Applications/The Rule.app"
xattr -dr com.apple.quarantine "/Applications/The Rule.app"
```

Then open it from Applications, and it lives in your dock like anything else.

**Use `ditto`, not a Finder drag, and never run `codesign` on it.** An Electron
app's `Contents/Frameworks` is built from symlinks; a copy that flattens them
produces an app that dies at launch with *Library not loaded: @rpath/Electron
Framework*. `ditto` preserves them. The binaries inside already carry Electron's
own signature, so signing it yourself only risks breaking the bundle.

The `xattr` line clears the quarantine flag macOS attaches to anything freshly
downloaded or copied out of a disk image. Without it you get a warning that the
app is unidentified or damaged — which only means it has no paid Apple developer
certificate, not that anything is wrong with it.

If you'd rather not package it at all, `npm run serve` runs the same app at
`http://localhost:4321` in a browser tab.

---

## Where your data is

```
~/Library/Application Support/The Rule/rule.db          your data
~/Library/Application Support/The Rule/backups/          a dated copy per launch, last 30 kept
```

One SQLite file. Copy it anywhere to back it up. **Manage → Your data** shows
the path, reveals it in Finder, and exports everything as JSON or CSV.

In development (`npm run dev`) the database is `~/.the-rule/rule.db` instead, so
experiments never touch the real record.

---

## How it works

### The day you're filling in

The sheet was always filled the morning after, so **before noon the app opens on
yesterday**; after noon, on today. Navigate to any date with the arrows. Past
days are never locked — honesty over ceremony.

### The four states

| | |
|---|---|
| **kept** | filled square |
| **broken** | struck square — and it asks you why |
| **unanswered** | empty square, not yet filled in |
| **released** | a dot: not asked of you that day, and left out of the counting |

Sunday releases the Monday–Saturday standards. So does an exception you set
yourself. A released day never breaks a streak and never counts against a
percentage. An unanswered day is not counted as a failure either — it is simply
not evidence.

### Why it broke

Marking something broken opens a one-line "why". That text is the point of the
whole exercise: **Trends** collects every reason per standard into one list, so
patterns you'd never notice day to day become obvious over months.

### The standards change, the history doesn't

Editing a standard closes the version in force and opens a new one from today.
Every mark you have already made keeps pointing at the words that were true when
you made it — so when the evening sit went from an hour to thirty minutes, last
month's data still means what it meant. Retiring works the same way: it stops
being asked, and the record stays.

### Day types

Monday–Thursday are normal, Friday and Saturday are work days, Sunday is rest.
Nothing is released by a work day — the evening routine runs every day. Day type
is context: it's the honest record of when the bar had you, and Trends splits
your kept-rate by it, so you can see whether work days actually cost you
anything. Override any single date in **Manage → Day types** ("I'm working this
Sunday").

### Exceptions

**Manage → Exceptions** releases one standard on one day, with a reason —
illness, travel, a shift that made it genuinely impossible. Use it honestly and
it keeps the data meaningful; use it freely and it stops meaning anything. The
app will not stop you either way.

---

## The screens

- **Today** — the ledger. Tick each standard, expand the two routines to work
  through their steps, answer the day's prompt, mark what you noticed.
- **Week** — the grid, seven columns, exactly as the printed sheet was. Also
  holds the week's three priorities and where you'll be 1% better.
- **Review** — Saturday's weekly review: what broke and every reason, a
  reflection, then next week's priorities. And the monthly view: goals, what
  you're working on, the month in review.
- **Trends** — the wake-up first, then every standard: streaks, kept-rate by
  week and by month, a heatmap, which routine step slips most, and all the
  reasons.
- **Manage** — edit and reorder standards, edit routine steps, exceptions, day
  types, the "noticed, not scored" flags, and your data.

---

## For whoever works on this next

```
shared/      dates, types, and the two algorithms that matter (pure, tested)
server/      Express API + SQLite, migrations in server/src/migrations
web/         React frontend
app/         Electron main process — boots the server, opens the window
scripts/     build and serve
```

```bash
npm run dev        # API on 4321, Vite on 5173, edit-and-reload
npm test           # 28 tests over resolution, streaks, and the store
npm run typecheck
```

The two places bugs hide silently are **schedule resolution**
(`shared/resolve.ts` — which standards apply on which days, and why one is
released) and **streak computation** (`shared/streaks.ts` — released days must
stay transparent). Both are pure functions with tests. If you change how a day
resolves, the tests are where you say what you meant.

Adding a standard needs no code: **Manage → add a standard**.
