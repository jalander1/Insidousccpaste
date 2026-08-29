// All dates in this app are local calendar dates as 'YYYY-MM-DD'. Never UTC —
// a day belongs to the day the owner lived it, not to a timezone offset.

export type ISODate = string;

/** Monday = 0 … Sunday = 6. The whole app weeks from Monday. */
export type WeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const DOW_LETTER = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;
export const DOW_LONG = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
] as const;

export function toISO(d: Date): ISODate {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function fromISO(iso: ISODate): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: ISODate, n: number): ISODate {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function weekdayIndex(iso: ISODate): WeekdayIndex {
  return ((fromISO(iso).getDay() + 6) % 7) as WeekdayIndex;
}

/** The Monday of the week containing `iso`. */
export function mondayOf(iso: ISODate): ISODate {
  return addDays(iso, -weekdayIndex(iso));
}

export function monthOf(iso: ISODate): string {
  return iso.slice(0, 7);
}

export function daysBetween(from: ISODate, to: ISODate): number {
  const ms = fromISO(to).getTime() - fromISO(from).getTime();
  return Math.round(ms / 86_400_000);
}

export function rangeDates(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/**
 * The day the app opens on. The sheet was always filled the morning after, so
 * before noon we assume you are recording yesterday; after noon, today.
 */
export function trackingDate(now = new Date()): ISODate {
  const today = toISO(now);
  return now.getHours() < 12 ? addDays(today, -1) : today;
}

export function longDate(iso: ISODate): string {
  return fromISO(iso).toLocaleDateString(undefined, {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

export function shortDate(iso: ISODate): string {
  return fromISO(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function monthLabel(month: string): string {
  return fromISO(`${month}-01`).toLocaleDateString(undefined, {
    month: 'long', year: 'numeric',
  });
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function lastDayOfMonth(month: string): ISODate {
  const [y, m] = month.split('-').map(Number);
  return toISO(new Date(y, m, 0));
}
