import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checklistComplete, defaultDayType, resolveCell, standardApplies, stepApplies,
  versionInForce,
} from '../../shared/resolve.js';

// 2026-08-24 is a Monday, so this week runs Mon 24th … Sun 30th.
const MON = '2026-08-24';
const FRI = '2026-08-28';
const SAT = '2026-08-29';
const SUN = '2026-08-30';

const monToSat = { weekdays: 'MTWTFS-', appliesOnRest: 'schedule', appliesOnWork: 'schedule' } as const;
const everyDay = { weekdays: 'MTWTFSS', appliesOnRest: 'schedule', appliesOnWork: 'schedule' } as const;
const satOnly = { weekdays: '-----S-', appliesOnRest: 'schedule', appliesOnWork: 'schedule' } as const;

test('day types default from the weekday', () => {
  assert.equal(defaultDayType(MON), 'normal');
  assert.equal(defaultDayType(FRI), 'work');
  assert.equal(defaultDayType(SAT), 'work');
  assert.equal(defaultDayType(SUN), 'rest');
});

test('the weekday mask decides applicability', () => {
  assert.equal(standardApplies(monToSat, MON, 'normal', false), true);
  assert.equal(standardApplies(monToSat, SAT, 'work', false), true);
  assert.equal(standardApplies(monToSat, SUN, 'rest', false), false);
  assert.equal(standardApplies(everyDay, SUN, 'rest', false), true);
  assert.equal(standardApplies(satOnly, MON, 'normal', false), false);
  assert.equal(standardApplies(satOnly, SAT, 'work', false), true);
});

test('a per-date exemption beats everything else', () => {
  assert.equal(standardApplies(everyDay, MON, 'normal', true), false);
  assert.equal(resolveCell(everyDay, MON, 'normal', true, 'kept'), 'released');
});

test('day-type rules override the schedule in both directions', () => {
  const notOnWork = { ...everyDay, appliesOnWork: 'never' } as const;
  assert.equal(standardApplies(notOnWork, FRI, 'work', false), false);
  assert.equal(standardApplies(notOnWork, MON, 'normal', false), true);

  const alwaysOnRest = { ...monToSat, appliesOnRest: 'always' } as const;
  assert.equal(standardApplies(alwaysOnRest, SUN, 'rest', false), true);

  // A worked Sunday takes the work rule, not the rest rule.
  assert.equal(standardApplies(notOnWork, SUN, 'work', false), false);
  assert.equal(standardApplies(everyDay, SUN, 'work', false), true);
});

test('cells resolve to the four states', () => {
  assert.equal(resolveCell(monToSat, MON, 'normal', false, 'kept'), 'kept');
  assert.equal(resolveCell(monToSat, MON, 'normal', false, 'broken'), 'broken');
  assert.equal(resolveCell(monToSat, MON, 'normal', false, undefined), 'unanswered');
  assert.equal(resolveCell(monToSat, SUN, 'rest', false, undefined), 'released');
});

test('a mark left behind on a now-released day does not resurface', () => {
  // Sunday reading was ticked, then the standard changed to Mon–Sat.
  assert.equal(resolveCell(monToSat, SUN, 'rest', false, 'kept'), 'released');
});

test('steps carry their own weekday mask', () => {
  const planTomorrow = { weekdays: 'MTWTF-S' };
  assert.equal(stepApplies(planTomorrow, FRI), true);
  assert.equal(stepApplies(planTomorrow, SAT), false, 'Sunday needs no plan');
  assert.equal(stepApplies(planTomorrow, SUN), true);
  assert.equal(stepApplies({ weekdays: null }, SAT), true);
});

test('a checklist is kept when every applicable step is checked', () => {
  const steps = [
    { id: 1, weekdays: null },
    { id: 2, weekdays: 'MTWTF-S' }, // skipped on Saturday
    { id: 3, weekdays: null },
  ];
  assert.equal(checklistComplete(steps, MON, new Set([1, 3])), false);
  assert.equal(checklistComplete(steps, MON, new Set([1, 2, 3])), true);
  // On Saturday the plan-tomorrow step is not required.
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
