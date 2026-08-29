import type { CellStatus, StreakInfo } from './types.js';

/**
 * Streaks over a chronological run of resolved cell states.
 *
 * Released days are transparent: a Sunday never breaks a Mon–Sat streak, and
 * neither does a date the owner explicitly exempted. Version changes need no
 * special handling here — the caller resolves each date against whichever
 * version was in force, so a re-worded standard keeps its history.
 */
export function computeStreaks(statuses: readonly CellStatus[]): StreakInfo {
  return { current: currentStreak(statuses), best: bestStreak(statuses) };
}

/**
 * Counts back from the most recent day. Trailing unanswered days are skipped
 * rather than counted as failures — an unfilled today should not read as a
 * broken streak before the owner has sat down to fill it in.
 */
export function currentStreak(statuses: readonly CellStatus[]): number {
  let count = 0;
  let started = false;
  for (let i = statuses.length - 1; i >= 0; i--) {
    const s = statuses[i];
    if (s === 'released') continue;
    if (s === 'unanswered') {
      if (!started) continue; // not yet recorded
      break; // a gap in the middle is not evidence of keeping
    }
    if (s === 'broken') break;
    started = true;
    count++;
  }
  return count;
}

/** The longest run of kept days. An unanswered day mid-run ends it. */
export function bestStreak(statuses: readonly CellStatus[]): number {
  let best = 0;
  let run = 0;
  for (const s of statuses) {
    if (s === 'released') continue;
    if (s === 'kept') {
      run++;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }
  return best;
}

export function tally(statuses: readonly CellStatus[]) {
  let kept = 0, broken = 0, unanswered = 0;
  for (const s of statuses) {
    if (s === 'kept') kept++;
    else if (s === 'broken') broken++;
    else if (s === 'unanswered') unanswered++;
  }
  return { kept, broken, unanswered };
}

/**
 * Kept as a share of days that were actually answered. Unanswered days are
 * excluded rather than counted as failures — this is a record, not a scold.
 * Returns null when nothing was answered.
 */
export function keptPercent(kept: number, broken: number): number | null {
  const answered = kept + broken;
  return answered === 0 ? null : Math.round((kept / answered) * 100);
}
