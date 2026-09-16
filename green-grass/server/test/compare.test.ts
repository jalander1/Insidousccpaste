import test from 'node:test';
import assert from 'node:assert/strict';
import {
  achievedSomething, compareDays, runFromVerdicts, verdictFromLines, type Comparable,
} from '../../shared/compare.js';

const item = (key: string, achieved: boolean, applicable = true): Comparable =>
  ({ key, name: key, applicable, achieved });

test('the day is read line by line: what you got today and did not yesterday', () => {
  const yesterday = [item('standard:1', false), item('standard:2', true), item('standard:3', true)];
  const today = [item('standard:1', true), item('standard:2', false), item('standard:3', true)];

  const { gained, dropped, level } = compareDays(today, yesterday);
  assert.deepEqual(gained.map((l) => l.key), ['standard:1'], 'up on the wake-up');
  assert.deepEqual(dropped.map((l) => l.key), ['standard:2'], 'down on the reading');
  assert.equal(level, 1);
  assert.equal(verdictFromLines(gained, dropped, true), 'held', 'one each way is level');
});

test('a line only counts when both days actually asked for it', () => {
  // Released today by an exemption: it cannot cost him, and it cannot flatter him.
  const yesterday = [item('standard:1', true), item('standard:2', true)];
  const today = [item('standard:1', false, false), item('standard:2', true)];

  const { gained, dropped, level } = compareDays(today, yesterday);
  assert.equal(dropped.length, 0, 'an exemption is not a loss');
  assert.equal(gained.length, 0);
  assert.equal(level, 1, 'only the comparable line is counted');
});

test('objectives compare as slots, because the task changes each day', () => {
  const yesterday = [{ key: 'objective:primary', name: 'Write the script', applicable: true, achieved: false }];
  const today = [{ key: 'objective:primary', name: 'Film the intro', applicable: true, achieved: true }];

  const { gained } = compareDays(today, yesterday);
  assert.equal(gained.length, 1);
  assert.equal(gained[0].name, 'Film the intro', 'named by what today asked of him');
});

test('setting no objective is doing less, not doing nothing', () => {
  const yesterday = [item('objective:primary', true)];
  const today = [item('objective:primary', false)];
  assert.equal(compareDays(today, yesterday).dropped.length, 1);
});

test('a day never filled in drops every line it shares with yesterday', () => {
  const yesterday = [item('standard:1', true), item('standard:2', true), item('standard:3', true)];
  const blank = [item('standard:1', false), item('standard:2', false), item('standard:3', false)];

  const { gained, dropped } = compareDays(blank, yesterday);
  assert.equal(dropped.length, 3);
  assert.equal(verdictFromLines(gained, dropped, achievedSomething(blank)), 'lost');
});

test('two blank days in a row do not hold the line at nothing', () => {
  const blank = [item('standard:1', false), item('standard:2', false)];
  const { gained, dropped } = compareDays(blank, blank);
  assert.equal(gained.length, 0);
  assert.equal(dropped.length, 0, 'nothing moved either way');
  assert.equal(verdictFromLines(gained, dropped, achievedSomething(blank)), 'lost',
    'but a day that put nothing on the board is still a loss');
});

test('more up than down wins, fewer loses, equal holds', () => {
  assert.equal(verdictFromLines([1, 2], [1], true), 'won');
  assert.equal(verdictFromLines([1], [1, 2], true), 'lost');
  assert.equal(verdictFromLines([], [], true), 'held', 'an identical day holds the line');
});

test('the run counts back over days that did not go backwards', () => {
  assert.equal(runFromVerdicts(['lost', 'won', 'held', 'held']), 3);
  assert.equal(runFromVerdicts(['won', 'won', 'lost']), 0);
  // Days that did not race — Sunday — are stepped over, not counted.
  assert.equal(runFromVerdicts(['won', null, 'held']), 2);
  assert.equal(runFromVerdicts([]), 0);
});
