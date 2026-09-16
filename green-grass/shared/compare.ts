import type { ISODate } from './dates.js';
import type { Verdict } from './score.js';

/**
 * One thing that can be compared between two days: a standard, an objective
 * slot, or the 1%. `applicable` is false when the day never asked for it —
 * a released standard, or a Sunday that does not ask for the wake-up.
 */
export interface Comparable {
  key: string;
  name: string;
  applicable: boolean;
  achieved: boolean;
}

export interface ComparisonLine {
  key: string;
  name: string;
  /** What each day did with it, for the sentence beside the line. */
  today: boolean;
  yesterday: boolean;
}

export interface DayComparison {
  rival: ISODate | null;
  gained: ComparisonLine[];
  dropped: ComparisonLine[];
  level: number;
  verdict: Verdict | null;
}

/**
 * The day against yesterday, line by line: did you get up at nine today when
 * you did not yesterday? That is the point. Only things both days actually
 * asked for are compared, so a released standard cannot cost you anything and
 * an exemption is naturally neutral.
 */
export function compareDays(
  today: readonly Comparable[],
  yesterday: readonly Comparable[],
): { gained: ComparisonLine[]; dropped: ComparisonLine[]; level: number } {
  const before = new Map(yesterday.map((c) => [c.key, c]));
  const gained: ComparisonLine[] = [];
  const dropped: ComparisonLine[] = [];
  let level = 0;

  for (const now of today) {
    const then = before.get(now.key);
    if (!now.applicable || !then?.applicable) continue;
    const line = { key: now.key, name: now.name, today: now.achieved, yesterday: then.achieved };
    if (now.achieved && !then.achieved) gained.push(line);
    else if (!now.achieved && then.achieved) dropped.push(line);
    else level++;
  }
  return { gained, dropped, level };
}

export function verdictFromLines(
  gained: readonly unknown[],
  dropped: readonly unknown[],
  achievedSomething: boolean,
): Verdict {
  // A day that did nothing at all is a loss on its own terms. Without this, a
  // stretch of blank days compares level with itself and reads as an unbroken
  // run of holding the line at nothing.
  if (!achievedSomething) return 'lost';
  if (gained.length > dropped.length) return 'won';
  if (gained.length === dropped.length) return 'held';
  return 'lost';
}

/** Did the day put anything at all on the board? */
export function achievedSomething(items: readonly Comparable[]): boolean {
  return items.some((c) => c.applicable && c.achieved);
}

/** Consecutive days that did not go backwards, most recent first. */
export function runFromVerdicts(verdicts: readonly (Verdict | null)[]): number {
  let run = 0;
  for (let i = verdicts.length - 1; i >= 0; i--) {
    const v = verdicts[i];
    if (v === null) continue;
    if (v === 'won' || v === 'held') run++;
    else break;
  }
  return run;
}
