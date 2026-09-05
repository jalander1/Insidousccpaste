# Green Grass

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

That writes the app to `release/mac-arm64/Green Grass.app` (and a `.dmg` beside
it). Install it with:

```bash
ditto "release/mac-arm64/Green Grass.app" "/Applications/Green Grass.app"
xattr -dr com.apple.quarantine "/Applications/Green Grass.app"
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
~/Library/Application Support/Green Grass/rule.db          your data
~/Library/Application Support/Green Grass/backups/         a dated copy per launch, last 30 kept
```

One SQLite file. Copy it anywhere to back it up. (If you ran this when it was
called The Rule, the app carries that folder across on first launch — nothing
recorded is lost.) **Manage → Your data** shows
the path, reveals it in Finder, and exports everything as JSON or CSV.

In development (`npm run dev`) the database is `~/.green-grass/rule.db` instead, so
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

Sunday releases the Monday–Saturday standards — the wake-up, content
creation, reading, no TV. The routines and the abstains run every day. So does
an exception you set yourself.

Steps within a routine can be released too, so only tonight's steps are shown:
Friday and Saturday are the late shifts, so the phone may stay in the room and
a podcast stands in for the book. Ticking what applies is enough to keep the
routine. A released day never breaks a streak and never counts against a
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

### Exceptions

**Manage → Exceptions** releases one standard on one day, with a reason —
illness, travel, a shift that made it genuinely impossible. Use it honestly and
it keeps the data meaningful; use it freely and it stops meaning anything. The
app will not stop you either way.

---

## The screens

- **Today** — the ledger. Tick each standard kept or broken, work through the
  two routines step by step, and answer the day's prompt.
- **Week** — the grid, seven columns, exactly as the printed sheet was.
- **Reflect** — somewhere to say what actually happened, to a Claude that has
  read your record. For the weeks that went badly, or when a standard is
  starting to feel wrong rather than merely hard.
- **Trends** — the wake-up first, then every standard: streaks, kept-rate by
  week and by month, a heatmap, which routine step slips most, and every reason
  a standard broke.
- **Manage** — edit and reorder standards, edit routine steps, set exceptions,
  and get at your data.

### Reflect, and what leaves your machine

Everything else in this app is local. Reflect is not: it sends your standards,
your marks for the last thirty days, the reasons you wrote when something broke,
and your recent notes to the Anthropic API, so the reply is about your actual
week rather than habits in general. Nothing is sent until you press send, and
nothing at all is sent until you add an API key under **Manage → Reflect**.
Remove the key and the tab goes quiet again. The key is stored in your database
and never handed back to the interface.

Get a key from console.anthropic.com; it bills you by usage, on the order of a
penny or two per conversation. Conversations are kept per day, alongside the
marks, and can be deleted without touching anything else.

It is told to be brief, to be specific about what is actually in your record, to
ask rather than advise, and never to congratulate or scold. It is also told that
your standards are editable — so if the record suggests one is badly written
rather than merely difficult, it will say so.

This is a standard tracker, not a goal setter. There is nowhere to write
priorities, monthly goals or a weekly review, by design — the weekly review is a
standard you tick on a Saturday, and where you do it is your business.

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
npm test           # 26 tests over resolution, streaks, and the store
npm run typecheck
```

The two places bugs hide silently are **schedule resolution**
(`shared/resolve.ts` — which standards apply on which days, and why one is
released) and **streak computation** (`shared/streaks.ts` — released days must
stay transparent). Both are pure functions with tests. If you change how a day
resolves, the tests are where you say what you meant.

Adding a standard needs no code: **Manage → add a standard**.
