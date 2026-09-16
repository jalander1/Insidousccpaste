import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bestRun, currentRun, rivalOf, scoreDay, verdictFor, weekPoints,
  type ScoredObjective,
} from '../../shared/score.js';
import type { CellStatus } from '../../shared/types.js';

const s = (str: string): CellStatus[] => [...str].map((c) => (
  c === 'k' ? 'kept' : c === 'b' ? 'broken' : c === 'r' ? 'released' : 'unanswered'
));
const none: ScoredObjective[] = [];
const noPct: { text: string; status: 'unset' | 'hit' | 'missed' } =
  { text: '', status: 'unset' };
const day = (date: string, statuses: string, objs = none, pct = noPct, past = true) =>
  scoreDay(date, s(statuses), objs, pct, past);

// Mon 24 Aug 2026 … Sun 30 Aug 2026.
const MON = '2026-08-24', TUE = '2026-08-25', SAT = '2026-08-29', SUN = '2026-08-30';

test('a kept standard is worth ten, and nothing else scores', () => {
  const d = day(MON, 'kkkkkkkkk');
  assert.equal(d.points, 90);
  assert.equal(d.kept, 9);
  assert.equal(d.asked, 9);
});

test('a broken standard and an unanswered one cost exactly the same', () => {
  assert.equal(day(MON, 'kkkkkkkkb').points, 80);
  assert.equal(day(MON, 'kkkkkkkku').points, 80, 'a blank is a loss, by his rule');
  assert.equal(day(MON, 'uuuuuuuuu').points, 0, 'a day never filled in scores nothing');
});

test('released days are not asked of him and do not dilute the day', () => {
  const sunday = day(SUN, 'rkrrkkkkr');
  assert.equal(sunday.asked, 5, 'Sunday asks five things, not nine');
  assert.equal(sunday.points, 50);
});

test('objectives are the way past a day you could not otherwise beat', () => {
  const objectives: ScoredObjective[] = [
    { tier: 'primary', text: 'Film the intro', status: 'hit' },
    { tier: 'secondary', text: 'Book the studio', status: 'hit' },
    { tier: 'tertiary', text: 'Clear the inbox', status: 'missed' },
  ];
  const perfect = day(MON, 'kkkkkkkkk');
  const perfectPlus = day(TUE, 'kkkkkkkkk', objectives);

  assert.equal(perfectPlus.points, 90 + 32, 'primary 20 + secondary 12');
  assert.equal(verdictFor(perfect, null), null, 'nothing behind it to race');
  assert.equal(verdictFor(perfectPlus, perfect), 'won',
    'a clean day can still be beaten, by reaching further');
});

test('the 1% is separate from the objectives and scores on its own', () => {
  const withPct = day(MON, 'kkkkkkkkk', none, { text: 'Phone left downstairs', status: 'hit' });
  assert.equal(withPct.onePercentPoints, 10);
  assert.equal(withPct.objectivePoints, 0, 'it is not one of the three tasks');
  assert.equal(withPct.points, 100);
});

test('matching yesterday holds the run — only going backwards breaks it', () => {
  const a = day(MON, 'kkkkkkkkk');
  const b = day(TUE, 'kkkkkkkkk');
  assert.equal(verdictFor(b, a), 'held');
  assert.equal(verdictFor(day(TUE, 'kkkkkkkkb'), a), 'lost');
});

test('Sunday scores but does not race, and Monday takes on the Saturday', () => {
  const sat = day(SAT, 'kkkkkkkkkk');
  const sun = day(SUN, 'rkrrkkkkr');
  const mon = day('2026-08-31', 'kkkkkkkkk');

  assert.equal(sun.competes, false);
  assert.equal(verdictFor(sun, sat), null, 'the Sabbath is not a contest');
  assert.equal(rivalOf([sat, sun, mon], '2026-08-31')?.date, SAT, 'Sunday is stepped over');
});

test('today is not losing just because it has not happened yet', () => {
  const inProgress = scoreDay(MON, s('uuuuuuuuu'), none, noPct, false);
  assert.equal(inProgress.settled, false);
  assert.equal(verdictFor(inProgress, day('2026-08-23', 'kkkkkkkkk')), null);

  const finished = scoreDay(MON, s('kkkkkkkkb'), none, noPct, false);
  assert.equal(finished.settled, true, 'answered in full, so it settles the same day');
});

test('a stretch of blank days is not a run of holding level', () => {
  const blanks = [
    day('2026-08-17', 'uuuuuuuuu'),
    day('2026-08-18', 'uuuuuuuuu'),
    day('2026-08-19', 'uuuuuuuuu'),
  ];
  assert.equal(verdictFor(blanks[1], blanks[0]), 'lost', 'nothing beats nothing');
  assert.equal(currentRun(blanks), 0);
  assert.equal(bestRun(blanks), 0);
});

test('a run counts days that held or better, and a drop ends it', () => {
  const week = [
    day('2026-08-17', 'kkkkkkkkb'),  // 80
    day('2026-08-18', 'kkkkkkkkk'),  // 90  won
    day('2026-08-19', 'kkkkkkkkk'),  // 90  held
    day('2026-08-20', 'kkkkkkkkk'),  // 90  held
  ];
  assert.equal(currentRun(week), 3);
  assert.equal(bestRun(week), 3);

  const broken = [...week, day('2026-08-21', 'kkkkkkbbb')];
  assert.equal(currentRun(broken), 0, 'the drop ends it');
  assert.equal(bestRun(broken), 3, 'but the record stands');
});

test('the week is simply the sum of its days', () => {
  assert.equal(weekPoints([day(MON, 'kkkkkkkkk'), day(TUE, 'kkkkkkkkb')]), 170);
});
