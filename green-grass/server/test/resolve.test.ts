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

const monToSat = { weekdays: 'MTWTFS-' };
const everyDay = { weekdays: 'MTWTFSS' };
const satOnly = { weekdays: '-----S-' };

test('the weekday mask decides applicability', () => {
  assert.equal(standardApplies(monToSat, MON, false), true);
  assert.equal(standardApplies(monToSat, SAT, false), true);
  assert.equal(standardApplies(monToSat, SUN, false), false, 'Sunday is the day of rest');
  assert.equal(standardApplies(everyDay, SUN, false), true);
  assert.equal(standardApplies(satOnly, MON, false), false);
  assert.equal(standardApplies(satOnly, SAT, false), true);
});

test('a per-date exemption releases the standard whatever the schedule says', () => {
  assert.equal(standardApplies(everyDay, MON, true), false);
  assert.equal(resolveCell(everyDay, MON, true, 'kept'), 'released');
});

test('cells resolve to the four states', () => {
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
    { id: 1, weekdays: null },
    { id: 2, weekdays: 'MTWTF--' }, // weekdays only
    { id: 3, weekdays: null },
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
