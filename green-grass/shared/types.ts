import type { ISODate } from './dates.js';

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
  reason: string;
  /** Set when the cell is released by a per-date exemption rather than the schedule. */
  exemptReason: string | null;
  steps: DayStepView[];
}

export interface DayView {
  date: ISODate;
  note: string;
  prompt: string;
  cells: DayCell[];
}

export interface WeekView {
  weekStart: ISODate;
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
