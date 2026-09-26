import { weekdayIndex, type ISODate, type WeekdayIndex } from './dates.js';
import type { CellStatus, RoutineStep, StandardVersion } from './types.js';

/** A weekday mask is 7 chars, Mon..Sun; '-' means the standard is released. */
export function maskAllows(mask: string, wd: WeekdayIndex): boolean {
  return mask.length > wd && mask[wd] !== '-';
}

/**
 * Does this standard apply on this date? A per-date exemption wins; otherwise
 * it is simply the weekday schedule. Days are not classified beyond that — a
 * standard either applies today or it does not.
 */
export function standardApplies(
  standard: Pick<StandardVersion, 'weekdays'>,
  date: ISODate,
  exempt: boolean,
): boolean {
  if (exempt) return false;
  return maskAllows(standard.weekdays, weekdayIndex(date));
}

/** A step with its own mask is skipped on days that mask excludes. */
export function stepApplies(step: Pick<RoutineStep, 'weekdays'>, date: ISODate): boolean {
  if (!step.weekdays) return true;
  return maskAllows(step.weekdays, weekdayIndex(date));
}

/** The standard version in force on a given date, or undefined if none was. */
export function versionInForce<T extends { effectiveFrom: ISODate; effectiveTo: ISODate | null }>(
  versions: T[],
  date: ISODate,
): T | undefined {
  return versions.find(
    (v) => v.effectiveFrom <= date && (v.effectiveTo === null || date <= v.effectiveTo),
  );
}

/**
 * The full cell state for one standard on one date. `released` and
 * `unanswered` are computed here and never stored.
 */
export function resolveCell(
  standard: Pick<StandardVersion, 'weekdays'>,
  date: ISODate,
  exempt: boolean,
  mark: 'kept' | 'broken' | undefined,
): CellStatus {
  if (!standardApplies(standard, date, exempt)) return 'released';
  return mark ?? 'unanswered';
}

/**
 * A checklist is kept once every step that applies today is checked. Partial
 * completion is not auto-broken — you may still be mid-routine — but the step
 * data records exactly which step slipped.
 *
 * An optional step is shown and can be ticked, but it never holds the routine
 * open: a full exercise session on top of the non-negotiable set is a bonus,
 * not a condition.
 */
export function checklistComplete(
  steps: Pick<RoutineStep, 'id' | 'weekdays' | 'optional'>[],
  date: ISODate,
  checked: ReadonlySet<number>,
): boolean {
  const required = steps.filter((s) => !s.optional && stepApplies(s, date));
  if (required.length === 0) return false;
  return required.every((s) => checked.has(s.id));
}
