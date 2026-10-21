import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../src/db.js';
import * as store from '../src/store.js';
import { trackingDate } from '../../shared/dates.js';

function tempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rule-test-'));
  const file = path.join(dir, 'rule.db');
  const db = openDatabase(file);
  // The record is seeded to start on 27 September 2026. Tests need it already
  // lived in, so they can look at days behind them: backdate the seed rather
  // than pin every assertion to whatever today happens to be.
  db.prepare("UPDATE standard SET effective_from = '2026-08-01'").run();
  return { db, file, dir };
}

// A known week: Mon 24 Aug 2026 … Sun 30 Aug 2026.
const MON = '2026-08-24';
const SAT = '2026-08-29';
const SUN = '2026-08-30';
/** The day before MON, for anything that needs a second date. */
const PREV = '2026-08-23';

const byName = <T extends { name: string }>(cells: T[], name: string): T =>
  cells.find((c) => c.name.startsWith(name))!;

test('the seed is the nine standards of the camp', () => {
  const { db } = tempDb();
  const standards = store.currentStandards(db);
  assert.deepEqual(standards.map((s) => s.name), [
    'Wake by 09:00',
    'Morning routine',
    'Intermittent fasting',
    'Supplements',
    'No porn',
    'No TV or films',
    'No phone or technology on the toilet',
    'Weekly review & plan',
    'Evening routine',
  ]);

  assert.equal(byName(standards, 'Wake by').weekdays, 'MTWTFS-', 'Sunday he can sleep in');
  assert.equal(byName(standards, 'Intermittent fasting').weekdays, 'MTWTF--', 'weekdays only');
  assert.equal(byName(standards, 'No TV').weekdays, 'MTWTFS-', 'Sunday is open');
  assert.equal(byName(standards, 'Weekly review').weekdays, '-----S-', 'Saturday only');
  assert.equal(byName(standards, 'No porn').pinned, true, 'this one does not take holidays');

  // Ejaculation is on the printed camp calendar now; the objectives are on
  // the weekly sheet. Neither belongs here twice.
  assert.ok(!standards.some((s) => /ejacul/i.test(s.name)));
  assert.ok(!standards.some((s) => /objective/i.test(s.name)));
  db.close();
});

test('the morning is a run on a weekday and the light at the weekend', () => {
  const { db } = tempDb();
  const applies = (date: string) =>
    byName(store.getDay(db, date).cells, 'Morning routine')
      .steps.filter((s) => s.applicable).map((s) => s.name);

  assert.deepEqual(applies(MON), ['Run', 'Meditate — 15 minutes', 'Read']);
  assert.deepEqual(applies('2026-08-28'), ['Run', 'Meditate — 15 minutes', 'Read'],
    'Friday runs too');

  // Saturday and Sunday: no run, and the sit is saved for the evening.
  for (const weekend of [SAT, SUN]) {
    assert.deepEqual(applies(weekend), ['Outside — sunlight and a stretch'], weekend);
  }

  // One tick closes the weekend morning.
  const outside = byName(store.getDay(db, SAT).cells, 'Morning routine')
    .steps.find((s) => s.name.startsWith('Outside'))!;
  store.setStep(db, SAT, outside.id, true);
  assert.equal(byName(store.getDay(db, SAT).cells, 'Morning routine').status, 'kept');
  db.close();
});

test('the evening runs every night, and nothing digital comes to bed', () => {
  const { db } = tempDb();
  const tonight = (date: string) =>
    byName(store.getDay(db, date).cells, 'Evening routine')
      .steps.filter((s) => s.applicable).map((s) => s.name);

  for (const date of [MON, SAT, SUN]) {
    assert.deepEqual(tonight(date), [
      'Phone turned off',
      'Plan & reflect on the day',
      'Journal',
      "Set out tomorrow's outfit",
      'Meditate — 15 minutes',
    ], date);
  }
  // The podcast and the bedtime book are gone: he reads without being asked,
  // and going to sleep on a podcast was never comfortable.
  assert.ok(!tonight(MON).some((n) => /podcast|Read before bed/.test(n)));
  db.close();
});

test('Sunday releases what the schedule does not ask for', () => {
  const { db } = tempDb();
  const sun = store.getDay(db, SUN);
  assert.equal(byName(sun.cells, 'Wake by').status, 'released');
  assert.equal(byName(sun.cells, 'No TV').status, 'released');
  assert.equal(byName(sun.cells, 'Intermittent fasting').status, 'released');
  assert.equal(byName(sun.cells, 'Weekly review').status, 'released');

  assert.equal(byName(sun.cells, 'No porn').status, 'unanswered', 'every day, no exceptions');
  assert.equal(byName(sun.cells, 'Supplements').status, 'unanswered');
  assert.equal(byName(sun.cells, 'Morning routine').status, 'unanswered', 'runs every day');
  assert.equal(byName(sun.cells, 'Evening routine').status, 'unanswered', 'runs every day');
  db.close();
});


test('a Saturday checklist is complete without the released steps', () => {
  const { db } = tempDb();
  const evening = byName(store.getDay(db, SAT).cells, 'Evening routine');
  for (const s of evening.steps.filter((x) => x.applicable)) {
    store.setStep(db, SAT, s.id, true);
  }
  assert.equal(byName(store.getDay(db, SAT).cells, 'Evening routine').status, 'kept',
    'ticking only what applies tonight is enough');
  db.close();
});

test('a full day can be recorded and survives a restart', () => {
  const { db, file } = tempDb();
  const day = store.getDay(db, MON);

  for (const cell of day.cells) {
    if (cell.status === 'released' || cell.kind === 'checklist') continue;
    store.setMark(db, MON, cell.standardId, 'kept', '');
  }
  // One broken, with the reason that is the whole point of the exercise.
  const tv = byName(day.cells, 'No TV');
  store.setMark(db, MON, tv.standardId, 'broken', 'Watched two films back to back.');

  // Complete the morning routine step by step.
  const morning = byName(day.cells, 'Morning routine');
  for (const s of morning.steps) store.setStep(db, MON, s.id, true);

  db.close();

  const again = openDatabase(file);
  const reloaded = again.prepare('SELECT COUNT(*) n FROM mark WHERE date = ?').get(MON) as any;
  assert.ok(reloaded.n > 0, 'marks persisted');

  const view = store.getDay(again, MON);
  assert.equal(byName(view.cells, 'Wake by').status, 'kept');
  assert.equal(byName(view.cells, 'No TV').status, 'broken');
  assert.equal(byName(view.cells, 'No TV').reason, 'Watched two films back to back.');
  assert.equal(byName(view.cells, 'Morning routine').status, 'kept',
    'a completed checklist marks itself kept');
  again.close();
});

test('un-checking a step withdraws the automatic kept, but not an explicit broken', () => {
  const { db } = tempDb();
  const morning = byName(store.getDay(db, MON).cells, 'Morning routine');
  for (const s of morning.steps) store.setStep(db, MON, s.id, true);
  assert.equal(byName(store.getDay(db, MON).cells, 'Morning routine').status, 'kept');

  store.setStep(db, MON, morning.steps[0].id, false);
  assert.equal(byName(store.getDay(db, MON).cells, 'Morning routine').status, 'unanswered');

  // An explicit broken carries a reason and must not be silently overwritten.
  store.setMark(db, MON, morning.standardId, 'broken', 'Woke late, skipped it.');
  store.setStep(db, MON, morning.steps[1].id, false);
  const after = byName(store.getDay(db, MON).cells, 'Morning routine');
  assert.equal(after.status, 'broken');
  assert.equal(after.reason, 'Woke late, skipped it.');
  db.close();
});

test('a one-day block releases one standard without touching the rest', () => {
  const { db } = tempDb();
  const wake = byName(store.getDay(db, MON).cells, 'Wake by');
  const block = store.setBlock(db, {
    startDate: MON, endDate: MON, lineageId: wake.lineageId, reason: 'Flight landed at 4am.',
  });

  const view = store.getDay(db, MON);
  const cell = byName(view.cells, 'Wake by');
  assert.equal(cell.status, 'away');
  assert.equal(cell.awayReason, 'Flight landed at 4am.');
  assert.equal(byName(view.cells, 'No TV').status, 'unanswered', 'others untouched');

  store.clearBlock(db, block.id);
  assert.equal(byName(store.getDay(db, MON).cells, 'Wake by').status, 'unanswered');
  db.close();
});

test('a holiday blocks the whole sheet, bar what is pinned', () => {
  const { db } = tempDb();
  const porn = byName(store.currentStandards(db), 'No porn');
  assert.equal(porn.pinned, true, 'this one does not take holidays');

  store.setBlock(db, { startDate: '2026-08-24', endDate: '2026-08-28', reason: 'Italy' });

  for (const date of ['2026-08-24', '2026-08-26', '2026-08-28']) {
    const cells = store.getDay(db, date).cells;
    assert.equal(byName(cells, 'Morning routine').status, 'away', `away on ${date}`);
    assert.equal(byName(cells, 'Morning routine').awayReason, 'Italy');
    assert.equal(byName(cells, 'No porn').status, 'unanswered', 'pinned, so still asked');
    assert.equal(byName(cells, 'No porn').awayReason, null);
  }
  // Either side of the block, business as usual.
  assert.equal(byName(store.getDay(db, '2026-08-23').cells, 'Morning routine').status, 'unanswered');
  assert.equal(byName(store.getDay(db, '2026-08-29').cells, 'Morning routine').status, 'unanswered');

  // A pinned standard can still be ticked while away, and its run survives.
  store.setMark(db, '2026-08-26', byName(store.getDay(db, '2026-08-26').cells, 'No porn').standardId,
    'kept', '');
  assert.equal(byName(store.getDay(db, '2026-08-26').cells, 'No porn').status, 'kept');
  db.close();
});

test('a block hides what you ticked without deleting it', () => {
  const { db } = tempDb();
  const tv = byName(store.getDay(db, MON).cells, 'No TV');
  store.setMark(db, MON, tv.standardId, 'kept', '');

  const block = store.setBlock(db, { startDate: MON, endDate: MON, reason: 'Away' });
  assert.equal(byName(store.getDay(db, MON).cells, 'No TV').status, 'away',
    'the day is out of reach, whatever is recorded against it');

  // Undo the block and the tick is exactly where it was.
  store.clearBlock(db, block.id);
  assert.equal(byName(store.getDay(db, MON).cells, 'No TV').status, 'kept');
  assert.equal(byName(store.getDay(db, MON).cells, 'No TV').streak.current, 1);
  db.close();
});

test('a block ends a run; the schedule never does', () => {
  const { db } = tempDb();
  const tv = byName(store.getDay(db, MON).cells, 'No TV');   // Mon–Sat

  // Eight days clean, straight through a Sunday the schedule releases.
  for (const d of ['2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20',
                   '2026-08-21', '2026-08-22', '2026-08-24', '2026-08-25']) {
    store.setMark(db, d, tv.standardId, 'kept', '');
  }
  const before = byName(store.getDay(db, '2026-08-25').cells, 'No TV');
  assert.equal(before.streak.current, 8, 'the Sunday in the middle is free');
  assert.equal(before.streak.best, 8);

  // Now block out the 26th. The run ends there, and the record stands.
  store.setBlock(db, { startDate: '2026-08-26', endDate: '2026-08-26', reason: 'Away' });
  const after = byName(store.getDay(db, '2026-08-26').cells, 'No TV');
  assert.equal(after.status, 'away');
  assert.equal(after.streak.current, 0, 'a block you chose is not a free day');
  assert.equal(after.streak.best, 8, 'but what you did is still on the board');
  db.close();
});

test('editing a standard opens a new version and leaves history alone', () => {
  const { db } = tempDb();
  // Backdate the marks so "today" edits do not collide with the test data.
  const wake = store.currentStandards(db)[0];
  store.setMark(db, MON, wake.id, 'kept', '');

  store.updateStandard(db, wake.lineageId, { name: 'Wake by 08:30' });

  const versions = store.allVersions(db).filter((v) => v.lineageId === wake.lineageId);
  assert.equal(versions.length, 2, 'a new version was opened');
  assert.equal(versions[0].effectiveTo !== null, true, 'the old one was closed');
  assert.equal(versions[1].name, 'Wake by 08:30');

  // The old mark still resolves against the words that were true that day.
  assert.equal(byName(store.getDay(db, MON).cells, 'Wake by 09:00').status, 'kept');
  db.close();
});

test('a new standard shows up on the day you are filling in', () => {
  const { db } = tempDb();
  // Before noon the app is on yesterday; a standard added then must appear
  // there, not go missing until tomorrow.
  const created = store.createStandard(db, { name: 'Cold shower', kind: 'binary' });
  const today = store.getDay(db, trackingDate());
  assert.ok(today.cells.some((c) => c.name === 'Cold shower'),
    'the new standard is on the current sheet');
  assert.equal(created.effectiveFrom, trackingDate());
  db.close();
});

test('re-editing a standard that has not lived a full day does not stack versions', () => {
  const { db } = tempDb();
  const s = store.createStandard(db, { name: 'Cold shower', kind: 'binary' });
  store.setMark(db, trackingDate(), s.id, 'kept', '');

  store.updateStandard(db, s.lineageId, { name: 'Cold shower — 2 minutes' });
  store.updateStandard(db, s.lineageId, { name: 'Cold shower — 3 minutes' });

  const versions = store.allVersions(db).filter((v) => v.lineageId === s.lineageId);
  assert.equal(versions.length, 1, 'edited in place while still being drafted');
  // The mark made moments ago is still attached.
  const cell = store.getDay(db, trackingDate()).cells
    .find((c) => c.name.startsWith('Cold shower'))!;
  assert.equal(cell.status, 'kept');
  assert.equal(cell.name, 'Cold shower — 3 minutes');
  db.close();
});

test('retiring keeps the record but stops the asking', () => {
  const { db } = tempDb();
  const tv = store.currentStandards(db).find((s) => s.name.startsWith('No TV'))!;
  store.setMark(db, MON, tv.id, 'kept', '');
  store.retireStandard(db, tv.lineageId);

  assert.equal(store.currentStandards(db).some((s) => s.lineageId === tv.lineageId), false);
  assert.equal(byName(store.getDay(db, MON).cells, 'No TV').status, 'kept', 'history intact');
  db.close();
});

test('the CSV export writes one honest row per standard per day', () => {
  const { db } = tempDb();
  const wake = store.currentStandards(db)[0];
  store.setMark(db, MON, wake.id, 'kept', '');
  const csv = store.exportCsv(db);
  const lines = csv.trim().split('\n');
  assert.equal(lines[0], 'date,weekday,standard,status,reason');
  assert.ok(lines.some((l) => l.includes('"Wake by 09:00",kept')));
  assert.ok(lines.some((l) => l.startsWith(`${MON},Mon,`)));
  db.close();
});

test('a lineage can only ever have one version in force', () => {
  const { db } = tempDb();
  const sit = byName(store.currentStandards(db), 'Morning routine');

  // The bug this guards: a second live row on the same lineage made one of
  // the pair disappear from the list instead of raising anything.
  assert.throws(
    () => db.prepare(
      `INSERT INTO standard (lineage_id, display_order, name, definition, kind,
         weekdays, effective_from)
       VALUES (?, 99, 'Impostor', '', 'binary', 'MTWTFSS', '2000-01-01')`,
    ).run(sit.lineageId),
    /UNIQUE/,
  );

  // Versioning still works: an edit closes one version and opens the next.
  store.updateStandard(db, sit.lineageId, { name: 'Morning routine — the first hour' });
  const versions = store.allVersions(db).filter((v) => v.lineageId === sit.lineageId);
  assert.ok(versions.length >= 1);
  assert.equal(
    store.currentStandards(db).filter((s) => s.lineageId === sit.lineageId).length, 1,
  );
});

test('retiring a standard takes nothing else with it', () => {
  const { db } = tempDb();
  const before = store.currentStandards(db);
  const sugar = store.createStandard(db, { name: 'No refined sugar or takeaway at all' });

  // The bug this guards: retire closed every live version on the lineage, and
  // a standard added by hand used to share its lineage with a seeded one — so
  // retiring the new standard silently retired the seeded one beside it.
  store.retireStandard(db, sugar.lineageId);

  const after = store.currentStandards(db);
  assert.equal(after.length, before.length, 'only the one standard goes');
  for (const name of before.map((s) => s.name)) {
    assert.ok(after.some((s) => s.name === name), `${name} survives`);
  }
  assert.ok(!after.some((s) => s.name === sugar.name), 'the retired one is gone');

  // And it is only closed, never deleted: the record it carries is still there.
  assert.ok(store.allVersions(db).some((v) => v.lineageId === sugar.lineageId));
});

test('every standard carries its run and the record to beat', () => {
  const { db } = tempDb();
  const tv = byName(store.getDay(db, MON).cells, 'No TV');

  // Four straight, then a break, then two. Sunday sits in the middle of the
  // second run and must not count against it — No TV is released on Sundays.
  const kept = ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13'];
  for (const d of kept) store.setMark(db, d, tv.standardId, 'kept', '');
  store.setMark(db, '2026-08-14', tv.standardId, 'broken', 'Film with the family.');
  for (const d of ['2026-08-15', '2026-08-17']) store.setMark(db, d, tv.standardId, 'kept', '');

  const after = byName(store.getDay(db, '2026-08-17').cells, 'No TV');
  assert.equal(after.streak.current, 2, 'the Sunday in between is transparent');
  assert.equal(after.streak.best, 4, 'the record still stands');

  // Two more days and the record falls.
  for (const d of ['2026-08-18', '2026-08-19', '2026-08-20']) {
    store.setMark(db, d, tv.standardId, 'kept', '');
  }
  const broken = byName(store.getDay(db, '2026-08-20').cells, 'No TV');
  assert.equal(broken.streak.current, 5);
  assert.equal(broken.streak.best, 5, 'the run and the record are the same thing now');

  // The run is read as at the day you are looking at, not as at today.
  const midway = byName(store.getDay(db, '2026-08-13').cells, 'No TV');
  assert.equal(midway.streak.current, 4);
  db.close();
});

test('a day not yet filled in does not end a run', () => {
  const { db } = tempDb();
  const tv = byName(store.getDay(db, MON).cells, 'No TV');
  for (const d of ['2026-08-10', '2026-08-11', '2026-08-12']) {
    store.setMark(db, d, tv.standardId, 'kept', '');
  }
  // Nothing recorded on the 13th yet — sitting down to fill it in is not a break.
  assert.equal(byName(store.getDay(db, '2026-08-13').cells, 'No TV').streak.current, 3);
  db.close();
});

test('the 1% keeps its own run', () => {
  const { db } = tempDb();
  for (const d of ['2026-08-10', '2026-08-11']) {
    store.setOnePercent(db, d, { text: 'Phone downstairs by 22:30' });
    store.setOnePercent(db, d, { status: 'hit' });
  }
  const day = store.getDay(db, '2026-08-11');
  assert.equal(day.onePercent.streak.current, 2);
  assert.equal(day.onePercent.streak.best, 2);

  // A night with nothing written is not a night it was missed.
  assert.equal(store.getDay(db, '2026-08-12').onePercent.streak.current, 2);
  db.close();
});

test('a block takes the 1% with the rest of the sheet', () => {
  const { db } = tempDb();
  for (const d of ['2026-08-20', '2026-08-21', '2026-08-22']) {
    store.setOnePercent(db, d, { text: 'Phone in the study by 22:30' });
    store.setOnePercent(db, d, { status: 'hit' });
  }
  assert.equal(store.getDay(db, '2026-08-22').onePercent.streak.current, 3);

  store.setBlock(db, { startDate: '2026-08-23', endDate: '2026-08-25', reason: 'Italy' });
  const away = store.getDay(db, '2026-08-24');
  assert.equal(away.onePercent.awayReason, 'Italy', 'nothing to write while away');
  assert.equal(away.onePercent.streak.current, 0, 'and the run goes with the days');
  assert.equal(away.onePercent.streak.best, 3, 'what was done still stands');

  // A night you simply did not write one is still transparent.
  const quiet = store.getDay(db, '2026-08-22');
  assert.equal(quiet.onePercent.awayReason, null);
  assert.equal(quiet.onePercent.streak.current, 3);
  db.close();
});


test('a veto is a night off that the run does not notice', () => {
  const { db } = tempDb();
  const evening = () => byName(store.getDay(db, MON).cells, 'Evening routine');
  assert.equal(evening().veto.allowed, 1, 'one a week, on the evening routine only');
  assert.equal(byName(store.getDay(db, MON).cells, 'Morning routine').veto.allowed, 0);

  // Four nights kept, then a Friday worked until one in the morning.
  const id = evening().standardId;
  for (const d of ['2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27']) {
    store.setMark(db, d, id, 'kept', '');
  }
  assert.equal(byName(store.getDay(db, '2026-08-27').cells, 'Evening routine').streak.current, 4);

  assert.equal(store.setVeto(db, '2026-08-28', evening().lineageId), true);
  const off = byName(store.getDay(db, '2026-08-28').cells, 'Evening routine');
  assert.equal(off.status, 'vetoed');
  assert.equal(off.veto.left, 0, 'that is the week gone');

  // The night does not count, and the run steps over it.
  store.setMark(db, '2026-08-29', byName(store.getDay(db, '2026-08-29').cells, 'Evening routine').standardId,
    'kept', '');
  assert.equal(byName(store.getDay(db, '2026-08-29').cells, 'Evening routine').streak.current, 5,
    'four before, one after, and the veto is transparent');
  db.close();
});

test('the allowance is one a week and it comes back on Monday', () => {
  const { db } = tempDb();
  const lineage = byName(store.getDay(db, MON).cells, 'Evening routine').lineageId;

  assert.equal(store.setVeto(db, '2026-08-28', lineage), true, 'Friday of that week');
  assert.equal(store.setVeto(db, '2026-08-29', lineage), false, 'Saturday of the same week');
  assert.equal(byName(store.getDay(db, '2026-08-29').cells, 'Evening routine').status, 'unanswered');

  // The next week is its own allowance.
  assert.equal(store.setVeto(db, '2026-09-04', lineage), true);
  assert.equal(byName(store.getDay(db, '2026-09-04').cells, 'Evening routine').veto.left, 0);

  // Taking it back returns it to the week it came from.
  store.clearVeto(db, '2026-08-28', lineage);
  assert.equal(byName(store.getDay(db, '2026-08-28').cells, 'Evening routine').veto.left, 1);
  assert.equal(store.setVeto(db, '2026-08-29', lineage), true, 'and can be spent elsewhere');
  db.close();
});

test('a veto cannot be spent on a standard with no allowance', () => {
  const { db } = tempDb();
  const morning = byName(store.getDay(db, MON).cells, 'Morning routine');
  assert.equal(store.setVeto(db, MON, morning.lineageId), false);
  assert.equal(byName(store.getDay(db, MON).cells, 'Morning routine').status, 'unanswered');
  db.close();
});

test('a veto is not wasted on a night that is already blocked', () => {
  const { db } = tempDb();
  const lineage = byName(store.getDay(db, MON).cells, 'Evening routine').lineageId;
  store.setBlock(db, { startDate: MON, endDate: MON, reason: 'Italy' });

  assert.equal(store.setVeto(db, MON, lineage), false, 'nothing to call off');
  assert.equal(byName(store.getDay(db, MON).cells, 'Evening routine').status, 'away');
  // And the week's allowance is still there to spend on a night that needs it.
  assert.equal(store.setVeto(db, '2026-08-28', lineage), true);
  db.close();
});
