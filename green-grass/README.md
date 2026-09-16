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

### The day: against yesterday, line by line

The day is not scored. It is set against yesterday, one line at a time: did
you get up at nine today when you did not yesterday? That is a point up. Did
you read yesterday and not today? That is a point down.

More up than down and you won; more down and you lost; **equal and you held,
which keeps your run alive.** Holding has to count — once you are running
clean there is nothing left to beat, and a system that called that failure
every day would be worthless.

Only lines that both days actually asked for are compared, so a released
standard can neither cost you nor flatter you, and an exemption is naturally
neutral. Objectives compare as slots — did you hit your primary? — because the
task itself changes daily. Setting no objective counts as not hitting one.

**A day you never fill in drops every line, so it is a loss and it breaks the
run.** That is the deal: you can go back and fill a day in whenever you like,
and Today points at any blank days behind you, but a day left blank stays lost.

**Sunday does not race.** It asks five things rather than nine, so the
comparison would be thin, and it is the day of rest. Your run steps over it;
Monday takes on the Saturday.

### The week: points

Points are the week's currency, not the day's.

| | |
|---|---|
| Each standard kept | 10 |
| Primary objective | 20 |
| Secondary objective | 12 |
| Tertiary objective | 8 |
| The 1% | 10 |

Standards are the floor, so they are priced as one. The objectives are what
actually moves you forward, so they are priced above a standard. A clean
weekday is 90; everything on top of it is 140.

The week's total is set against last week's — counted to the same day of the
week while the week is still running, so it is a live race rather than a
foregone conclusion every Monday.

### Objectives and the 1%

Two different things, deliberately.

**Objectives** are the day's tasks — the ones you write in your notepad.
Primary, secondary, tertiary, in that order of weight. Write the short version
in, tap hit or missed. Set tomorrow's from the bottom of Today, which is what
"plan and reflect on the day" in your evening routine is for.

**The 1%** is not a task. It is the one thing you are doing better than
yesterday, and it gets its own line and its own ten points.

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
- **Week** — the grid, seven columns, exactly as the printed sheet was, and
  underneath it room to write about the week: why it went the way it went, what
  was going on around it, and what you want to do about it. A grid can record
  that you missed four days; it cannot record that you were moving flat.
- **Trends** — the wake-up first, then every standard: streaks, kept-rate by
  week and by month, a heatmap, which routine step slips most, every reason a
  standard broke, and everything you have written about past weeks, collected
  in one place to read back.
- **Manage** — edit and reorder standards, edit routine steps, set exceptions,
  and get at your data.

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
