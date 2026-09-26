import type { ISODate } from './dates.js';

/** The 1%: unset until it is judged, then hit or missed. */
export type ObjectiveStatus = 'unset' | 'hit' | 'missed';

export type Kind = 'binary' | 'abstain' | 'checklist';

/** The four states a cell can be in. Only kept/broken are ever stored. */
export type CellStatus = 'kept' | 'broken' | 'released' | 'unanswered';

export interface StandardVersion {
  id: number;
  lineageId: number;
  displayOrder: number;
  name: string;
  definition: string;
  kind: Kind;
  weekdays: string;
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
  /** Set when the cell is released by a per-date exemption rather than the schedule. */
  exemptReason: string | null;
  steps: DayStepView[];
}

export interface DayView {
  date: ISODate;
  cells: DayCell[];
  /** Written the night before, ticked that day, gone after it. */
  onePercent: { text: string; status: ObjectiveStatus; streak: StreakInfo };
  /** What he has set for tomorrow, so he can write it while winding down. */
  tomorrowOnePercent: string;
}

export interface StreakInfo {
  current: number;
  best: number;
}
