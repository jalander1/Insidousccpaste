import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../src/db.js';
import * as store from '../src/store.js';
import * as reflect from '../src/reflect.js';

function tempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rule-reflect-'));
  return openDatabase(path.join(dir, 'rule.db'));
}

const MON = '2026-08-24';
const TUE = '2026-08-25';

test('the context carries the record, not just the standards', () => {
  const db = tempDb();
  const day = store.getDay(db, MON);
  const wake = day.cells.find((c) => c.name.startsWith('Wake'))!;
  const insta = day.cells.find((c) => c.name.startsWith('Instagram'))!;

  store.setMark(db, MON, wake.standardId, 'kept', '');
  store.setMark(db, TUE, wake.standardId, 'broken', 'Worked until two, slept through it.');
  store.setMark(db, MON, insta.standardId, 'broken', 'Scrolled after the shift.');
  store.setDayFields(db, MON, { note: 'Off the pace all week.' });

  const ctx = reflect.buildContext(db, TUE);

  assert.ok(ctx.includes('Worked until two, slept through it.'), 'reasons are included');
  assert.ok(ctx.includes('Scrolled after the shift.'));
  assert.ok(ctx.includes('Off the pace all week.'), 'notes are included');
  assert.ok(ctx.includes('Wake by 09:00'), 'standards are named');
  assert.ok(/kept 1, broken 1/.test(ctx), 'counts are summarised');
  assert.ok(ctx.includes('current run'), 'streaks are included');
  db.close();
});

test('a released day is described as released, never as a failure', () => {
  const db = tempDb();
  const SUN = '2026-08-30';
  const ctx = reflect.buildContext(db, SUN);
  assert.ok(/Released today/.test(ctx));
  assert.ok(!/failed|failure/i.test(ctx), 'nothing in the context calls a day a failure');
  db.close();
});

test('blank days are reported as unanswered rather than broken', () => {
  const db = tempDb();
  const ctx = reflect.buildContext(db, MON, 7);
  assert.ok(ctx.includes('Every day in this window is blank.'));
  assert.ok(!/broken 7/.test(ctx));
  db.close();
});

test('the conversation is stored per day and can be cleared', () => {
  const db = tempDb();
  reflect.appendChat(db, MON, 'user', 'I fell off this week.');
  reflect.appendChat(db, MON, 'assistant', 'Which day did it start?');
  reflect.appendChat(db, TUE, 'user', 'Better today.');

  assert.equal(reflect.getChat(db, MON).length, 2);
  assert.equal(reflect.getChat(db, MON)[0].content, 'I fell off this week.');
  assert.equal(reflect.getChat(db, TUE).length, 1);

  reflect.clearChat(db, MON);
  assert.equal(reflect.getChat(db, MON).length, 0);
  assert.equal(reflect.getChat(db, TUE).length, 1, 'other days are untouched');
  db.close();
});

test('the api key is never handed back in full', () => {
  const db = tempDb();
  assert.deepEqual(reflect.apiKeyStatus(db), { configured: false, hint: null });

  reflect.setSetting(db, 'anthropic_api_key', 'sk-ant-secret-value-1234');
  const status = reflect.apiKeyStatus(db);
  assert.equal(status.configured, true);
  assert.equal(status.hint, '…1234');
  assert.ok(!JSON.stringify(status).includes('secret'), 'the key itself never leaves the server');
  db.close();
});

test('the system prompt holds the lines that matter', () => {
  const p = reflect.SYSTEM_PROMPT.toLowerCase();
  assert.ok(p.includes('not a cheerleader'));
  assert.ok(p.includes('never scold'));
  assert.ok(p.includes('no moralising'));
  assert.ok(p.includes('editable'), 'it may say a standard is mis-specified');
  assert.ok(p.includes('never invent'));
});
