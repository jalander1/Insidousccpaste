import type { DB } from './db.js';
import {
  addDays, mondayOf, monthOf, rangeDates, toISO, trackingDate, weekdayIndex,
  type ISODate,
} from '../../shared/dates.js';
import { checklistComplete, resolveCell, stepApplies } from '../../shared/resolve.js';
import { computeStreaks, keptPercent, tally } from '../../shared/streaks.js';
import type {
  CellStatus, DayCell, DayView, Kind, RoutineStep, StandardVersion,
  TrendStandard, TrendsView, WeekView,
} from '../../shared/types.js';

/** One prompt per weekday, Monday first. */
export const PROMPTS = [
  'What did today ask of you that you did not want to give?',
  'Where did you reach for comfort?',
  'What did you make that will outlast today?',
  'Who did you serve today besides yourself?',
  'What have you been avoiding all week?',
  'What did you learn about your own limits this week?',
  'What is the rule for, and is it working?',
] as const;

export const promptFor = (date: ISODate) => PROMPTS[weekdayIndex(date)];

const now = () => new Date().toISOString();

// ---------------------------------------------------------------- standards

interface StandardRow {
  id: number; lineage_id: number; display_order: number; name: string;
  definition: string; kind: Kind; weekdays: string;
  effective_from: string; effective_to: string | null;
}

interface StepRow {
  id: number; standard_id: number; step_order: number;
  name: string; detail: string; weekdays: string | null;
}

function toStep(r: StepRow): RoutineStep {
  return {
    id: r.id, standardId: r.standard_id, stepOrder: r.step_order,
    name: r.name, detail: r.detail, weekdays: r.weekdays,
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

export function getDay(db: DB, date: ISODate): DayView {
  const row = db.prepare('SELECT * FROM day WHERE date = ?').get(date) as
    { note: string } | undefined;
  const standards = standardsAt(db, date);
  const exempt = exemptionsFor(db, date);

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
      reason: mark?.reason ?? '',
      exemptReason: isExempt ? (exempt.get(s.lineageId) || '') : null,
      steps: s.steps.map((st) => ({
        ...st,
        applicable: stepApplies(st, date),
        checked: checked.has(st.id),
      })),
    };
  });

  return { date, note: row?.note ?? '', prompt: promptFor(date), cells };
}

export function setDayFields(db: DB, date: ISODate, fields: { note?: string }): void {
  ensureDay(db, date);
  if (fields.note !== undefined) {
    db.prepare('UPDATE day SET note = ?, prompt_answered = ? WHERE date = ?')
      .run(fields.note, promptFor(date), date);
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

  const steps = db.prepare('SELECT id, weekdays FROM routine_step WHERE standard_id = ?')
    .all(step.standard_id) as { id: number; weekdays: string | null }[];
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

// --------------------------------------------------------------------- week

export function getWeek(db: DB, weekStart: ISODate): WeekView {
  const dates = rangeDates(weekStart, addDays(weekStart, 6));
  const today = toISO(new Date());

  // Resolve every date independently so a mid-week edit to a standard shows
  // the definition that was actually in force on each day.
  const perDate = dates.map((date) => ({
    date,
    standards: standardsAt(db, date),
    exempt: exemptionsFor(db, date),
    marks: new Map<number, { status: 'kept' | 'broken'; reason: string }>(
      (db.prepare('SELECT standard_id, status, reason FROM mark WHERE date = ?')
        .all(date) as any[]).map((m) => [m.standard_id, { status: m.status, reason: m.reason }]),
    ),
  }));

  const lineages = new Map<number, { name: string; definition: string; kind: Kind; order: number }>();
  for (const d of perDate) {
    for (const s of d.standards) {
      lineages.set(s.lineageId, {
        name: s.name, definition: s.definition, kind: s.kind, order: s.displayOrder,
      });
    }
  }

  const rows = [...lineages.entries()]
    .sort((a, b) => a[1].order - b[1].order)
    .map(([lineageId, meta]) => ({
      lineageId,
      name: meta.name,
      definition: meta.definition,
      kind: meta.kind,
      displayOrder: meta.order,
      cells: perDate.map((d) => {
        const s = d.standards.find((x) => x.lineageId === lineageId);
        if (!s) {
          // The standard did not exist on this date — released, honestly.
          return { date: d.date, standardId: null, status: 'released' as CellStatus, reason: '' };
        }
        const mark = d.marks.get(s.id);
        return {
          date: d.date,
          standardId: s.id,
          status: resolveCell(s, d.date, d.exempt.has(lineageId), mark?.status),
          reason: mark?.reason ?? '',
        };
      }),
    }));

  return {
    weekStart,
    days: perDate.map((d) => ({ date: d.date, isToday: d.date === today })),
    rows,
    tally: tally(rows.flatMap((r) => r.cells.map((c) => c.status))),
  };
}

// ------------------------------------------------------------------- trends

export function getTrends(db: DB, from: ISODate, to: ISODate): TrendsView {
  const dates = rangeDates(from, to);

  // Pull everything once; per-date queries across months get slow fast.
  const exemptions = new Set<string>(
    (db.prepare('SELECT date, lineage_id FROM exemption WHERE date BETWEEN ? AND ?')
      .all(from, to) as any[]).map((r) => `${r.date}|${r.lineage_id}`),
  );
  const marks = new Map<string, { status: 'kept' | 'broken'; reason: string }>(
    (db.prepare('SELECT date, standard_id, status, reason FROM mark WHERE date BETWEEN ? AND ?')
      .all(from, to) as any[]).map((m) => [`${m.date}|${m.standard_id}`,
      { status: m.status, reason: m.reason }]),
  );
  const checks = new Set<string>(
    (db.prepare(`SELECT date, step_id FROM step_check
                  WHERE date BETWEEN ? AND ? AND checked = 1`)
      .all(from, to) as any[]).map((r) => `${r.date}|${r.step_id}`),
  );

  const byLineage = new Map<number, StandardVersion[]>();
  for (const v of allVersions(db)) {
    if (!byLineage.has(v.lineageId)) byLineage.set(v.lineageId, []);
    byLineage.get(v.lineageId)!.push(v);
  }

  const standards: TrendStandard[] = [];

  for (const [lineageId, vs] of byLineage) {
    const inRange = vs.filter(
      (v) => v.effectiveFrom <= to && (v.effectiveTo === null || v.effectiveTo >= from),
    );
    if (inRange.length === 0) continue;
    const latest = vs[vs.length - 1];

    const statuses: CellStatus[] = [];
    const heatmap: { date: ISODate; status: CellStatus }[] = [];
    const reasons: { date: ISODate; reason: string }[] = [];
    const weekMap = new Map<ISODate, CellStatus[]>();
    const monthMap = new Map<string, CellStatus[]>();
    const stepStats = new Map<string, { stepId: number; missed: number; total: number }>();

    for (const date of dates) {
      const v = inRange.find(
        (x) => x.effectiveFrom <= date && (x.effectiveTo === null || date <= x.effectiveTo),
      );
      if (!v) continue;
      const mark = marks.get(`${date}|${v.id}`);
      const status = resolveCell(v, date, exemptions.has(`${date}|${lineageId}`), mark?.status);

      statuses.push(status);
      heatmap.push({ date, status });
      if (status === 'broken' && mark?.reason) reasons.push({ date, reason: mark.reason });

      const wk = mondayOf(date);
      if (!weekMap.has(wk)) weekMap.set(wk, []);
      weekMap.get(wk)!.push(status);
      const mo = monthOf(date);
      if (!monthMap.has(mo)) monthMap.set(mo, []);
      monthMap.get(mo)!.push(status);

      // Which step breaks the routine? Grouped by name so it survives versioning.
      if (v.kind === 'checklist' && status !== 'released') {
        for (const st of v.steps) {
          if (!stepApplies(st, date)) continue;
          const cur = stepStats.get(st.name) ?? { stepId: st.id, missed: 0, total: 0 };
          cur.total++;
          if (!checks.has(`${date}|${st.id}`)) cur.missed++;
          stepStats.set(st.name, cur);
        }
      }
    }

    const counts = tally(statuses);
    const bucket = (m: Map<any, CellStatus[]>) =>
      [...m.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])))
        .map(([k, s]) => {
          const t = tally(s);
          return { key: k, kept: t.kept, broken: t.broken, percent: keptPercent(t.kept, t.broken) };
        });

    standards.push({
      lineageId,
      name: latest.name,
      kind: latest.kind,
      displayOrder: latest.displayOrder,
      ...counts,
      percent: keptPercent(counts.kept, counts.broken),
      streak: computeStreaks(statuses),
      byWeek: bucket(weekMap).map(({ key, ...r }) => ({ weekStart: key as ISODate, ...r })),
      byMonth: bucket(monthMap).map(({ key, ...r }) => ({ month: key as string, ...r })),
      heatmap,
      steps: [...stepStats.entries()].map(([name, s]) => ({ name, ...s })),
      reasons: reasons.reverse(),
    });
  }

  standards.sort((a, b) => a.displayOrder - b.displayOrder);
  return { from, to, standards };
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
    steps?: { name: string; detail: string; weekdays: string | null }[];
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
    ?? steps.map((s) => ({ name: s.name, detail: s.detail, weekdays: s.weekdays }));

  const unchanged =
    next.name === cur.name && next.definition === cur.definition &&
    next.kind === cur.kind && next.weekdays === cur.weekdays &&
    JSON.stringify(nextSteps) === JSON.stringify(
      steps.map((s) => ({ name: s.name, detail: s.detail, weekdays: s.weekdays })));
  if (unchanged) return currentStandards(db).find((s) => s.lineageId === lineageId) ?? null;

  db.transaction(() => {
    // A version that has not been in force for a completed day is still being
    // drafted: overwrite it in place rather than stacking a version per edit.
    // Safe for marks either way — they point at this same row.
    if (cur.effective_from >= trackingDate()) {
      db.prepare(
        'UPDATE standard SET name=?, definition=?, kind=?, weekdays=? WHERE id=?',
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
  steps: { name: string; detail: string; weekdays: string | null }[],
): void {
  db.prepare('DELETE FROM routine_step WHERE standard_id = ?').run(standardId);
  const ins = db.prepare(
    'INSERT INTO routine_step (standard_id, step_order, name, detail, weekdays) VALUES (?,?,?,?,?)',
  );
  steps.forEach((s, i) => ins.run(standardId, i + 1, s.name, s.detail, s.weekdays));
}

export function createStandard(
  db: DB,
  f: {
    name: string; definition?: string; kind?: Kind; weekdays?: string;
    steps?: { name: string; detail: string; weekdays: string | null }[];
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
