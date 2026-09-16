import { weekdayIndex, type ISODate } from './dates.js';
import type { CellStatus } from './types.js';

/**
 * The scoreboard. A standard kept is worth ten — standards are the floor, and
 * holding a floor is not what moves you forward. The day's objectives are the
 * needle movers and are priced above it: the primary task is worth two
 * standards.
 */
export const STANDARD_POINTS = 10;

export const TIERS = ['primary', 'secondary', 'tertiary'] as const;
export type Tier = (typeof TIERS)[number];

export const TIER_POINTS: Record<Tier, number> = {
  primary: 20, secondary: 12, tertiary: 8,
};

/**
 * The 1% is not one of the objectives. The objectives are the day's tasks; the
 * 1% is the one quality being done better than yesterday, and it is priced
 * level with a standard.
 */
export const ONE_PERCENT_POINTS = 10;

export type ObjectiveStatus = 'hit' | 'missed' | 'unset';
export type Verdict = 'won' | 'held' | 'lost';

export interface ScoredObjective {
  tier: Tier;
  text: string;
  status: ObjectiveStatus;
}

export interface DayScore {
  date: ISODate;
  points: number;
  standardPoints: number;
  objectivePoints: number;
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
export function scoreDay(
  date: ISODate,
  statuses: readonly CellStatus[],
  objectives: readonly ScoredObjective[],
  onePercent: { text: string; status: ObjectiveStatus },
  isPast: boolean,
): DayScore {
  const asked = statuses.filter((s) => s !== 'released').length;
  const kept = statuses.filter((s) => s === 'kept').length;
  const answered = statuses.filter((s) => s === 'kept' || s === 'broken').length;

  const standardPoints = kept * STANDARD_POINTS;
  const objectivePoints = objectives
    .filter((o) => o.status === 'hit')
    .reduce((sum, o) => sum + TIER_POINTS[o.tier], 0);
  const onePercentPoints = onePercent.status === 'hit' ? ONE_PERCENT_POINTS : 0;

  return {
    date,
    points: standardPoints + objectivePoints + onePercentPoints,
    standardPoints,
    objectivePoints,
    onePercentPoints,
    kept,
    asked,
    competes: weekdayIndex(date) !== 6,
    settled: isPast || (asked > 0 && answered === asked),
  };
}

/** The most points a day could have yielded, objectives set included. */
export function possiblePoints(
  asked: number, objectives: readonly ScoredObjective[],
): number {
  return asked * STANDARD_POINTS
    + objectives.filter((o) => o.text.trim()).reduce((s, o) => s + TIER_POINTS[o.tier], 0);
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
