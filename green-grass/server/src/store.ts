import type { DB } from './db.js';
import {
  addDays, rangeDates, toISO, trackingDate, weekdayIndex, type ISODate,
} from '../../shared/dates.js';
import { checklistComplete, resolveCell, stepApplies } from '../../shared/resolve.js';
import { computeStreaks } from '../../shared/streaks.js';
import type {
  CellStatus, DayCell, DayView, Kind, ObjectiveStatus, RoutineStep,
  StandardVersion, StreakInfo,
} from '../../shared/types.js';

const now = () => new Date().toISOString();

// ---------------------------------------------------------------- standards

interface StandardRow {
  id: number; lineage_id: number; display_order: number; name: string;
  definition: string; kind: Kind; weekdays: string;
  effective_from: string; effective_to: string | null;
}

interface StepRow {
  id: number; standard_id: number; step_order: number;
  name: string; detail: string; weekdays: string | null; optional: number;
}

function toStep(r: StepRow): RoutineStep {
  return {
    id: r.id, standardId: r.standard_id, stepOrder: r.step_order,
    name: r.name, detail: r.detail, weekdays: r.weekdays,
    optional: !!r.optional,
  };
}

function toStandard(r: StandardRow, steps: RoutineStep[]): StandardVersion {
  return {
    id: r.id, lineageId: r.lineage_id, displayOrder: r.display_order,
    name: r.name, definition: r.definition, kind: r.kind, weekdays: r.weekdays,
    effectiveFrom: r.effective_from, effectiveTo: r.effective_to,
    steps: steps.filter((s) => s.standardId === r.id)
      .sort((a, b) => a.stepOrder - b.stepOrder),
  };
}

function attachSteps(db: DB, rows: StandardRow[]): StandardVersion[] {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const steps = db.prepare(
    `SELECT * FROM routine_step WHERE standard_id IN (${ids.map(() => '?').join(',')})`,
  ).all(...ids) as StepRow[];
  const mapped = steps.map(toStep);
  return rows.map((r) => toStandard(r, mapped))
    .sort((a, b) => a.displayOrder - b.displayOrder);
}

/** Versions in force on a date — the definitions that were true when it was lived. */
export function standardsAt(db: DB, date: ISODate): StandardVersion[] {
  const rows = db.prepare(
    `SELECT * FROM standard
      WHERE effective_from <= ? AND (effective_to IS NULL OR effective_to >= ?)
      ORDER BY display_order`,
  ).all(date, date) as StandardRow[];
  return attachSteps(db, rows);
}

/** The live set — what the Manage screen edits. */
export function currentStandards(db: DB): StandardVersion[] {
  const rows = db.prepare(
    'SELECT * FROM standard WHERE effective_to IS NULL ORDER BY display_order',
  ).all() as StandardRow[];
  return attachSteps(db, rows);
}

export function allVersions(db: DB): StandardVersion[] {
  const rows = db.prepare(
    'SELECT * FROM standard ORDER BY lineage_id, effective_from',
  ).all() as StandardRow[];
  return attachSteps(db, rows);
}

// ---------------------------------------------------------------------- day

function ensureDay(db: DB, date: ISODate): void {
  db.prepare('INSERT OR IGNORE INTO day (date) VALUES (?)').run(date);
}

function exemptionsFor(db: DB, date: ISODate): Map<number, string> {
  const rows = db.prepare('SELECT lineage_id, reason FROM exemption WHERE date = ?')
    .all(date) as { lineage_id: number; reason: string }[];
  return new Map(rows.map((r) => [r.lineage_id, r.reason]));
}

/** The resolved rows for one date, without building the whole view. */
export function getOnePercent(db: DB, date: ISODate): { text: string; status: ObjectiveStatus } {
  const row = db.prepare('SELECT one_percent, one_percent_status FROM day WHERE date = ?')
    .get(date) as { one_percent: string; one_percent_status: ObjectiveStatus } | undefined;
  return { text: row?.one_percent ?? '', status: row?.one_percent_status ?? 'unset' };
}

export function setOnePercent(
  db: DB, date: ISODate, fields: { text?: string; status?: ObjectiveStatus },
): void {
  ensureDay(db, date);
  const current = getOnePercent(db, date);
  const text = fields.text ?? current.text;
  const status = !text.trim() ? 'unset' : (fields.status ?? current.status);
  db.prepare('UPDATE day SET one_percent = ?, one_percent_status = ? WHERE date = ?')
    .run(text, status, date);
}

/**
 * The run of days kept for every standard, counted up to and including `date`,
 * with the longest run there has ever been beside it. This is the whole game
 * now: a number to beat, held by nobody but you.
 *
 * Released days are transparent — a Sunday never breaks a Monday-to-Saturday
 * run — and a day not yet filled in does not end one either. Runs are read per
 * lineage, so re-wording a standard keeps its history.
 */
export function streaksUpTo(db: DB, date: ISODate): Map<number, StreakInfo> {
  const first = (db.prepare('SELECT MIN(effective_from) f FROM standard')
    .get() as { f: string | null }).f;
  const out = new Map<number, StreakInfo>();
  if (!first) return out;

  // Bounded so a long-lived record never makes opening the day slow.
  const from = first < addDays(date, -730) ? addDays(date, -730) : first;
  const dates = rangeDates(from, date);
  if (dates.length === 0) return out;

  const exempt = new Set<string>(
    (db.prepare('SELECT date, lineage_id FROM exemption WHERE date BETWEEN ? AND ?')
      .all(from, date) as any[]).map((r) => `${r.date}|${r.lineage_id}`),
  );
  const marks = new Map<string, 'kept' | 'broken'>(
    (db.prepare('SELECT date, standard_id, status FROM mark WHERE date BETWEEN ? AND ?')
      .all(from, date) as any[]).map((m) => [`${m.date}|${m.standard_id}`, m.status]),
  );

  const byLineage = new Map<number, StandardVersion[]>();
  for (const v of allVersions(db)) {
    if (!byLineage.has(v.lineageId)) byLineage.set(v.lineageId, []);
    byLineage.get(v.lineageId)!.push(v);
  }

  for (const [lineageId, versions] of byLineage) {
    const statuses: CellStatus[] = [];
    for (const d of dates) {
      const v = versions.find(
        (x) => x.effectiveFrom <= d && (x.effectiveTo === null || d <= x.effectiveTo),
      );
      if (!v) continue;  // the standard did not exist yet, or no longer does
      statuses.push(resolveCell(v, d, exempt.has(`${d}|${lineageId}`), marks.get(`${d}|${v.id}`)));
    }
    out.set(lineageId, computeStreaks(statuses));
  }
  return out;
}

/** The same count for the 1%, which is written fresh every night. */
function onePercentStreak(db: DB, date: ISODate): StreakInfo {
  const rows = db.prepare(
    `SELECT date, one_percent, one_percent_status FROM day
      WHERE date <= ? AND TRIM(one_percent) <> '' ORDER BY date`,
  ).all(date) as { one_percent_status: ObjectiveStatus }[];
  return computeStreaks(rows.map((r) =>
    r.one_percent_status === 'hit' ? 'kept'
      : r.one_percent_status === 'missed' ? 'broken' : 'unanswered'));
}

export function getDay(db: DB, date: ISODate): DayView {
  const standards = standardsAt(db, date);
  const exempt = exemptionsFor(db, date);
  const streaks = streaksUpTo(db, date);

  const marks = new Map<number, { status: 'kept' | 'broken'; reason: string }>(
    (db.prepare('SELECT standard_id, status, reason FROM mark WHERE date = ?')
      .all(date) as { standard_id: number; status: 'kept' | 'broken'; reason: string }[])
      .map((m) => [m.standard_id, { status: m.status, reason: m.reason }]),
  );
  const checked = new Set<number>(
    (db.prepare('SELECT step_id FROM step_check WHERE date = ? AND checked = 1')
      .all(date) as { step_id: number }[]).map((r) => r.step_id),
  );

  const cells: DayCell[] = standards.map((s) => {
    const isExempt = exempt.has(s.lineageId);
    const mark = marks.get(s.id);
    return {
      lineageId: s.lineageId,
      standardId: s.id,
      name: s.name,
      definition: s.definition,
      kind: s.kind,
      displayOrder: s.displayOrder,
      status: resolveCell(s, date, isExempt, mark?.status),
      streak: streaks.get(s.lineageId) ?? { current: 0, best: 0 },
      reason: mark?.reason ?? '',
      exemptReason: isExempt ? (exempt.get(s.lineageId) || '') : null,
      steps: s.steps.map((st) => ({
        ...st,
        applicable: stepApplies(st, date),
        checked: checked.has(st.id),
      })),
    };
  });

  return {
    date,
    cells,
    onePercent: { ...getOnePercent(db, date), streak: onePercentStreak(db, date) },
    tomorrowOnePercent: getOnePercent(db, addDays(date, 1)).text,
  };
}

export function setDayFields(db: DB, date: ISODate, fields: { note?: string }): void {
  ensureDay(db, date);
  if (fields.note !== undefined) {
    db.prepare('UPDATE day SET note = ? WHERE date = ?')
      .run(fields.note, date);
  }
}

export function setMark(
  db: DB, date: ISODate, standardId: number,
  status: CellStatus, reason: string,
): void {
  ensureDay(db, date);
  if (status === 'kept' || status === 'broken') {
    db.prepare(
      `INSERT INTO mark (date, standard_id, status, reason, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(date, standard_id) DO UPDATE SET
         status = excluded.status, reason = excluded.reason,
         updated_at = excluded.updated_at`,
    ).run(date, standardId, status, reason, now());
  } else {
    db.prepare('DELETE FROM mark WHERE date = ? AND standard_id = ?')
      .run(date, standardId);
  }
}

/**
 * Toggling a step keeps the parent mark honest: complete the checklist and the
 * standard is kept; undo a step and an auto-kept mark falls back to unanswered.
 * An explicit broken mark (which carries a reason) is left alone.
 */
export function setStep(db: DB, date: ISODate, stepId: number, checked: boolean): void {
  ensureDay(db, date);
  db.prepare(
    `INSERT INTO step_check (date, step_id, checked) VALUES (?, ?, ?)
     ON CONFLICT(date, step_id) DO UPDATE SET checked = excluded.checked`,
  ).run(date, stepId, checked ? 1 : 0);

  const step = db.prepare('SELECT standard_id FROM routine_step WHERE id = ?')
    .get(stepId) as { standard_id: number } | undefined;
  if (!step) return;

  const steps = (db.prepare(
    'SELECT id, weekdays, optional FROM routine_step WHERE standard_id = ?',
  ).all(step.standard_id) as { id: number; weekdays: string | null; optional: number }[])
    .map((r) => ({ ...r, optional: !!r.optional }));
  const done = new Set<number>(
    (db.prepare('SELECT step_id FROM step_check WHERE date = ? AND checked = 1')
      .all(date) as { step_id: number }[]).map((r) => r.step_id),
  );
  const complete = checklistComplete(steps, date, done);
  const current = db.prepare('SELECT status FROM mark WHERE date = ? AND standard_id = ?')
    .get(date, step.standard_id) as { status: string } | undefined;

  if (complete) setMark(db, date, step.standard_id, 'kept', '');
  else if (current?.status === 'kept') setMark(db, date, step.standard_id, 'unanswered', '');
}

// ------------------------------------------------------- standards: editing

/**
 * Editing never mutates history: the version in force is closed yesterday and
 * a new one opens today, so past marks keep pointing at the words that were
 * true when they were made.
 */
export function updateStandard(
  db: DB, lineageId: number,
  fields: {
    name?: string; definition?: string; kind?: Kind; weekdays?: string;
    steps?: { name: string; detail: string; weekdays: string | null; optional?: boolean }[];
  },
): StandardVersion | null {
  const cur = db.prepare(
    'SELECT * FROM standard WHERE lineage_id = ? AND effective_to IS NULL',
  ).get(lineageId) as StandardRow | undefined;
  if (!cur) return null;

  const today = toISO(new Date());
  const steps = db.prepare('SELECT * FROM routine_step WHERE standard_id = ? ORDER BY step_order')
    .all(cur.id) as StepRow[];

  const next = {
    name: fields.name ?? cur.name,
    definition: fields.definition ?? cur.definition,
    kind: fields.kind ?? cur.kind,
    weekdays: fields.weekdays ?? cur.weekdays,
  };
  const nextSteps = fields.steps
    ?? steps.map((s) => ({
      name: s.name, detail: s.detail, weekdays: s.weekdays, optional: !!s.optional,
    }));

  const unchanged =
    next.name === cur.name && next.definition === cur.definition &&
    next.kind === cur.kind && next.weekdays === cur.weekdays &&
    JSON.stringify(nextSteps) === JSON.stringify(
      steps.map((s) => ({
        name: s.name, detail: s.detail, weekdays: s.weekdays, optional: !!s.optional,
      })));
  if (unchanged) return currentStandards(db).find((s) => s.lineageId === lineageId) ?? null;

  db.transaction(() => {
    // A version that has not been in force for a completed day is still being
    // drafted: overwrite it in place rather than stacking a version per edit.
    // Safe for marks either way — they point at this same row.
    if (cur.effective_from >= trackingDate()) {
      db.prepare(
        `UPDATE standard SET name=?, definition=?, kind=?, weekdays=? WHERE id=?`,
      ).run(next.name, next.definition, next.kind, next.weekdays, cur.id);
      replaceSteps(db, cur.id, nextSteps);
      return;
    }
    db.prepare('UPDATE standard SET effective_to = ? WHERE id = ?')
      .run(addDays(today, -1), cur.id);
    const info = db.prepare(
      `INSERT INTO standard (lineage_id, display_order, name, definition, kind,
         weekdays, effective_from) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(lineageId, cur.display_order, next.name, next.definition, next.kind,
      next.weekdays, today);
    replaceSteps(db, Number(info.lastInsertRowid), nextSteps);
  })();

  return currentStandards(db).find((s) => s.lineageId === lineageId) ?? null;
}

function replaceSteps(
  db: DB, standardId: number,
  steps: { name: string; detail: string; weekdays: string | null; optional?: boolean }[],
): void {
  db.prepare('DELETE FROM routine_step WHERE standard_id = ?').run(standardId);
  const ins = db.prepare(
    `INSERT INTO routine_step (standard_id, step_order, name, detail, weekdays, optional)
     VALUES (?,?,?,?,?,?)`,
  );
  steps.forEach((s, i) =>
    ins.run(standardId, i + 1, s.name, s.detail, s.weekdays, s.optional ? 1 : 0));
}

export function createStandard(
  db: DB,
  f: {
    name: string; definition?: string; kind?: Kind; weekdays?: string;
    steps?: { name: string; detail: string; weekdays: string | null; optional?: boolean }[];
  },
): StandardVersion {
  // A new standard starts on the day you are currently filling in, so it shows
  // up on the sheet in front of you rather than tomorrow. Nothing has been
  // marked against it yet, so beginning it a day back costs no history.
  const start = trackingDate();
  const max = db.prepare(
    'SELECT COALESCE(MAX(lineage_id),0) l, COALESCE(MAX(display_order),0) d FROM standard',
  ).get() as { l: number; d: number };
  const lineageId = max.l + 1;
  db.transaction(() => {
    const info = db.prepare(
      `INSERT INTO standard (lineage_id, display_order, name, definition, kind,
         weekdays, effective_from) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(lineageId, max.d + 1, f.name, f.definition ?? '', f.kind ?? 'binary',
      f.weekdays ?? 'MTWTFSS', start);
    if (f.steps?.length) replaceSteps(db, Number(info.lastInsertRowid), f.steps);
  })();
  return currentStandards(db).find((s) => s.lineageId === lineageId)!;
}

/** Retiring closes the version — history keeps every mark ever made against it. */
export function retireStandard(db: DB, lineageId: number): void {
  db.prepare(
    'UPDATE standard SET effective_to = ? WHERE lineage_id = ? AND effective_to IS NULL',
  ).run(toISO(new Date()), lineageId);
}

export function reorderStandards(db: DB, lineageIds: number[]): void {
  const stmt = db.prepare('UPDATE standard SET display_order = ? WHERE lineage_id = ?');
  db.transaction(() => lineageIds.forEach((id, i) => stmt.run(i + 1, id)))();
}

// --------------------------------------------------------------- exemptions

export function setExemption(db: DB, date: ISODate, lineageId: number, reason: string): void {
  ensureDay(db, date);
  db.prepare(
    `INSERT INTO exemption (date, lineage_id, reason) VALUES (?, ?, ?)
     ON CONFLICT(date, lineage_id) DO UPDATE SET reason = excluded.reason`,
  ).run(date, lineageId, reason);
}

export function clearExemption(db: DB, date: ISODate, lineageId: number): void {
  db.prepare('DELETE FROM exemption WHERE date = ? AND lineage_id = ?').run(date, lineageId);
}

export function listExemptions(db: DB) {
  return db.prepare('SELECT date, lineage_id AS lineageId, reason FROM exemption ORDER BY date DESC')
    .all();
}

// ------------------------------------------------------------------ export

export function exportAll(db: DB) {
  const t = (name: string) => db.prepare(`SELECT * FROM ${name}`).all();
  return {
    exportedAt: now(),
    standard: t('standard'),
    routine_step: t('routine_step'),
    day: t('day'),
    mark: t('mark'),
    step_check: t('step_check'),
    exemption: t('exemption'),
  };
}

/** One row per date per standard, with the resolved status. */
export function exportCsv(db: DB): string {
  const bounds = db.prepare(
    `SELECT MIN(d) f, MAX(d) t FROM (
       SELECT MIN(date) d FROM mark UNION SELECT MAX(date) FROM mark
       UNION SELECT MIN(date) FROM day UNION SELECT MAX(date) FROM day)`,
  ).get() as { f: string | null; t: string | null };
  if (!bounds.f || !bounds.t) return 'date,weekday,standard,status,reason\n';

  const esc = (s: string) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const lines = ['date,weekday,standard,status,reason'];
  const marks = new Map<string, { status: string; reason: string }>(
    (db.prepare('SELECT date, standard_id, status, reason FROM mark').all() as any[])
      .map((m) => [`${m.date}|${m.standard_id}`, m]),
  );

  for (const date of rangeDates(bounds.f, bounds.t)) {
    const exempt = exemptionsFor(db, date);
    for (const s of standardsAt(db, date)) {
      const mark = marks.get(`${date}|${s.id}`);
      const status = resolveCell(s, date, exempt.has(s.lineageId), mark?.status as any);
      lines.push([
        date,
        ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][weekdayIndex(date)],
        esc(s.name),
        status,
        esc(mark?.reason ?? ''),
      ].join(','));
    }
  }
  return lines.join('\n') + '\n';
}
