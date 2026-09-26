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

test('the seed is the eleven standards, objectives among them', () => {
  const { db } = tempDb();
  const standards = store.currentStandards(db);
  assert.equal(standards.length, 11, 'eight standards and the three objectives');

  assert.equal(standards[0].name, 'Wake by 09:00', 'the wake-up leads');
  assert.equal(standards[0].weekdays, 'MTWTFS-', 'Sunday he can sleep in');
  assert.equal(byName(standards, 'Morning routine').weekdays, 'MTWTFSS', 'every day');
  assert.equal(byName(standards, 'Evening routine').weekdays, 'MTWTFSS', 'every day');
  assert.equal(byName(standards, 'Evening routine').steps.length, 7);
  assert.equal(byName(standards, 'No TV').weekdays, 'MTWTFS-', 'Sunday is open');
  assert.equal(byName(standards, 'Weekly review').weekdays, '-----S-', 'Saturday only');

  // Porn and ejaculation are one standard now: either one breaks it.
  assert.equal(standards.filter((x) => /porn|ejacul/i.test(x.name)).length, 1);
  assert.ok(byName(standards, 'No porn').definition.includes('either one breaks it'));

  // The room standard is every night, because the podcast plays off the Alexa.
  assert.equal(byName(standards, 'No digital technology').weekdays, 'MTWTFSS');

  // Nothing typed in: every standard is a tick.
  assert.ok(standards.every((x) => ['binary', 'abstain', 'checklist'].includes(x.kind)));
  db.close();
});

test('the morning routine is four non-negotiables and one bonus', () => {
  const { db } = tempDb();
  const morning = byName(store.currentStandards(db), 'Morning routine');
  assert.deepEqual(morning.steps.map((s) => s.name), [
    'Read', 'Exercises', 'Full exercise session', 'TRE', 'Meditate — 30 minutes',
  ]);
  assert.deepEqual(morning.steps.filter((s) => s.optional).map((s) => s.name),
    ['Full exercise session']);
  assert.ok(morning.steps.find((s) => s.name === 'Exercises')!.detail.includes('90/90s'));
  assert.equal(morning.definition, 'No phone until the morning routine is done.');

  // The bonus never holds the routine open.
  const required = morning.steps.filter((s) => !s.optional);
  for (const s of required) store.setStep(db, MON, s.id, true);
  assert.equal(byName(store.getDay(db, MON).cells, 'Morning routine').status, 'kept');
  db.close();
});

test('Sunday releases the Monday-to-Saturday standards and keeps the rest', () => {
  const { db } = tempDb();
  const sun = store.getDay(db, SUN);
  assert.equal(byName(sun.cells, 'Wake by').status, 'released');
  assert.equal(byName(sun.cells, 'No TV').status, 'released');
  assert.equal(byName(sun.cells, 'Weekly review').status, 'released');
  assert.equal(byName(sun.cells, 'No porn').status, 'unanswered', 'every day, no exceptions');
  assert.equal(byName(sun.cells, 'No digital technology').status, 'unanswered');
  assert.equal(byName(sun.cells, 'Morning routine').status, 'unanswered', 'runs every day');
  assert.equal(byName(sun.cells, 'Primary objective').status, 'unanswered');
  assert.equal(byName(sun.cells, 'Evening routine').status, 'unanswered', 'runs every day');
  db.close();
});

const tonight = (db: any, date: string) =>
  byName(store.getDay(db, date).cells, 'Evening routine')
    .steps.filter((s) => s.applicable).map((s) => s.name);

test('the evening routine runs every night, planning included', () => {
  const { db } = tempDb();
  for (const date of [MON, SAT, SUN]) {
    const cell = byName(store.getDay(db, date).cells, 'Evening routine');
    assert.equal(cell.status, 'unanswered', `asked on ${date}`);
  }
  // Every night: reflect, journal, tomorrow's outfit, the sit.
  for (const date of [MON, SAT, SUN]) {
    for (const name of ['Plan & reflect on the day', 'Journal',
                        "Set out tomorrow's outfit", 'Meditate — 30 minutes']) {
      assert.ok(tonight(db, date).includes(name), `${name} on ${date}`);
    }
  }
  db.close();
});

test('the late shifts swap the book for a podcast, phone away either way', () => {
  const { db } = tempDb();
  // Friday and Saturday: home at one in the morning. The podcast plays off the
  // Alexa, so the phone still goes to the study and nothing digital comes up.
  for (const late of ['2026-08-28', SAT]) {
    const steps = tonight(db, late);
    assert.ok(steps.includes('Phone stored away in study'), 'every night, late or not');
    assert.ok(!steps.includes('Read before bed'));
    assert.ok(steps.includes('Read or listen to a podcast'));
  }
  // Every other night the book stands.
  for (const quiet of [MON, SUN]) {
    const steps = tonight(db, quiet);
    assert.ok(steps.includes('Phone stored away in study'));
    assert.ok(steps.includes('Read before bed'));
    assert.ok(!steps.includes('Read or listen to a podcast'));
  }
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

test('an exemption releases one standard on one day without touching the rest', () => {
  const { db } = tempDb();
  const wake = byName(store.getDay(db, MON).cells, 'Wake by');
  store.setExemption(db, MON, wake.lineageId, 'Flight landed at 4am.');

  const view = store.getDay(db, MON);
  const cell = byName(view.cells, 'Wake by');
  assert.equal(cell.status, 'released');
  assert.equal(cell.exemptReason, 'Flight landed at 4am.');
  assert.equal(byName(view.cells, 'No TV').status, 'unanswered', 'others untouched');

  store.clearExemption(db, MON, wake.lineageId);
  assert.equal(byName(store.getDay(db, MON).cells, 'Wake by').status, 'unanswered');
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

test('the objectives read straight after the morning routine', () => {
  const { db } = tempDb();
  const names = store.currentStandards(db).map((s) => s.name);
  assert.deepEqual(names.slice(0, 5), [
    'Wake by 09:00',
    'Morning routine',
    'Primary objective',
    'Secondary objective',
    'Tertiary objective',
  ]);
  // The order is dense, so the numbers down the Manage list run 1, 2, 3…
  assert.deepEqual(
    store.currentStandards(db).map((s) => s.displayOrder),
    Array.from({ length: names.length }, (_, i) => i + 1),
  );
});

test('a lineage can only ever have one version in force', () => {
  const { db } = tempDb();
  const primary = byName(store.currentStandards(db), 'Primary objective');

  // The bug this guards: a second live row on the same lineage made one of
  // the pair disappear from the list instead of raising anything.
  assert.throws(
    () => db.prepare(
      `INSERT INTO standard (lineage_id, display_order, name, definition, kind,
         weekdays, points, effective_from)
       VALUES (?, 99, 'Impostor', '', 'binary', 'MTWTFSS', 10, '2000-01-01')`,
    ).run(primary.lineageId),
    /UNIQUE/,
  );

  // Versioning still works: an edit closes one version and opens the next.
  store.updateStandard(db, primary.lineageId, { name: 'Primary objective — the one that counts' });
  const versions = store.allVersions(db).filter((v) => v.lineageId === primary.lineageId);
  assert.ok(versions.length >= 1);
  assert.equal(
    store.currentStandards(db).filter((s) => s.lineageId === primary.lineageId).length, 1,
  );
});

test('retiring a standard takes nothing else with it', () => {
  const { db } = tempDb();
  const before = store.currentStandards(db);
  const sugar = store.createStandard(db, { name: 'No refined sugar or takeaway at all' });

  // The bug this guards: retire closed every live version on the lineage, and
  // a standard added by hand used to share its lineage with an objective — so
  // retiring the standard silently retired the objective beside it.
  store.retireStandard(db, sugar.lineageId);

  const after = store.currentStandards(db);
  assert.equal(after.length, before.length, 'only the one standard goes');
  for (const name of ['Primary objective', 'Secondary objective', 'Tertiary objective']) {
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
