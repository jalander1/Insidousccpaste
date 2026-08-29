# The Rule — Standards Tracking App · Architecture

**Status:** Architecture / build spec. Written to be handed to an implementing model. Read the whole document before writing code. Section 11 lists open questions — where the owner hasn't answered one yet, build the stated default.

---

## 1. What this is

A **local, single-user app** for tracking personal standards (daily disciplines), morning/evening routines, weekly priorities, and monthly goals — and for gathering months of data about which standards were kept, which were broken, and *why*.

It replaces a printed weekly sheet ("The Rule") and an HTML prototype ("The Nine"). The prototype's interaction model is proven and should be preserved: a **standards × days grid** where each cell cycles kept → broken → unanswered, with per-day reflection underneath. This app extends that into a durable, queryable system.

Design ethos (from the prototype, keep it): austere, typographic, dark, calm. Filled square = kept, struck square = broken, dot = released (not required that day). No gamification, no confetti, no badges. The tone is a ledger, not a cheerleader.

### Core loop
1. Each day (typically the **morning after**, sometimes the same evening) the owner marks each active standard **kept** or **broken**, enters wake time and any durations, and answers a short reflection prompt.
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

**Local web app, single process:**

- **Runtime:** Node.js (LTS). One process: an **Express (or Hono) server** that serves the built frontend statically and exposes a small JSON API. `npm start` boots it on `localhost:4321` and opens the browser.
- **Database:** **SQLite** via `better-sqlite3` (synchronous, zero-config, one durable file). DB file lives at `~/.the-rule/rule.db` (create the directory on first run). This is the single source of truth.
- **Frontend:** **React + Vite + TypeScript**. No CSS framework required — the prototype's hand-rolled CSS aesthetic is the target; extract its palette and type choices (Fraunces / Newsreader / IBM Plex Mono; ink/bone/brass palette) into CSS variables.
- **Migrations:** plain numbered SQL files run at boot (track applied migrations in a `migrations` table). No ORM — the schema is small; hand-written SQL keeps the implementing model honest.

**Why not Electron/Tauri:** native packaging is the highest-risk part of a build like this and adds nothing to a single-user local tool. Keep the frontend/API split clean and a Tauri shell can be wrapped around it later if the owner wants a dock icon. **Why not localStorage/purely client-side:** months of data must survive browser cache clears; a SQLite file is trivially backed up.

**Backups:** on every boot, copy `rule.db` to `~/.the-rule/backups/rule-YYYY-MM-DD.db` (keep last 30). Provide JSON and CSV export endpoints.

---

## 4. Domain model — the important ideas

Three insights drive the schema; get these right and everything else is CRUD.

### 4.1 Standards are *versioned definitions* evaluated against a *schedule*

A standard (e.g., "Evening sit — 30 minutes") has a definition that changes over time. Historical marks must stay attached to the definition that was in force **on that date**, or months of data become uninterpretable. So standards are stored as versioned rows with `effective_from` / `effective_to` dates. Editing a standard from the UI closes the current version (sets `effective_to` = yesterday) and opens a new one — it never mutates history. Deleting = "retiring" (set `effective_to`), never a SQL DELETE.

### 4.2 Days have *types*, and the schedule resolves against the day type

The owner's week is not uniform:

- **Sunday** is the day of rest — sleep in, no content creation, TV allowed, no plan-tomorrow requirement the night before.
- **Friday and Saturday** are work days; **Sunday is sometimes a work day too.**
- The evening routine applies **Monday–Thursday** because Fri/Sat (and sometimes Sun) evenings are work evenings.

So the applicability of a standard on a date resolves in this order (most specific wins):

1. **Per-date override** — the owner marked this specific date exempt for this standard (with an optional reason: travel, illness, "worked Sunday"). "There are exceptions to the rule" is a requirement, not an edge case.
2. **Day-type rule** — the date's day type (`normal` | `work` | `rest`) can add/remove standards vs. the weekday default.
3. **Weekday schedule** — each standard version carries a set of applicable weekdays (e.g., Mon–Sat).

The date's day type defaults from the weekday (Mon–Thu `normal`, Fri–Sat `work`, Sun `rest`) but is **overridable per date** in the UI ("I'm working this Sunday").

When a standard doesn't apply on a date, the grid shows the prototype's **dot — "released"**, and the day is excluded from streak/percentage math (not counted as kept, not counted as broken).

### 4.3 Standards have *kinds*, because a checkbox can't hold a wake time

| kind | meaning | value captured | kept when |
|---|---|---|---|
| `binary` | did / didn't | — | marked kept |
| `abstain` | didn't do the forbidden thing | — | marked kept (one lapse = broken) |
| `time_by` | done by a clock time | actual time (e.g., wake `09:12`) | actual ≤ target |
| `duration_min` | at least N minutes | actual minutes | actual ≥ target |
| `duration_max` | at most N minutes | actual minutes | actual ≤ target |
| `checklist` | ordered steps all done | per-step checks | all steps checked (partial = broken, but the step data shows *which* step slipped) |

For `time_by` / `duration_*`, entering the value auto-derives kept/broken, but the owner can always override the mark (the value stays recorded either way — data first, judgment second). Values are optional: a plain kept/broken tap must always work; the value input is offered, never demanded (see Q3 in §11).

---

## 5. The seed data — the owner's actual standards

Seed exactly this on first run (via a seed migration). Numbers are display order. "Schedule" = weekday default before day-type/override resolution.

| # | Standard | Kind | Target | Schedule | Notes for definition text |
|---|---|---|---|---|---|
| 01 | **Wake by 09:00** | `time_by` | 09:00 | Mon–Sat | **The most important standard.** Pin first, give it the hero treatment: dedicated streak counter and wake-time trend chart. Sunday released (day of rest, sleep in). Record actual wake time. |
| 02 | **Morning routine, phone off until done** | `checklist` | steps below | Mon–Sat | Steps: (1) Read, (2) Exercise session — bag work + the set stretching/prehab-rehab circuit, (3) 15 min TRE (trauma release exercise), (4) 45 min meditation. Rule bound into it: **no phone until the routine is finished** (~11:00–11:30). Not fasted — juice throughout (definition text, not a step). The exercise circuit is a *named, editable list* of exercises (see `routine_step.detail`) so the owner can classify exactly what the set circuit is. |
| 03 | **Content creation — 1 hour** | `duration_min` | 60 | Mon–Sat | Counts: anything directly moving the personal brand forward — ideation, scripting, planning the content week, reflecting on content, filming/making. Doesn't count: reading, studying, life-planning (five-year vision etc.). Sunday is Sabbath. |
| 04 | **Reading — 1 hour** | `duration_min` | 60 | Mon–Sat *(see Q2)* | A book. |
| 05 | **No porn or masturbation** | `abstain` | — | Every day | No intentionally seeking sexually explicit content — Reddit included. Once is a fail. No released days, ever. |
| 06 | **No TV or films** | `abstain` | — | Mon–Sat | Includes YouTube clips of shows/films and video essays. Educational content allowed, but not as escape. Sunday open. |
| 07 | **Instagram under 30 minutes** | `duration_max` | 30 | Every day | For inspiration and the brand, not pleasure. Owner reads the number off the phone's screen-time report and types it in. |
| 08 | **No phone/technology on the toilet** | `abstain` | — | Every day | "It's five minutes." |
| 09 | **Evening routine (from 22:30)** | `checklist` | steps below | Mon–Thu *(see Q1)* | Aim to begin 22:30. Steps: (1) Phone away downstairs — no more use after 22:30, (2) Plan & reflect on the day / plan tomorrow, (3) Journal — even one minute counts, (4) Set out tomorrow's outfit, (5) 30 min meditation before bed *(changed from 1 hour — seed at 30)*. Fill water bottle + salt is definition text, not a measured step. Plan-tomorrow is not required on Saturday night (Sunday needs no plan). |
| 10 | **Weekly review & plan** | `binary` | — | Saturday *(see Q1)* | Reflect on the week, plan the next. Surfaces as part of the weekly review flow (§7.3), not just a grid cell. |

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
  kind          TEXT NOT NULL CHECK (kind IN
                  ('binary','abstain','time_by','duration_min','duration_max','checklist')),
  target        TEXT,                      -- '09:00' | '60' | '30' | NULL
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
  detail      TEXT NOT NULL DEFAULT ''     -- e.g. the named prehab/rehab exercise list
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
  status      TEXT NOT NULL CHECK (status IN ('kept','broken','released','unanswered')),
  value       TEXT,                        -- '09:12' | '75' (minutes) | NULL
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

- `mark.status = 'released'` is **derived at read time** by the resolution algorithm (§4.2), not stored — store only `kept`/`broken` (+ value/reason). The API computes and returns released/unanswered per cell. (Keeping the CHECK constraint loose is fine; just don't write the derived states.)
- Resolution algorithm, exactly: for date D and current-version standard S — if an `exemption(D, S.lineage_id)` row exists → released. Else compute day type (override or weekday default: Mon–Thu normal, Fri–Sat work, Sun rest); if day type is `rest` and `applies_on_rest='never'` → released, `'always'` → applies; likewise for `work`; otherwise fall through to `weekdays`. Seed values: standard 01/02/03 `applies_on_rest='never'` is *wrong* — their weekday schedules already exclude Sunday; use `'schedule'` everywhere in the seed **except**: standard 09 (evening routine) gets `applies_on_work='never'` (work evenings release it), and a *worked Sunday* releases nothing extra by default (see Q1). Keep the engine general; keep the seed minimal.
- Streaks/percentages: released days are transparent — a Sunday never breaks a Mon–Sat streak.
- Week starts **Monday** everywhere (grid, week keys, streaks), matching the sheet and prototype.

---

## 7. Screens

Single-page app, five views. Keyboard-friendly, fast, zero-friction marking.

### 7.1 Today (default view)
The daily ledger. Shows the **tracking day** (see §8): all standards active that day, each as a one-tap kept/broken control; wake-time input beside standard 01; minutes inputs beside 03/04/07; expandable checklists for 02/09 with their steps. Marking **broken** opens an inline "why?" input — one sentence is enough, but it must ask. Below: the day's reflection prompt (rotate the prototype's seven prompts by weekday), the journal note field, and the noticed-not-scored flags. Autosave everything (debounced), with the prototype's quiet "Saved" whisper.

### 7.2 Week
The Nine's grid, faithfully: rows = standards, columns = Mon–Sun with day numbers, cells cycle kept → broken → unanswered on click, released cells show the dot, today highlighted, ← → week navigation, kept/broken/unanswered tally. Additions: the week's **top-3 priorities** and **1% better** displayed above the grid (editable in place); a small day-type badge on work/rest days; clicking a day column focuses that day's reflection (as the prototype does).

### 7.3 Review (weekly + monthly)
Saturday surfaces the **weekly review flow**: last week's grid summary (kept %, what broke and the collected reasons), a review text field, then set next week's priorities + 1% better. Month view of the same for monthly goals / "working on" / month-end review. A review left undone shows as a gentle unfinished marker, not a nag.

### 7.4 Trends
Where months of data pay off. Per-standard: kept % by week and by month, current & best streak (standard 01 first and biggest), wake-time line chart vs. the 09:00 line, minutes charts for content/reading/Instagram. A **reasons view**: every "why it broke" note in one scrollable, filterable list per standard — this is the reflection engine, treat it as a first-class feature, not an afterthought. Charts: use a tiny dependency-light approach (inline SVG or uPlot); no heavyweight chart lib.

### 7.5 Manage
Edit standards (creates new versions per §4.1), reorder, retire, add; edit checklist steps and the named exercise circuit; edit flags; set per-date day-type overrides and exemptions ("working this Sunday"); export JSON/CSV; open backups folder.

---

## 8. Day rollover — the tracking day

The sheet was historically filled **the morning after**. Preserve the prototype's rule: before **12:00 noon**, the app opens focused on **yesterday**; after noon, on today. The owner can always navigate to any date. Never lock past days — honesty over ceremony. (Default confirmed as Q4.)

---

## 9. API sketch

`GET /api/day/:date` (resolved cells + note + flags + steps) · `PUT /api/day/:date` · `PUT /api/mark/:date/:standardId` · `GET /api/week/:weekStart` (grid + plan) · `PUT /api/week/:weekStart` · `GET/PUT /api/month/:month` · `GET /api/standards` (current versions + steps) · `POST /api/standards` / `PUT /api/standards/:lineageId` (version-safe edit) · `POST/DELETE /api/exemption` · `GET /api/trends?from&to` · `GET /api/export.json` / `GET /api/export.csv`. All local, no auth.

---

## 10. Build order (milestones for the implementing model)

1. **Skeleton:** repo layout (`server/`, `web/`), Express + better-sqlite3 + migrations + seed data from §5/§6, `npm start` boots and opens the browser. *Accept: seed visible via `GET /api/standards`.*
2. **Today view:** resolution algorithm, marking with kinds/values, broken-reason capture, checklists, notes, flags, autosave, noon rollover. *Accept: a full day can be recorded and survives restart.*
3. **Week view:** the grid + tallies + navigation + priorities/1% better.*Accept: visually and behaviorally faithful to the prototype.*
4. **Review flows:** weekly (Saturday) and monthly.
5. **Trends:** streaks, percentages, wake-time chart, minutes charts, reasons view.
6. **Manage + safety:** standard editing with versioning, exemptions/day types, export, boot-time backups.

Each milestone should leave the app runnable. Write a handful of unit tests around the two algorithms that can silently rot: schedule/exemption resolution (§6 notes) and streak computation across released days and version changes.

---

## 11. Open questions for the owner

Answers refine the seed data, not the architecture — build the defaults meanwhile.

1. **Work-day evenings and worked Sundays.** The evening routine is Mon–Thu. On Fri/Sat/Sun evenings, does *any* of it still apply — you said journaling should happen "every day without fail" and plan-tomorrow "every day except Saturday" — should Journal and Plan-tomorrow be split out of the evening-routine checklist into their own daily standards so work evenings don't release them? And when you *do* work a Sunday, does that change anything else about Sunday (wake-up? reading?) or is it only an evening-routine matter? **Default built:** evening routine as one checklist, Mon–Thu only; journaling and planning live inside it and are therefore released Fri–Sun; a worked Sunday changes nothing else.
2. **Weekly review day, and reading on Sunday.** You said both "every Sunday" and "every Saturday" for the reflect-on-week/plan-next-week session — which is it? And is reading Mon–Sat (your voice note) or every day including Sunday (The Nine says every day, and reading on a rest day seems compatible)? **Default built:** review on Saturday; reading Mon–Sat.
3. **How much do you want to log vs. just tick?** Recommended (and built as default): record actual wake *time* and actual *minutes* for content/reading/Instagram, because the trend data is the treasure — but if typing numbers nightly is friction that kills the habit, everything can degrade to plain kept/broken taps. Which do you want as the primary gesture?
4. **When do you fill it in, and should the app prompt you?** The default assumes morning-after entry (before-noon = yesterday). Correct? And do you want any nudges at all — e.g., the browser tab is only opened manually (default, phone-free evenings stay phone-free), vs. a 09:00 or post-routine desktop notification?
5. **Machine and form factor.** macOS, Windows, or Linux? Is a `npm start` + browser-tab app acceptable (default), or do you want it packaged as a double-clickable desktop app (Tauri wrap, adds build complexity)? And does it ever need to be reachable from your phone on home Wi-Fi (e.g., to enter Instagram minutes) — default is desktop-only?

---

## 12. Source material honored

- **The Nine (HTML prototype):** grid interaction, kept/broken/released semantics, Monday weeks, morning-after focus rule, weekday reflection prompts, noticed-not-scored flags, definitions drawer, visual language.
- **Weekly rule sheet (PDF):** the printed grid this replaces; standards list and exemption dots.
- **Standards / Morning & Evening Routine (PDF):** routine step order and the evening-routine details (22:30 start, phone downstairs, water + salt, outfit, journal, plan/reflect).
- **Voice-note deltas over the documents (these win):** wake **at** 09:00 Mon–Sat (not "out of bed by 09:00 Mon–Fri"); morning sit is **45 min inside the morning routine** (not a standalone 1-hour sit); evening sit **30 min** (down from 60); fluid 30 min is **noticed, not scored**; content creation defined by "directly moves the personal brand"; no-phone-on-toilet added; Fri/Sat (sometimes Sun) are work days.
