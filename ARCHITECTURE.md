# The Rule — Standards Tracking App · Architecture

**Status: built.** The app lives in [`the-rule/`](the-rule/) — see its [README](the-rule/README.md) for how to run and package it. This document remains the design record: what was decided, and why. Where the code and this document disagree, the code is what shipped.

Two things were settled during the build and are worth recording here:

- **A new standard begins on the day you are currently filling in**, not on the calendar date it was created. Before noon the app is focused on yesterday, so a standard added then would otherwise be invisible on the sheet in front of you. Nothing has been marked against a brand-new standard, so starting it a day back costs no history.
- **Re-wording a standard still takes effect from today, never retroactively.** Backdating an edit would orphan marks already recorded against the previous version (marks point at a version row), so the rule in §4.1 holds strictly for edits and is relaxed only for creation.

---

## 1. What this is

A **local, single-user app** for tracking personal standards (daily disciplines), morning/evening routines, weekly priorities, and monthly goals — and for gathering months of data about which standards were kept, which were broken, and *why*.

It replaces a printed weekly sheet ("The Rule") and an HTML prototype ("The Nine"). The prototype's interaction model is proven and should be preserved: a **standards × days grid** where each cell cycles kept → broken → unanswered, with per-day reflection underneath. This app extends that into a durable, queryable system.

Design ethos (from the prototype, keep it): austere, typographic, dark, calm. Filled square = kept, struck square = broken, dot = released (not required that day). No gamification, no confetti, no badges. The tone is a ledger, not a cheerleader.

### Core loop
1. Each day (typically the **morning after**, sometimes the same evening) the owner marks each active standard **kept** or **broken** with a single tap — no numbers, no timestamps — and answers a short reflection prompt.
2. **Breaking a standard prompts for a reason.** The "why was it broken" record is first-class data — the whole point of months of tracking is to see patterns in the reasons.
3. Saturday: weekly review — reflect on the week, set next week's top-3 priorities and "1% better" focus.
4. Monthly: goals and "what I'm working on," reviewed at month end.

---

## 2. Non-goals

- No accounts, no login, no sync, no cloud, no telemetry. Data never leaves the machine.
- No social features, no sharing.
- No automatic screen-time integration (Instagram minutes are entered manually from the phone's screen-time report).
- Not a general habit-tracker product. One user, their exact standards, done extremely well. Hard-coding is not a sin here — but standards must still be *editable*, because they demonstrably change over time (evening meditation already went 60 → 30 minutes).

---

## 3. Recommended stack

**Target machine (owner-confirmed):** a recent MacBook (Apple Silicon, macOS). The owner wants a **double-clickable desktop app** — a real `.app` in `/Applications` with a dock icon, not an `npm start` browser tab. Build for `arm64` only; no Windows/Linux targets.

**Architecture: Electron shell around an embedded local server.** One language (TypeScript) end to end — deliberately chosen over Tauri, whose Rust layer is the highest-risk part of a build like this for no benefit to a single-user tool.

- **Shell:** **Electron** + **electron-builder** producing a `.dmg`/`.app` for `arm64`. The main process boots the server below, then opens a `BrowserWindow` pointed at it. Standard app behaviors: single-instance lock, window size persisted, ⌘Q quits.
- **Server (inside the main process):** an **Express (or Hono) server** bound to `127.0.0.1` on a fixed port (e.g. 4321), serving the built frontend statically and exposing the JSON API in §9. Because the app is an ordinary HTTP client of its own server, `npm run dev` still works in a plain browser — develop everything there and treat the Electron shell as packaging, added in the final milestone.
- **Database:** **SQLite** via `better-sqlite3` (synchronous, zero-config, one durable file) at `app.getPath('userData')/rule.db` (i.e. `~/Library/Application Support/The Rule/rule.db`). Single source of truth. **Use v13 or later, which is a Node-API build shipping a prebuilt binary per platform.** That matters more than it sounds: the pre-v13 releases were V8-API builds that had to be recompiled against each Electron version, and better-sqlite3 11 simply cannot compile against Electron 44's V8 at all. Node-API is ABI-stable, so nothing compiles on install, no `electron-rebuild` step exists, and an Electron upgrade cannot break the database layer. Set `npmRebuild: false` so electron-builder does not try to rebuild it anyway.
- **Frontend:** **React + Vite + TypeScript**. No CSS framework — the prototype's hand-rolled aesthetic is the target; extract its palette and type choices (Fraunces / Newsreader / IBM Plex Mono; ink/bone/brass palette) into CSS variables. Bundle the fonts locally (the packaged app must not depend on Google Fonts being reachable).
- **Migrations:** plain numbered SQL files run at boot (track applied migrations in a `migrations` table). No ORM — the schema is small; hand-written SQL keeps the implementing model honest.

**Signing:** assume no Apple Developer account. Ad-hoc sign the build (`codesign --force --deep -s -`); document in the README that first launch requires right-click → Open (Gatekeeper). Do not attempt notarization.

**Why not localStorage/purely client-side:** months of data must survive cache clears and app reinstalls; a SQLite file in Application Support is durable and trivially backed up.

**Backups:** on every app launch, copy `rule.db` to `<userData>/backups/rule-YYYY-MM-DD.db` (keep last 30). Provide JSON and CSV export endpoints, plus a "reveal data folder in Finder" action on the Manage screen.

---

## 4. Domain model — the important ideas

Three insights drive the schema; get these right and everything else is CRUD.

### 4.1 Standards are *versioned definitions* evaluated against a *schedule*

A standard (e.g., "Evening sit — 30 minutes") has a definition that changes over time. Historical marks must stay attached to the definition that was in force **on that date**, or months of data become uninterpretable. So standards are stored as versioned rows with `effective_from` / `effective_to` dates. Editing a standard from the UI closes the current version (sets `effective_to` = yesterday) and opens a new one — it never mutates history. Deleting = "retiring" (set `effective_to`), never a SQL DELETE.

### 4.2 Days have *types*, and the schedule resolves against the day type

The owner's week is not uniform:

- **Sunday** is the day of rest — sleep in, no content creation, TV allowed, no plan-tomorrow requirement the night before.
- **Friday and Saturday** are work days (the main job — bar work, distinct from the personal-brand work the standards measure); **Sunday is sometimes a work day too**, and bar work sometimes lands on other evenings.
- Owner's decision: a work day releases **nothing** by default — the evening routine runs every day, work evenings included. Day types are therefore mostly *context* (a badge on the grid, a filter in trends: "do I break more standards on work days?") plus the hook for per-date exemptions when a shift genuinely makes a standard impossible.

So the applicability of a standard on a date resolves in this order (most specific wins):

1. **Per-date override** — the owner marked this specific date exempt for this standard (with an optional reason: travel, illness, "worked Sunday"). "There are exceptions to the rule" is a requirement, not an edge case.
2. **Day-type rule** — the date's day type (`normal` | `work` | `rest`) can add/remove standards vs. the weekday default.
3. **Weekday schedule** — each standard version carries a set of applicable weekdays (e.g., Mon–Sat).

The date's day type defaults from the weekday (Mon–Thu `normal`, Fri–Sat `work`, Sun `rest`) but is **overridable per date** in the UI ("I'm working this Sunday").

When a standard doesn't apply on a date, the grid shows the prototype's **dot — "released"**, and the day is excluded from streak/percentage math (not counted as kept, not counted as broken).

### 4.3 Standards have *kinds* — and marking is tick-only

**Owner decision (final):** no typed values, ever. No actual wake times, no minute counts — "if I hit an hour, I just want to tick it." Targets ("by 09:00", "one hour", "under 30 minutes") live in the definition *text*; the mark itself is always a one-tap kept/broken judgment on the honor system. This keeps the nightly gesture near-zero friction, which is what keeps the habit alive.

| kind | meaning | kept when |
|---|---|---|
| `binary` | did the thing / hit the target | marked kept |
| `abstain` | didn't do the forbidden thing | marked kept (one lapse = broken) |
| `checklist` | ordered steps all done | all *applicable* steps checked (partial = broken, but the step data shows *which* step slipped) |

`binary` and `abstain` behave identically in the data; the distinction is presentational (phrasing, and abstain standards read as streaks-of-clean-days). Checklist steps may carry their own weekday restriction (see `routine_step.weekdays`) — a step that doesn't apply that day is ignored in the "all steps" test.

If value capture is ever wanted later, add a nullable `value` column to `mark` — the design accommodates it, but do **not** build value inputs now.

---

## 5. The seed data — the owner's actual standards

Seed exactly this on first run (via a seed migration). Numbers are display order. "Schedule" = weekday default before day-type/override resolution. All marks are one-tap ticks — targets are definition text only (§4.3).

| # | Standard | Kind | Schedule | Notes for definition text |
|---|---|---|---|---|
| 01 | **Wake by 09:00** | `binary` | Mon–Sat | **The most important standard.** Pin first, give it the hero treatment: dedicated streak counter, front and centre in Trends. Sunday released (day of rest, sleep in). Tick = up by nine; no time is recorded (owner explicitly declined). |
| 02 | **Morning routine, phone off until done** | `checklist` | Mon–Sat | Steps: (1) Read, (2) Exercise session — bag work + the set stretching/prehab-rehab circuit, (3) 15 min TRE (trauma release exercise), (4) 45 min meditation. Rule bound into it: **no phone until the routine is finished** (~11:00–11:30). Not fasted — juice throughout (definition text, not a step). The exercise circuit is a *named, editable list* of exercises (see `routine_step.detail`) so the owner can classify exactly what the set circuit is. |
| 03 | **Content creation — 1 hour** | `binary` | Mon–Sat | Tick = hit the hour. Counts: anything directly moving the personal brand forward — ideation, scripting, planning the content week, reflecting on content, filming/making. Doesn't count: reading, studying, life-planning (five-year vision etc.). Sunday is Sabbath. |
| 04 | **Reading — 1 hour** | `binary` | Mon–Sat | A book. Tick = hit the hour. Sunday released. |
| 05 | **No porn or masturbation** | `abstain` | Every day | No intentionally seeking sexually explicit content — Reddit included. Once is a fail. No released days, ever. |
| 06 | **No TV or films** | `abstain` | Mon–Sat | Includes YouTube clips of shows/films and video essays. Educational content allowed, but not as escape. Sunday open. |
| 07 | **Instagram under 30 minutes** | `abstain` | Every day | For inspiration and the brand, not pleasure. Owner checks the phone's screen-time report and ticks kept/broken — the minute count is never typed in. |
| 08 | **No phone/technology on the toilet** | `abstain` | Every day | "It's five minutes." |
| 09 | **Evening routine (from 22:30)** | `checklist` | **Every day** | Owner's decision: every day, work evenings included — "just makes it simple." Aim to begin 22:30. Steps: (1) Phone away downstairs — no more use after 22:30, (2) Plan & reflect on the day / plan tomorrow — *step weekdays `MTWTF-S`: not required Saturday night (Sunday needs no plan)*, (3) Journal — even one minute counts, (4) Set out tomorrow's outfit, (5) 30 min meditation before bed *(confirmed: 30, down from 1 hour)*. Fill water bottle + salt is definition text, not a measured step. |
| 10 | **Weekly review & plan** | `binary` | Saturday | Reflect on the week, plan the next. Surfaces as part of the weekly review flow (§7.3), not just a grid cell. |

**Noticed, not scored:** the fluid ~30 min of extra meditation spread through the day (making up the 30 taken off the evening sit) is **mentioned, untimed, unmeasured** — model it like the prototype's per-day flags: a per-day toggle ("Made up the fluid 30 today"), stored on the day record, shown in trends, never counted in kept/broken. Keep the prototype's two existing flags too ("Sexual content came through my feed today", "Something I watched/read was escape, not interest") as seed flags, and make flags user-editable.

---

## 6. Data model (SQLite)

```sql
-- Versioned standard definitions. Editing closes a row and opens a new one.
CREATE TABLE standard (
  id            INTEGER PRIMARY KEY,
  lineage_id    INTEGER NOT NULL,          -- stable identity across versions
  display_order INTEGER NOT NULL,
  name          TEXT NOT NULL,
  definition    TEXT NOT NULL DEFAULT '',  -- the human "what counts" text
  kind          TEXT NOT NULL CHECK (kind IN ('binary','abstain','checklist')),
  weekdays      TEXT NOT NULL,             -- e.g. 'MTWTFS-' (Mon..Sun, '-' = released)
  applies_on_rest TEXT NOT NULL DEFAULT 'schedule',  -- 'schedule'|'always'|'never'
  applies_on_work TEXT NOT NULL DEFAULT 'schedule',
  effective_from  TEXT NOT NULL,           -- ISO date
  effective_to    TEXT                      -- NULL = current
);

-- Checklist steps for checklist-kind standards (per version).
CREATE TABLE routine_step (
  id          INTEGER PRIMARY KEY,
  standard_id INTEGER NOT NULL REFERENCES standard(id),
  step_order  INTEGER NOT NULL,
  name        TEXT NOT NULL,
  detail      TEXT NOT NULL DEFAULT '',    -- e.g. the named prehab/rehab exercise list
  weekdays    TEXT                         -- NULL = every day the routine applies;
                                           -- else e.g. 'MTWTF-S' (plan-tomorrow skips Saturday)
);

-- One row per calendar date once anything is recorded for it.
CREATE TABLE day (
  date          TEXT PRIMARY KEY,          -- ISO date
  day_type      TEXT NOT NULL DEFAULT 'auto'
                CHECK (day_type IN ('auto','normal','work','rest')), -- 'auto' = derive from weekday
  note          TEXT NOT NULL DEFAULT '',  -- daily reflection / journal-in-app
  prompt_answered TEXT NOT NULL DEFAULT ''
);

-- Per-day, per-standard outcome.
CREATE TABLE mark (
  date        TEXT NOT NULL,
  standard_id INTEGER NOT NULL REFERENCES standard(id),  -- the version in force that date
  status      TEXT NOT NULL CHECK (status IN ('kept','broken')),  -- released/unanswered are derived, never stored
  reason      TEXT NOT NULL DEFAULT '',    -- REQUIRED-by-UI when status = 'broken'
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (date, standard_id)
);

CREATE TABLE step_check (
  date    TEXT NOT NULL,
  step_id INTEGER NOT NULL REFERENCES routine_step(id),
  checked INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date, step_id)
);

-- Per-date exemptions ("exceptions to the rule"), most specific rule in resolution.
CREATE TABLE exemption (
  date        TEXT NOT NULL,
  lineage_id  INTEGER NOT NULL,            -- exempts the standard whatever its version
  reason      TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (date, lineage_id)
);

-- "Noticed, not scored" flags.
CREATE TABLE flag_def ( id INTEGER PRIMARY KEY, label TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1 );
CREATE TABLE day_flag ( date TEXT NOT NULL, flag_id INTEGER NOT NULL REFERENCES flag_def(id),
                        PRIMARY KEY (date, flag_id) );

-- Weekly planning & review (week keyed by its Monday).
CREATE TABLE week (
  week_start   TEXT PRIMARY KEY,
  priority_1   TEXT NOT NULL DEFAULT '',
  priority_2   TEXT NOT NULL DEFAULT '',
  priority_3   TEXT NOT NULL DEFAULT '',
  one_percent  TEXT NOT NULL DEFAULT '',   -- "where I'll be 1% better this week"
  review       TEXT NOT NULL DEFAULT '',   -- Saturday review: what worked, what broke, why
  reviewed_at  TEXT
);

-- Monthly goals & review (keyed 'YYYY-MM').
CREATE TABLE month (
  month       TEXT PRIMARY KEY,
  goals       TEXT NOT NULL DEFAULT '[]',  -- JSON array of {text, done}
  working_on  TEXT NOT NULL DEFAULT '',    -- "what am I working on"
  review      TEXT NOT NULL DEFAULT '',
  reviewed_at TEXT
);

CREATE TABLE setting ( key TEXT PRIMARY KEY, value TEXT NOT NULL );
```

Notes for the implementer:

- `released` and `unanswered` are **derived at read time** by the resolution algorithm (§4.2), never stored — a `mark` row exists only once the owner ticks kept or broken. The API computes and returns all four states per cell.
- Resolution algorithm, exactly: for date D and standard version S in force on D — if an `exemption(D, S.lineage_id)` row exists → released. Else compute day type (override or weekday default: Mon–Thu normal, Fri–Sat work, Sun rest); if day type is `rest` and `applies_on_rest='never'` → released, `'always'` → applies; likewise `work` with `applies_on_work`; otherwise fall through to `weekdays`. **Seed uses `'schedule'` everywhere** — the owner decided work days release nothing (the evening routine runs daily, and worked Sundays change nothing else). Keep the engine general anyway; the day-type hooks cost little and per-date exemptions ride on the same code path.
- Checklist kept-test: all steps whose `weekdays` is NULL or includes D's weekday must be checked; other steps are ignored that day.
- Streaks/percentages: released days are transparent — a Sunday never breaks a Mon–Sat streak.
- Week starts **Monday** everywhere (grid, week keys, streaks), matching the sheet and prototype.

---

## 7. Screens

Single-page app, five views. Keyboard-friendly, fast, zero-friction marking.

### 7.1 Today (default view)
The daily ledger. Shows the **tracking day** (see §8): all standards active that day, each as a one-tap kept/broken control — no value inputs anywhere (§4.3); expandable checklists for 02/09 with their steps (steps not applicable that day, like plan-tomorrow on Saturday, are hidden or dotted). Marking **broken** opens an inline "why?" input — one sentence is enough, but it must ask. Below: the day's reflection prompt (rotate the prototype's seven prompts by weekday), the journal note field, and the noticed-not-scored flags. Autosave everything (debounced), with the prototype's quiet "Saved" whisper.

### 7.2 Week
The Nine's grid, faithfully: rows = standards, columns = Mon–Sun with day numbers, cells cycle kept → broken → unanswered on click, released cells show the dot, today highlighted, ← → week navigation, kept/broken/unanswered tally. Additions: the week's **top-3 priorities** and **1% better** displayed above the grid (editable in place); a small day-type badge on work/rest days; clicking a day column focuses that day's reflection (as the prototype does).

### 7.3 Review (weekly + monthly)
Saturday surfaces the **weekly review flow**: last week's grid summary (kept %, what broke and the collected reasons), a review text field, then set next week's priorities + 1% better. Month view of the same for monthly goals / "working on" / month-end review. A review left undone shows as a gentle unfinished marker, not a nag.

### 7.4 Trends
Where months of data pay off. Per-standard: kept % by week and by month, current & best streak (standard 01 first and biggest), a calendar heatmap per standard, checklist step-level slippage for 02/09 ("which step breaks the routine?"), and kept % split by day type (normal vs work days). A **reasons view**: every "why it broke" note in one scrollable, filterable list per standard — this is the reflection engine, treat it as a first-class feature, not an afterthought. Charts: use a tiny dependency-light approach (inline SVG or uPlot); no heavyweight chart lib.

### 7.5 Manage
Edit standards (creates new versions per §4.1), reorder, retire, add; edit checklist steps and the named exercise circuit; edit flags; set per-date day-type overrides and exemptions ("working this Sunday"); export JSON/CSV; open backups folder.

---

## 8. Day rollover — the tracking day

**Confirmed by the owner.** The sheet was historically filled **the morning after**. Preserve the prototype's rule: before **12:00 noon**, the app opens focused on **yesterday**; after noon, on today. The owner can always navigate to any date. Never lock past days — honesty over ceremony. Usage pattern: he'll open it during end-of-day planning and again in the morning before the work day starts. **No notifications or nudges of any kind** — the app is opened deliberately; evenings are phone-free by rule.

---

## 9. API sketch

`GET /api/day/:date` (resolved cells + note + flags + steps) · `PUT /api/day/:date` · `PUT /api/mark/:date/:standardId` · `GET /api/week/:weekStart` (grid + plan) · `PUT /api/week/:weekStart` · `GET/PUT /api/month/:month` · `GET /api/standards` (current versions + steps) · `POST /api/standards` / `PUT /api/standards/:lineageId` (version-safe edit) · `POST/DELETE /api/exemption` · `GET /api/trends?from&to` · `GET /api/export.json` / `GET /api/export.csv`. All local, no auth.

---

## 10. Build order (milestones for the implementing model)

1. **Skeleton:** repo layout (`server/`, `web/`, `app/` for the Electron main process — untouched until milestone 7), Express + better-sqlite3 + migrations + seed data from §5/§6, `npm run dev` boots server + Vite in a plain browser. *Accept: seed visible via `GET /api/standards`.*
2. **Today view:** resolution algorithm, tick-only marking, broken-reason capture, checklists with per-step weekdays, notes, flags, autosave, noon rollover. *Accept: a full day can be recorded and survives restart.*
3. **Week view:** the grid + tallies + navigation + priorities/1% better.*Accept: visually and behaviorally faithful to the prototype.*
4. **Review flows:** weekly (Saturday) and monthly.
5. **Trends:** streaks, percentages, per-standard heatmaps, step-slippage, day-type split, reasons view.
6. **Manage + safety:** standard editing with versioning, exemptions/day types, export, launch-time backups.
7. **Package for macOS:** Electron main process (boot server, open window, single-instance, `userData` DB path), `electron-builder` → `arm64` `.dmg`, ad-hoc codesign, bundled fonts, README first-launch note (right-click → Open). *Accept: on a Mac with no dev tooling, double-clicking the app opens it with seeded data, and data written there survives relaunch.*

Milestones 1–6 run in a plain browser via `npm run dev`; each should leave the app runnable. Write a handful of unit tests around the two algorithms that can silently rot: schedule/exemption resolution (§6 notes) and streak computation across released days and version changes.

---

## 11. Owner decisions (all resolved)

These were open questions; the owner has answered them all. **Build what's written here — it overrides anything contrary elsewhere in older documents.**

1. **Evening routine: every day, all seven.** Work evenings release nothing — "just makes it simple." The only carve-out is per-step: plan-tomorrow is not required Saturday night. Journal and plan-tomorrow stay inside the checklist (no split-out standards). A worked Sunday changes nothing else about Sunday.
2. **Weekly review: Saturday. Reading and content creation: Mon–Sat**, one hour each, Sunday released.
3. **Tick-only marking, everywhere.** No wake times, no minute counts, no typed numbers — "that goes too minuscule." Hitting the hour = one tick. See §4.3.
4. **Morning-after entry, no nudges.** Before-noon shows yesterday; owner opens the app during end-of-day planning and in the morning before the work day. The app never notifies.

5. **Machine and form factor: resolved.** A recent MacBook (Apple Silicon). The owner wants a **double-clickable desktop app** — build the Electron shell per §3, packaged as an `arm64` `.dmg`/`.app`. Desktop-only; no phone access needed (evenings are phone-free by rule anyway).

The owner also noted the voice dictation may have missed a standard or two — the Manage screen's add/edit flow (§7.5) is the safety valve; nothing else needs to change for late additions.

---

## 12. Source material honored

- **The Nine (HTML prototype):** grid interaction, kept/broken/released semantics, Monday weeks, morning-after focus rule, weekday reflection prompts, noticed-not-scored flags, definitions drawer, visual language.
- **Weekly rule sheet (PDF):** the printed grid this replaces; standards list and exemption dots.
- **Standards / Morning & Evening Routine (PDF):** routine step order and the evening-routine details (22:30 start, phone downstairs, water + salt, outfit, journal, plan/reflect).
- **Voice-note deltas over the documents (these win):** wake **at** 09:00 Mon–Sat (not "out of bed by 09:00 Mon–Fri"); morning sit is **45 min inside the morning routine** (not a standalone 1-hour sit); evening sit **30 min** (down from 60); fluid 30 min is **noticed, not scored**; content creation defined by "directly moves the personal brand"; no-phone-on-toilet added; Fri/Sat (sometimes Sun) are work days — bar work, the main job, sometimes on other evenings too.
- **Second round of owner answers (final, wins over everything above):** the §11 decisions — evening routine daily, tick-only marking, review Saturday, reading/content Mon–Sat, morning-after entry with zero notifications.
