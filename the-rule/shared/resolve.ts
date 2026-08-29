import { weekdayIndex, type ISODate, type WeekdayIndex } from './dates.js';
import type {
  AppliesRule, CellStatus, DayType, DayTypeSetting, RoutineStep, StandardVersion,
} from './types.js';

/**
 * Day type defaults from the weekday: Mon–Thu normal, Fri–Sat work, Sun rest.
 * Bar work usually lands Friday and Saturday, sometimes Sunday — hence the
 * per-date override.
 */
export function defaultDayType(date: ISODate): DayType {
  const wd = weekdayIndex(date);
  if (wd === 6) return 'rest';
  if (wd === 4 || wd === 5) return 'work';
  return 'normal';
}

export function resolveDayType(date: ISODate, setting: DayTypeSetting): DayType {
  return setting === 'auto' ? defaultDayType(date) : setting;
}

/** A weekday mask is 7 chars, Mon..Sun; '-' means the standard is released. */
export function maskAllows(mask: string, wd: WeekdayIndex): boolean {
  return mask.length > wd && mask[wd] !== '-';
}

function ruleApplies(rule: AppliesRule, mask: string, wd: WeekdayIndex): boolean | null {
  if (rule === 'never') return false;
  if (rule === 'always') return true;
  return null; // 'schedule' — fall through to the weekday mask
}

/**
 * Does this standard apply on this date? Most specific wins:
 * per-date exemption, then the day-type rule, then the weekday schedule.
 */
export function standardApplies(
  standard: Pick<StandardVersion, 'weekdays' | 'appliesOnRest' | 'appliesOnWork'>,
  date: ISODate,
  dayType: DayType,
  exempt: boolean,
): boolean {
  if (exempt) return false;
  const wd = weekdayIndex(date);
  if (dayType === 'rest') {
    const r = ruleApplies(standard.appliesOnRest, standard.weekdays, wd);
    if (r !== null) return r;
  } else if (dayType === 'work') {
    const r = ruleApplies(standard.appliesOnWork, standard.weekdays, wd);
    if (r !== null) return r;
  }
  return maskAllows(standard.weekdays, wd);
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
  standard: Pick<StandardVersion, 'weekdays' | 'appliesOnRest' | 'appliesOnWork'>,
  date: ISODate,
  dayType: DayType,
  exempt: boolean,
  mark: 'kept' | 'broken' | undefined,
): CellStatus {
  if (!standardApplies(standard, date, dayType, exempt)) return 'released';
  return mark ?? 'unanswered';
}

/**
 * A checklist is kept once every step that applies today is checked. Partial
 * completion is not auto-broken — the owner may still be mid-routine — but the
 * step data records exactly which step slipped.
 */
export function checklistComplete(
  steps: Pick<RoutineStep, 'id' | 'weekdays'>[],
  date: ISODate,
  checked: ReadonlySet<number>,
): boolean {
  const applicable = steps.filter((s) => stepApplies(s, date));
  if (applicable.length === 0) return false;
  return applicable.every((s) => checked.has(s.id));
}
