import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checklistComplete, resolveCell, standardApplies, stepApplies, versionInForce,
} from '../../shared/resolve.js';

// 2026-08-24 is a Monday, so this week runs Mon 24th … Sun 30th.
const MON = '2026-08-24';
const FRI = '2026-08-28';
const SAT = '2026-08-29';
const SUN = '2026-08-30';

const monToSat = { weekdays: 'MTWTFS-', pinned: false };
const everyDay = { weekdays: 'MTWTFSS', pinned: false };
const satOnly = { weekdays: '-----S-', pinned: false };

test('the weekday mask decides applicability', () => {
  assert.equal(standardApplies(monToSat, MON), true);
  assert.equal(standardApplies(monToSat, SAT), true);
  assert.equal(standardApplies(monToSat, SUN), false, 'Sunday is the day of rest');
  assert.equal(standardApplies(everyDay, SUN), true);
  assert.equal(standardApplies(satOnly, MON), false);
  assert.equal(standardApplies(satOnly, SAT), true);
});

test('a block puts the day away, and a pin ignores the block', () => {
  // Blocked: not asked, and — unlike a scheduled release — it ends the run.
  assert.equal(resolveCell(everyDay, MON, true, undefined), 'away');
  assert.equal(resolveCell(everyDay, MON, true, 'kept'), 'away');

  // Pinned: the block does not reach it.
  assert.equal(resolveCell({ ...everyDay, pinned: true }, MON, true, 'kept'), 'kept');
  assert.equal(resolveCell({ ...everyDay, pinned: true }, MON, true, undefined), 'unanswered');

  // The schedule still wins: nothing to miss on a day it was never asked.
  assert.equal(resolveCell(monToSat, SUN, true, undefined), 'released');
});

test('cells resolve to their states', () => {
  assert.equal(resolveCell(monToSat, MON, false, 'kept'), 'kept');
  assert.equal(resolveCell(monToSat, MON, false, 'broken'), 'broken');
  assert.equal(resolveCell(monToSat, MON, false, undefined), 'unanswered');
  assert.equal(resolveCell(monToSat, SUN, false, undefined), 'released');
});

test('a mark left behind on a now-released day does not resurface', () => {
  // Sunday reading was ticked, then the standard changed to Mon–Sat.
  assert.equal(resolveCell(monToSat, SUN, false, 'kept'), 'released');
});

test('steps can carry their own weekday mask', () => {
  const weekdaysOnly = { weekdays: 'MTWTF--' };
  assert.equal(stepApplies(weekdaysOnly, FRI), true);
  assert.equal(stepApplies(weekdaysOnly, SAT), false);
  assert.equal(stepApplies({ weekdays: null }, SAT), true, 'no mask means every day');
});

test('a checklist is kept when every applicable step is checked', () => {
  const steps = [
    { id: 1, weekdays: null, optional: false },
    { id: 2, weekdays: 'MTWTF--', optional: false }, // weekdays only
    { id: 3, weekdays: null, optional: false },
  ];
  assert.equal(checklistComplete(steps, MON, new Set([1, 3])), false);
  assert.equal(checklistComplete(steps, MON, new Set([1, 2, 3])), true);
  // On Saturday the weekday-only step is not required.
  assert.equal(checklistComplete(steps, SAT, new Set([1, 3])), true);
  assert.equal(checklistComplete(steps, SAT, new Set([1])), false);
});

test('the version in force is the one that was true that day', () => {
  const versions = [
    { effectiveFrom: '2000-01-01', effectiveTo: '2026-08-25', label: 'one hour' },
    { effectiveFrom: '2026-08-26', effectiveTo: null, label: 'thirty minutes' },
  ];
  assert.equal(versionInForce(versions, MON)?.label, 'one hour');
  assert.equal(versionInForce(versions, '2026-08-25')?.label, 'one hour');
  assert.equal(versionInForce(versions, '2026-08-26')?.label, 'thirty minutes');
  assert.equal(versionInForce(versions, '1999-01-01'), undefined);
});

test('an optional step is shown but never holds the routine open', () => {
  const steps = [
    { id: 1, weekdays: null, optional: false },
    { id: 2, weekdays: null, optional: true },   // the full exercise session
    { id: 3, weekdays: null, optional: false },
  ];
  assert.equal(checklistComplete(steps, MON, new Set([1, 3])), true,
    'the non-negotiables are enough');
  assert.equal(checklistComplete(steps, MON, new Set([1, 2, 3])), true,
    'and the bonus does not change that');
  assert.equal(checklistComplete(steps, MON, new Set([1, 2])), false,
    'but it cannot stand in for one of them');

  // A routine of nothing but optional steps is never automatically kept.
  assert.equal(checklistComplete([{ id: 9, weekdays: null, optional: true }], MON, new Set([9])),
    false);
});
