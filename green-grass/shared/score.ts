import { weekdayIndex, type ISODate } from './dates.js';
import type { CellStatus } from './types.js';

/**
 * What an ordinary standard is worth. Each standard carries its own price, so
 * the objectives — which are what actually move him forward — are worth more:
 * the primary task is priced at two standards.
 */
export const STANDARD_POINTS = 10;

/**
 * The 1% is written the night before and lives for that one day only. It is
 * priced level with a standard.
 */
export const ONE_PERCENT_POINTS = 10;

export type ObjectiveStatus = 'hit' | 'missed' | 'unset';
export type Verdict = 'won' | 'held' | 'lost';

export interface DayScore {
  date: ISODate;
  points: number;
  standardPoints: number;
  onePercentPoints: number;
  kept: number;
  asked: number;
  /** Sunday is the day of rest: it scores toward the week, but it does not race. */
  competes: boolean;
  /** A day is settled once it is over, or once every standard has an answer. */
  settled: boolean;
}

/**
 * An unanswered standard scores nothing, exactly as a broken one does. That is
 * deliberate and it is the owner's rule: a day left blank is a day lost, and
 * the way out is to go back and fill it in.
 */
/** One row of the day's ledger, worth whatever that standard is worth. */
export interface ScoredRow {
  status: CellStatus;
  points: number;
}

export function scoreDay(
  date: ISODate,
  rows: readonly ScoredRow[],
  onePercent: { text: string; status: ObjectiveStatus },
  isPast: boolean,
): DayScore {
  const asked = rows.filter((r) => r.status !== 'released');
  const kept = asked.filter((r) => r.status === 'kept');
  const answered = asked.filter((r) => r.status === 'kept' || r.status === 'broken');

  const standardPoints = kept.reduce((sum, r) => sum + r.points, 0);
  const onePercentPoints = onePercent.status === 'hit' ? ONE_PERCENT_POINTS : 0;
  // The 1% is set the night before and lives for one day, so it is only asked
  // of him when he actually set one.
  const onePercentAsked = onePercent.text.trim() ? 1 : 0;
  const onePercentAnswered = onePercent.status === 'unset' ? 0 : onePercentAsked;

  return {
    date,
    points: standardPoints + onePercentPoints,
    standardPoints,
    onePercentPoints,
    kept: kept.length + (onePercent.status === 'hit' ? 1 : 0),
    asked: asked.length + onePercentAsked,
    competes: weekdayIndex(date) !== 6,
    settled: isPast
      || (asked.length > 0
          && answered.length === asked.length
          && onePercentAnswered === onePercentAsked),
  };
}

/**
 * Yesterday is the rival — but the previous *competing* day, so a Monday races
 * the Saturday before it and the Sabbath is simply stepped over.
 */
export function rivalOf(scores: readonly DayScore[], date: ISODate): DayScore | null {
  const earlier = scores.filter((s) => s.date < date && s.competes && s.settled);
  return earlier.length ? earlier[earlier.length - 1] : null;
}

/**
 * Beating a perfect day is impossible on standards alone, so holding counts.
 * Only going backwards breaks a run — which is what objectives are for: they
 * are the way past a day you could not otherwise beat.
 */
export function verdictFor(day: DayScore, rival: DayScore | null): Verdict | null {
  if (!day.competes || !day.settled) return null;
  // A day that scored nothing at all is a loss on its own terms, whatever it
  // is measured against — otherwise a stretch of blank days reads as an
  // unbroken run of holding level at zero.
  if (day.asked > 0 && day.points === 0) return 'lost';
  if (!rival) return null;
  if (day.points > rival.points) return 'won';
  if (day.points === rival.points) return 'held';
  return 'lost';
}

/** Consecutive settled, competing days that did not go backwards. */
export function currentRun(scores: readonly DayScore[]): number {
  const racing = scores.filter((s) => s.competes && s.settled);
  let run = 0;
  for (let i = racing.length - 1; i >= 1; i--) {
    const v = verdictFor(racing[i], racing[i - 1]);
    if (v === 'won' || v === 'held') run++;
    else break;
  }
  return run;
}

export function bestRun(scores: readonly DayScore[]): number {
  const racing = scores.filter((s) => s.competes && s.settled);
  let best = 0, run = 0;
  for (let i = 1; i < racing.length; i++) {
    const v = verdictFor(racing[i], racing[i - 1]);
    if (v === 'won' || v === 'held') { run++; if (run > best) best = run; }
    else run = 0;
  }
  return best;
}

export const weekPoints = (scores: readonly DayScore[]): number =>
  scores.reduce((sum, s) => sum + s.points, 0);
