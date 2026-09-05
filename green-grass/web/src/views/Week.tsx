import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { track, useDebouncedSave } from '../save.js';
import { addDays, DOW_LETTER, fromISO, longDate, mondayOf, shortDate, toISO }
  from '../../../shared/dates.js';
import type { CellStatus, WeekView } from '../../../shared/types.js';

const NEXT: Record<CellStatus, CellStatus> = {
  unanswered: 'kept', kept: 'broken', broken: 'unanswered', released: 'released',
};

export default function Week({
  date, setDate, onOpenDay,
}: { date: string; setDate: (d: string) => void; onOpenDay: (d: string) => void }) {
  const [weekStart, setWeekStart] = useState(mondayOf(date));
  const [week, setWeek] = useState<WeekView | null>(null);
  const [review, setReview] = useState('');
  const reviewFor = useRef('');

  /** Marking a cell refreshes the grid only — the reflection may be mid-sentence. */
  const refresh = useCallback(async (ws: string) => { setWeek(await api.week(ws)); }, []);

  const load = useCallback(async (ws: string) => {
    const v = await api.week(ws);
    setWeek(v);
    reviewFor.current = ws;
    setReview(v.review);
  }, []);

  useEffect(() => { void load(weekStart); }, [weekStart, load]);
  useEffect(() => { setWeekStart(mondayOf(date)); }, [date]);

  useDebouncedSave(review, async (v) => {
    if (reviewFor.current !== weekStart) return;
    return api.saveWeek(weekStart, v);
  });

  if (!week) return null;

  const isThisWeek = mondayOf(toISO(new Date())) === weekStart;
  const selected = week.days.findIndex((d) => d.date === date);

  const cycle = async (standardId: number | null, d: string, status: CellStatus,
                       reason: string) => {
    if (standardId === null || status === 'released') return;
    const next = NEXT[status];
    // Cycling off a broken cell deletes its reason. Ask first — that sentence
    // is the part of the record worth keeping.
    if (next !== 'broken' && reason.trim() &&
        !confirm(`Clear the reason you wrote?\n\n“${reason}”`)) return;
    // A cell going broken needs its reason, and that conversation belongs on
    // the day itself rather than in a cramped grid.
    if (await track(api.mark(d, standardId, next, ''))) void refresh(weekStart);
  };

  return (
    <>
      <div className="datebar">
        <button className="navbtn" onClick={() => setWeekStart(addDays(weekStart, -7))}
          aria-label="Previous week">←</button>
        <span className="label">
          {isThisWeek && <b>This week</b>}{isThisWeek && ' · '}
          {shortDate(weekStart)} – {shortDate(addDays(weekStart, 6))}
        </span>
        <button className="navbtn" onClick={() => setWeekStart(addDays(weekStart, 7))}
          aria-label="Next week">→</button>
      </div>

      <table className="grid">
        <thead>
          <tr>
            <th />
            {week.days.map((d, i) => (
              <th key={d.date}>
                <button
                  className={`daycol${d.isToday ? ' is-today' : ''}${i === selected ? ' is-sel' : ''}`}
                  onClick={() => setDate(d.date)}
                  onDoubleClick={() => onOpenDay(d.date)}
                  aria-label={longDate(d.date)}
                  title={longDate(d.date)}
                >
                  <span className="dow">{DOW_LETTER[i]}</span>
                  <span className="dnum">{fromISO(d.date).getDate()}</span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {week.rows.map((row, r) => (
            <tr key={row.lineageId}>
              <td className="stdcell">
                <div className="stdnum">{String(r + 1).padStart(2, '0')}</div>
                <div className="stdname">{row.name}</div>
              </td>
              {row.cells.map((c) => (
                <td className="cellwrap" key={c.date}>
                  <button
                    className={`mark ${c.status}`}
                    disabled={c.status === 'released'}
                    onClick={() => cycle(c.standardId, c.date, c.status, c.reason)}
                    title={c.reason || undefined}
                    aria-label={`${row.name}, ${longDate(c.date)}: ${c.status}`}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="tally">
        <span>kept <b>{week.tally.kept}</b></span>
        <span>broken <b>{week.tally.broken}</b></span>
        <span>unanswered <b>{week.tally.unanswered}</b></span>
      </div>

      <p className="legend">
        filled — kept &nbsp;·&nbsp; struck — broken &nbsp;·&nbsp; dot — released &nbsp;·&nbsp;
        double-click a day to open it
      </p>

      <section className="panel">
        <h2>The week</h2>
        <p className="prompt">
          What happened this week, and what are you carrying into the next?
        </p>
        <textarea
          value={review}
          onChange={(e) => setReview(e.target.value)}
          placeholder="Room to say more than a grid can hold — why it went the way it went, what was going on around it, and what you want to do about it."
          style={{ minHeight: 260 }}
        />
      </section>
    </>
  );
}
