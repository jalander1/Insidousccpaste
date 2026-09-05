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
  return { db: openDatabase(file), file, dir };
}

// A known week: Mon 24 Aug 2026 … Sun 30 Aug 2026.
const MON = '2026-08-24';
const SAT = '2026-08-29';
const SUN = '2026-08-30';

const byName = <T extends { name: string }>(cells: T[], name: string): T =>
  cells.find((c) => c.name.startsWith(name))!;

test('the seed is the owner’s ten standards', () => {
  const { db } = tempDb();
  const standards = store.currentStandards(db);
  assert.equal(standards.length, 10);
  assert.equal(standards[0].name, 'Wake by 09:00', 'the wake-up leads');
  assert.equal(standards[0].weekdays, 'MTWTFS-', 'Sunday is released');
  assert.equal(byName(standards, 'Evening routine').weekdays, 'MTWTFSS', 'every day');
  assert.equal(byName(standards, 'Morning routine').weekdays, 'MTWTFSS', 'every day');
  assert.equal(byName(standards, 'Evening routine').steps.length, 7);
  assert.equal(byName(standards, 'Weekly review').weekdays, '-----S-', 'Saturday only');
  // Nothing typed in: every standard is a tick.
  assert.deepEqual([...new Set(standards.map((s) => s.kind))].sort(),
    ['abstain', 'binary', 'checklist']);
  db.close();
});

test('Sunday releases the Monday-to-Saturday standards and keeps the rest', () => {
  const { db } = tempDb();
  const sun = store.getDay(db, SUN);
  assert.equal(byName(sun.cells, 'Wake by').status, 'released');
  assert.equal(byName(sun.cells, 'Content creation').status, 'released');
  assert.equal(byName(sun.cells, 'Reading').status, 'released');
  assert.equal(byName(sun.cells, 'No TV').status, 'released');
  assert.equal(byName(sun.cells, 'No porn').status, 'unanswered', 'every day, no exceptions');
  assert.equal(byName(sun.cells, 'Morning routine').status, 'unanswered', 'runs every day');
  assert.equal(byName(sun.cells, 'Instagram').status, 'unanswered');
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

test('the late shifts keep the phone and swap the book for a podcast', () => {
  const { db } = tempDb();
  // Friday and Saturday: home at one in the morning, phone stays in the room.
  for (const late of ['2026-08-28', SAT]) {
    const steps = tonight(db, late);
    assert.ok(!steps.includes('Phone away downstairs'), 'the phone may stay up');
    assert.ok(!steps.includes('Read before bed'));
    assert.ok(steps.includes('Read or listen to a podcast'));
  }
  // Every other night the book stands, and the phone goes downstairs.
  for (const quiet of [MON, SUN]) {
    const steps = tonight(db, quiet);
    assert.ok(steps.includes('Phone away downstairs'));
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
  const insta = byName(day.cells, 'Instagram');
  store.setMark(db, MON, insta.standardId, 'broken', 'Doom-scrolled after the shift.');

  // Complete the morning routine step by step.
  const morning = byName(day.cells, 'Morning routine');
  for (const s of morning.steps) store.setStep(db, MON, s.id, true);

  store.setDayFields(db, MON, { note: 'Slow start, finished strong.' });
  db.close();

  const again = openDatabase(file);
  const reloaded = again.prepare('SELECT COUNT(*) n FROM mark WHERE date = ?').get(MON) as any;
  assert.ok(reloaded.n > 0, 'marks persisted');

  const view = store.getDay(again, MON);
  assert.equal(byName(view.cells, 'Wake by').status, 'kept');
  assert.equal(byName(view.cells, 'Instagram').status, 'broken');
  assert.equal(byName(view.cells, 'Instagram').reason, 'Doom-scrolled after the shift.');
  assert.equal(byName(view.cells, 'Morning routine').status, 'kept',
    'a completed checklist marks itself kept');
  assert.equal(view.note, 'Slow start, finished strong.');
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
  assert.equal(byName(view.cells, 'Reading').status, 'unanswered', 'others untouched');

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

test('trends count the reasons and find the step that slips', () => {
  const { db } = tempDb();
  const day = store.getDay(db, MON);
  const insta = byName(day.cells, 'Instagram');
  store.setMark(db, MON, insta.standardId, 'broken', 'Bored on the bus.');
  store.setMark(db, '2026-08-25', insta.standardId, 'kept', '');

  const evening = byName(day.cells, 'Evening routine');
  // Journal every night, but never set out the outfit.
  const journal = evening.steps.find((s) => s.name === 'Journal')!;
  for (const d of [MON, '2026-08-25']) store.setStep(db, d, journal.id, true);

  const trends = store.getTrends(db, MON, '2026-08-25');
  const ig = trends.standards.find((s) => s.name.startsWith('Instagram'))!;
  assert.equal(ig.kept, 1);
  assert.equal(ig.broken, 1);
  assert.equal(ig.percent, 50);
  assert.deepEqual(ig.reasons.map((r) => r.reason), ['Bored on the bus.']);

  const ev = trends.standards.find((s) => s.name.startsWith('Evening routine'))!;
  const outfit = ev.steps.find((s) => s.name.startsWith('Set out'))!;
  assert.equal(outfit.missed, 2, 'never done in the window');
  assert.equal(ev.steps.find((s) => s.name === 'Journal')!.missed, 0);
  db.close();
});

test('the week holds a written reflection, kept per week', () => {
  const { db } = tempDb();
  const words = 'Fell off badly — moving flat and it swallowed the week. '
    + 'Back to it from Monday, starting with the wake-up.';
  store.setWeekReview(db, MON, words);

  assert.equal(store.getWeek(db, MON).review, words);
  assert.equal(store.getWeek(db, '2026-08-31').review, '', 'the next week is its own page');

  // It survives a restart, and shows up in the collected list.
  const reviews = store.listReviews(db) as { weekStart: string; review: string }[];
  assert.deepEqual(reviews, [{ weekStart: MON, review: words }]);

  store.setWeekReview(db, MON, '');
  assert.equal((store.listReviews(db) as any[]).length, 0, 'emptied reflections drop out');
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
