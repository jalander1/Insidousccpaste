import type { ISODate } from './dates.js';
import type { DayScore, ObjectiveStatus } from './score.js';
import type { DayComparison } from './compare.js';

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
  /** What keeping it is worth. The objectives are priced above a standard. */
  points: number;
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
  points: number;
  status: CellStatus;
  /** What the day being raced did with this same row. */
  yesterday: CellStatus | null;
  reason: string;
  /** Set when the cell is released by a per-date exemption rather than the schedule. */
  exemptReason: string | null;
  steps: DayStepView[];
}

export interface DayView {
  date: ISODate;
  cells: DayCell[];
  /** Written the night before, ticked that day, gone after it. */
  onePercent: { text: string; status: ObjectiveStatus; yesterday: ObjectiveStatus | null };
  /** What he has set for tomorrow, so he can write it while winding down. */
  tomorrowOnePercent: string;
  /** Points are the week's currency; the day is judged line by line. */
  score: DayScore;
  comparison: DayComparison;
  run: number;
}

export interface WeekView {
  weekStart: ISODate;
  /** What he wrote about the week as a whole. */
  review: string;
  points: number;
  lastWeekPoints: number;
  /** True while the week is still running — both totals are to the same day. */
  partial: boolean;
  days: { date: ISODate; isToday: boolean }[];
  rows: {
    lineageId: number;
    name: string;
    definition: string;
    kind: Kind;
    displayOrder: number;
    cells: { date: ISODate; standardId: number | null; status: CellStatus; reason: string }[];
  }[];
  tally: { kept: number; broken: number; unanswered: number };
}

export interface StreakInfo {
  current: number;
  best: number;
}

export interface TrendStandard {
  lineageId: number;
  name: string;
  kind: Kind;
  displayOrder: number;
  kept: number;
  broken: number;
  unanswered: number;
  percent: number | null;
  streak: StreakInfo;
  byWeek: { weekStart: ISODate; kept: number; broken: number; percent: number | null }[];
  byMonth: { month: string; kept: number; broken: number; percent: number | null }[];
  heatmap: { date: ISODate; status: CellStatus }[];
  steps: { name: string; stepId: number; missed: number; total: number }[];
  reasons: { date: ISODate; reason: string }[];
}

export interface TrendsView {
  from: ISODate;
  to: ISODate;
  standards: TrendStandard[];
}
