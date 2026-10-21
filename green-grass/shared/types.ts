import type { ISODate } from './dates.js';

/** The 1%: unset until it is judged, then hit or missed. */
export type ObjectiveStatus = 'unset' | 'hit' | 'missed';

export type Kind = 'binary' | 'abstain' | 'checklist';

/**
 * The five states a cell can be in. Only kept/broken are ever stored.
 *
 * `released` and `away` both mean "not asked of you", and differ in what they
 * do to a run: a release the schedule made is transparent, a block you chose
 * ends it.
 */
export type CellStatus =
  | 'kept' | 'broken' | 'released' | 'away' | 'vetoed' | 'unanswered';

export interface StandardVersion {
  id: number;
  lineageId: number;
  displayOrder: number;
  name: string;
  definition: string;
  kind: Kind;
  weekdays: string;
  /** Does not take holidays: a block leaves it asked, tickable and counting. */
  pinned: boolean;
  /** Nights off you may spend on this standard each week. 0 for most. */
  vetoesPerWeek: number;
  effectiveFrom: ISODate;
  effectiveTo: ISODate | null;
  steps: RoutineStep[];
}

export interface RoutineStep {
  id: number;
  standardId: number;
  stepOrder: number;
  name: string;
  detail: string;
  /** null = applies whenever the routine applies. */
  weekdays: string | null;
  /** Shown and tickable, but it never holds the routine open. */
  optional: boolean;
}

export interface DayStepView extends RoutineStep {
  applicable: boolean;
  checked: boolean;
}

export interface DayCell {
  lineageId: number;
  standardId: number;
  name: string;
  definition: string;
  kind: Kind;
  displayOrder: number;
  status: CellStatus;
  /** The run of days kept up to this date, and the longest there has ever been. */
  streak: StreakInfo;
  reason: string;
  /** Set when a block put the day out of reach, rather than the schedule. */
  awayReason: string | null;
  /** The weekly allowance, what is left of it, and whether today is spent. */
  veto: { allowed: number; left: number; active: boolean };
  steps: DayStepView[];
}

export interface DayView {
  date: ISODate;
  cells: DayCell[];
  /** Written the night before, ticked that day, gone after it. */
  onePercent: {
    text: string; status: ObjectiveStatus; streak: StreakInfo;
    /** Set when a block covers the day: the 1% goes away with the sheet. */
    awayReason: string | null;
  };
  /** What he has set for tomorrow, so he can write it while winding down. */
  tomorrowOnePercent: string;
}

export interface StreakInfo {
  current: number;
  best: number;
}

/**
 * A stretch of days put out of reach. With no `lineageId` it covers every
 * standard that is not pinned; with one it is the single-standard exception.
 */
export interface Block {
  id: number;
  startDate: ISODate;
  endDate: ISODate;
  lineageId: number | null;
  reason: string;
}
