import type { DB } from './db.js';
import { addDays, longDate, rangeDates, weekdayIndex, type ISODate }
  from '../../shared/dates.js';
import { resolveCell } from '../../shared/resolve.js';
import { computeStreaks, keptPercent, tally } from '../../shared/streaks.js';
import { allVersions, getDay, standardsAt } from './store.js';
import type { CellStatus } from '../../shared/types.js';

export const MODEL = 'claude-opus-5';

/**
 * The voice matters more than anything else here. This is a quiet ledger, and
 * he opens this half of it on the days it has not gone well.
 */
export const SYSTEM_PROMPT = `You are the reflective half of Green Grass, a private standards tracker its owner keeps for himself. He opens this to think out loud about how a day or a week actually went — often because it has not gone well, and he wants to say so somewhere.

How to write:
- Briefly. Two or three short paragraphs at the very most, usually less. Prose, not bullet points or headings.
- Specifically. You can see his record below. Refer to what is actually in it — "that is the third Friday in a row" is worth more than "consistency is hard".
- Curiously. A good question is usually worth more than a good suggestion. Ask one, and stop.

What you are not:
- Not a cheerleader. Do not congratulate him reflexively, do not use exclamation marks, do not tell him he is doing well or that he has got this.
- Not a disciplinarian. He already knows he missed it — that is why he is here. Never scold, never guilt, never suggest he has let himself or anyone else down.
- Not a therapist. No clinical language, no diagnosis, no referral scripts. If something heavier than a broken standard is surfacing, say so plainly, like a person would.

On the standards themselves: they are his, and they are editable in the app. If the record suggests a standard is mis-specified rather than merely unmet — one broken twenty times and never kept, or one that only ever fails on the nights he works — say so directly. Amending a standard so it describes a life he can actually live is a legitimate move, not a failure of nerve. Releasing a specific day is too. But do not talk him out of a standard he is simply finding hard; the difference between "this is badly written" and "this is difficult" is the whole game, and he is better placed than you to judge which is which.

On the abstinence standards, pornography and ejaculation among them: treat a lapse as neutral information, exactly as you would a missed hour of reading. No moralising, no shame, no framing of it as a relapse or a moral failure.

Never invent anything about his record. If you want to know something that is not below, ask him. The days he has not filled in are simply unanswered — they are not failures, and you should not read them as any.`;

const STATUS_WORD: Record<CellStatus, string> = {
  kept: 'kept', broken: 'broken', released: 'released', unanswered: 'not filled in',
};

/**
 * A compact picture of the record: what today asks, how the last month went,
 * and every reason he has written down for breaking something. Kept small on
 * purpose — the point is grounding, not a data dump.
 */
export function buildContext(db: DB, date: ISODate, days = 30): string {
  const from = addDays(date, -(days - 1));
  const dates = rangeDates(from, date);

  const exemptions = new Set<string>(
    (db.prepare('SELECT date, lineage_id FROM exemption WHERE date BETWEEN ? AND ?')
      .all(from, date) as any[]).map((r) => `${r.date}|${r.lineage_id}`),
  );
  const marks = new Map<string, { status: 'kept' | 'broken'; reason: string }>(
    (db.prepare('SELECT date, standard_id, status, reason FROM mark WHERE date BETWEEN ? AND ?')
      .all(from, date) as any[]).map((m) => [`${m.date}|${m.standard_id}`, m]),
  );

  const byLineage = new Map<number, any[]>();
  for (const v of allVersions(db)) {
    if (!byLineage.has(v.lineageId)) byLineage.set(v.lineageId, []);
    byLineage.get(v.lineageId)!.push(v);
  }

  const lines: string[] = [];
  lines.push(`Today is ${longDate(date)}.`);

  const today = getDay(db, date);
  const asked = today.cells.filter((c) => c.status !== 'released');
  lines.push('', `## The sheet for ${longDate(date)}`);
  for (const c of asked) {
    lines.push(`- ${c.name}: ${STATUS_WORD[c.status]}` +
      (c.status === 'broken' && c.reason ? ` — "${c.reason}"` : ''));
  }
  const releasedToday = today.cells.filter((c) => c.status === 'released');
  if (releasedToday.length) {
    lines.push(`Released today (not asked of him): ${releasedToday.map((c) => c.name).join(', ')}.`);
  }

  lines.push('', `## The last ${days} days`);
  const reasons: { date: ISODate; name: string; reason: string }[] = [];

  for (const [lineageId, versions] of byLineage) {
    const statuses: CellStatus[] = [];
    let name = versions[versions.length - 1].name;
    for (const d of dates) {
      const v = versions.find(
        (x: any) => x.effectiveFrom <= d && (x.effectiveTo === null || d <= x.effectiveTo));
      if (!v) continue;
      const mark = marks.get(`${d}|${v.id}`);
      const status = resolveCell(v, d, exemptions.has(`${d}|${lineageId}`), mark?.status);
      statuses.push(status);
      if (status === 'broken' && mark?.reason) {
        reasons.push({ date: d, name: v.name, reason: mark.reason });
      }
    }
    if (statuses.length === 0) continue;
    const t = tally(statuses);
    const pct = keptPercent(t.kept, t.broken);
    const streak = computeStreaks(statuses);
    lines.push(
      `- ${name}: kept ${t.kept}, broken ${t.broken}, not filled in ${t.unanswered}` +
      (pct === null ? '' : ` (${pct}% of the days he answered)`) +
      `; current run ${streak.current}, best run ${streak.best}.`);
  }

  if (reasons.length) {
    lines.push('', '## What he wrote when something broke');
    for (const r of reasons.slice(-25)) {
      lines.push(`- ${r.date} · ${r.name}: "${r.reason}"`);
    }
  }

  const notes = db.prepare(
    `SELECT date, note FROM day WHERE note <> '' AND date BETWEEN ? AND ?
      ORDER BY date DESC LIMIT 7`).all(from, date) as { date: string; note: string }[];
  if (notes.length) {
    lines.push('', '## His recent end-of-day notes');
    for (const n of notes.reverse()) lines.push(`- ${n.date}: "${n.note}"`);
  }

  const unanswered = dates.filter((d) => {
    const standards = standardsAt(db, d);
    return standards.length > 0 && standards.every((s) => !marks.has(`${d}|${s.id}`));
  });
  if (unanswered.length) {
    lines.push('', `## Days with nothing recorded at all`);
    lines.push(unanswered.length === dates.length
      ? 'Every day in this window is blank.'
      : `${unanswered.length} of the last ${days} days: ${unanswered.join(', ')}.`);
  }

  lines.push('', '## The standards as they are currently written');
  for (const s of standardsAt(db, date)) {
    const days7 = [...s.weekdays].map((c, i) =>
      (c === '-' ? '' : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i])).filter(Boolean);
    lines.push(`- ${s.name} (${days7.join(', ')})${s.definition ? `: ${s.definition}` : ''}` +
      (s.steps.length ? ` Steps: ${s.steps.map((x) => x.name).join('; ')}.` : ''));
  }

  return lines.join('\n');
}

// ------------------------------------------------------------------ storage

export interface ChatMessage { role: 'user' | 'assistant'; content: string }

export function getChat(db: DB, date: ISODate): ChatMessage[] {
  return db.prepare('SELECT role, content FROM chat_message WHERE date = ? ORDER BY id')
    .all(date) as ChatMessage[];
}

export function appendChat(
  db: DB, date: ISODate, role: 'user' | 'assistant', content: string,
): void {
  db.prepare(
    'INSERT INTO chat_message (date, role, content, created_at) VALUES (?, ?, ?, ?)',
  ).run(date, role, content, new Date().toISOString());
}

export function clearChat(db: DB, date: ISODate): void {
  db.prepare('DELETE FROM chat_message WHERE date = ?').run(date);
}

export function chatDates(db: DB): { date: string; messages: number }[] {
  return db.prepare(
    `SELECT date, COUNT(*) AS messages FROM chat_message
      GROUP BY date ORDER BY date DESC LIMIT 60`).all() as any[];
}

// ------------------------------------------------------------------ api key

export function getSetting(db: DB, key: string): string | null {
  const row = db.prepare('SELECT value FROM setting WHERE key = ?').get(key) as
    { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(db: DB, key: string, value: string): void {
  db.prepare(
    `INSERT INTO setting (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value);
}

/** Never hand the key itself back to the renderer — only proof it is there. */
export function apiKeyStatus(db: DB): { configured: boolean; hint: string | null } {
  const key = getSetting(db, 'anthropic_api_key');
  if (!key) return { configured: false, hint: null };
  return { configured: true, hint: `…${key.slice(-4)}` };
}
