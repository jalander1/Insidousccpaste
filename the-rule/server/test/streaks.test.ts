import test from 'node:test';
import assert from 'node:assert/strict';
import { bestStreak, computeStreaks, currentStreak, keptPercent, tally }
  from '../../shared/streaks.js';
import type { CellStatus } from '../../shared/types.js';

const s = (str: string): CellStatus[] => [...str].map((c) => (
  c === 'k' ? 'kept' : c === 'b' ? 'broken' : c === 'r' ? 'released' : 'unanswered'
));

test('released days are transparent to streaks', () => {
  // Mon–Sat kept, Sunday released, then kept again: one unbroken run.
  assert.equal(currentStreak(s('kkkkkkrkkkkkk')), 12);
  assert.equal(bestStreak(s('kkkkkkrkkkkkk')), 12);
});

test('a broken day ends the current streak', () => {
  assert.equal(currentStreak(s('kkkkbkk')), 2);
  assert.equal(bestStreak(s('kkkkbkk')), 4);
});

test('a not-yet-filled day does not read as a failure', () => {
  // Today is unanswered because the owner has not sat down with it yet.
  assert.equal(currentStreak(s('kkkkku')), 5);
  assert.equal(currentStreak(s('kkkkkuu')), 5);
  // Released trailing days are equally invisible.
  assert.equal(currentStreak(s('kkkkkru')), 5);
});

test('a gap in the middle does break the run', () => {
  assert.equal(currentStreak(s('kkkukk')), 2);
  assert.equal(bestStreak(s('kkkukk')), 3);
});

test('empty and all-released histories are zero, not one', () => {
  assert.equal(currentStreak([]), 0);
  assert.equal(bestStreak([]), 0);
  assert.equal(currentStreak(s('rrrr')), 0);
  assert.equal(bestStreak(s('rrrr')), 0);
});

test('streaks survive a version change because status is all that is counted', () => {
  // Same lineage, re-worded mid-run: the caller resolved each date against
  // whichever version was in force, and the run is continuous.
  const before = s('kkk');
  const after = s('kkk');
  assert.equal(computeStreaks([...before, ...after]).current, 6);
});

test('kept percent ignores unanswered days', () => {
  assert.equal(keptPercent(3, 1), 75);
  assert.equal(keptPercent(0, 0), null, 'nothing answered yet');
  assert.equal(keptPercent(1, 0), 100);
  const t = tally(s('kkbur'));
  assert.deepEqual(t, { kept: 2, broken: 1, unanswered: 1 });
  assert.equal(keptPercent(t.kept, t.broken), 67);
});
