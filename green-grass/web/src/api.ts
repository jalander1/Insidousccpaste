import type { DayView, StandardVersion, TrendsView, WeekView } from '../../shared/types.js';

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

const put = <T>(url: string, body: unknown) =>
  req<T>(url, { method: 'PUT', body: JSON.stringify(body) });
const post = <T>(url: string, body?: unknown) =>
  req<T>(url, { method: 'POST', body: JSON.stringify(body ?? {}) });

export const api = {
  today: () => req<{ trackingDate: string; actualDate: string }>('/api/today'),

  day: (date: string) => req<DayView>(`/api/day/${date}`),
  saveDay: (date: string, f: { note?: string }) => put<DayView>(`/api/day/${date}`, f),
  mark: (date: string, standardId: number, status: string, reason = '') =>
    put<DayView>(`/api/mark/${date}/${standardId}`, { status, reason }),
  step: (date: string, stepId: number, checked: boolean) =>
    put<DayView>(`/api/step/${date}/${stepId}`, { checked }),

  week: (weekStart: string) => req<WeekView>(`/api/week/${weekStart}`),

  standards: () => req<StandardVersion[]>('/api/standards'),
  createStandard: (f: Record<string, unknown>) => post<StandardVersion>('/api/standards', f),
  updateStandard: (lineageId: number, f: Record<string, unknown>) =>
    put<StandardVersion>(`/api/standards/${lineageId}`, f),
  reorder: (lineageIds: number[]) =>
    post<StandardVersion[]>('/api/standards/reorder', { lineageIds }),
  retire: (lineageId: number) => post<StandardVersion[]>(`/api/standards/${lineageId}/retire`),

  exemptions: () =>
    req<{ date: string; lineageId: number; reason: string }[]>('/api/exemptions'),
  exempt: (date: string, lineageId: number, reason: string) =>
    post<DayView>('/api/exemption', { date, lineageId, reason }),
  unexempt: (date: string, lineageId: number) =>
    req<DayView>('/api/exemption', {
      method: 'DELETE',
      body: JSON.stringify({ date, lineageId }),
      headers: { 'Content-Type': 'application/json' },
    }),

  trends: (from: string, to: string) => req<TrendsView>(`/api/trends?from=${from}&to=${to}`),

  dataLocation: () =>
    req<{ dbPath: string; backups: string; canReveal: boolean }>('/api/data-location'),
  reveal: () => post<{ revealed: boolean }>('/api/reveal'),
};
