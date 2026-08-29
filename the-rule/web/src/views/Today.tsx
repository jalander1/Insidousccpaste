import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { track, useDebouncedSave } from '../save.js';
import { addDays, longDate, toISO, trackingDate } from '../../../shared/dates.js';
import type { DayCell, DayView } from '../../../shared/types.js';

export default function Today({
  date, setDate,
}: { date: string; setDate: (d: string) => void }) {
  const [day, setDay] = useState<DayView | null>(null);
  const [note, setNote] = useState('');
  const noteFor = useRef<string>('');

  const load = useCallback(async (d: string) => {
    const v = await api.day(d);
    setDay(v);
    noteFor.current = d;
    setNote(v.note);
  }, []);

  useEffect(() => { void load(date); }, [date, load]);

  // Only save the note back to the day it was typed on.
  useDebouncedSave(note, async (v) => {
    if (noteFor.current !== date) return;
    return api.saveDay(date, { note: v });
  });

  if (!day) return null;

  const today = toISO(new Date());
  const isTracking = date === trackingDate();

  const apply = (v: DayView | undefined) => { if (v) setDay(v); };

  return (
    <>
      <div className="datebar">
        <button className="navbtn" onClick={() => setDate(addDays(date, -1))}
          aria-label="Previous day">←</button>
        <span className="label">
          {date === today ? <b>Today</b> : date === addDays(today, -1) ? <b>Yesterday</b> : null}
          {date === today || date === addDays(today, -1) ? ' · ' : ''}
          {longDate(date)}
        </span>
        {day.dayType !== 'normal' && (
          <span className={`badge ${day.dayType}`}>{day.dayType}</span>
        )}
        <button className="navbtn" onClick={() => setDate(addDays(date, 1))}
          disabled={date >= today} aria-label="Next day">→</button>
        {!isTracking && (
          <button className="navbtn" onClick={() => setDate(trackingDate())}>today</button>
        )}
      </div>

      <div className="ledger">
        {day.cells.map((cell, i) => (
          <Entry key={cell.lineageId} cell={cell} index={i + 1} date={date} onChange={apply} />
        ))}
      </div>

      <section className="panel">
        <p className="eyebrow">{longDate(date)}</p>
        <h2>Looking back</h2>
        <p className="prompt">{day.prompt}</p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Write it plainly. Nobody else reads this."
          style={{ minHeight: 130 }}
        />

        <div className="noticed">
          <p className="lead">Noticed, not scored</p>
          {day.flags.map((f) => (
            <button
              key={f.id}
              className={`flag${f.on ? ' on' : ''}`}
              onClick={() => track(api.flag(date, f.id, !f.on)).then(apply)}
            >
              <span className="dot" />{f.label}
            </button>
          ))}
        </div>
      </section>

      <details className="defs">
        <summary>The definitions</summary>
        {day.cells.map((c, i) => (
          <div className="def" key={c.lineageId}>
            <span className="n">{String(i + 1).padStart(2, '0')}</span>
            <div className="t">{c.name}</div>
            <div className="d">{c.definition}</div>
          </div>
        ))}
      </details>

      <p className="legend">
        A day left unanswered stays unanswered — this is a record, not a scold.
      </p>
    </>
  );
}

function Entry({
  cell, index, date, onChange,
}: {
  cell: DayCell; index: number; date: string;
  onChange: (v: DayView | undefined) => void;
}) {
  const [reason, setReason] = useState(cell.reason);
  const [askReason, setAskReason] = useState(false);
  const released = cell.status === 'released';

  useEffect(() => { setReason(cell.reason); }, [cell.reason]);

  // The "why" is the point of tracking at all — capture it while it is fresh.
  useDebouncedSave(reason, async (v) => {
    if (cell.status !== 'broken' || v === cell.reason) return;
    return api.mark(date, cell.standardId, 'broken', v);
  });

  const set = async (status: 'kept' | 'broken') => {
    const next = cell.status === status ? 'unanswered' : status;
    setAskReason(next === 'broken');
    onChange(await track(api.mark(date, cell.standardId, next, next === 'broken' ? reason : '')));
  };

  const toggleStep = async (stepId: number, checked: boolean) =>
    onChange(await track(api.step(date, stepId, checked)));

  return (
    <div className={`entry${released ? ' is-released' : ''}`}>
      <div className="entry-main">
        <div className="entry-body">
          <div className="entry-num">{String(index).padStart(2, '0')}</div>
          <div className="entry-name">{cell.name}</div>
          {released ? (
            <div className="entry-released-note">
              {cell.exemptReason
                ? `Released — ${cell.exemptReason}`
                : 'Released today. Not asked, not counted.'}
            </div>
          ) : (
            cell.definition && <div className="entry-def">{cell.definition}</div>
          )}
        </div>

        {!released && (
          <div className="choice">
            <button
              className={cell.status === 'kept' ? 'on-kept' : ''}
              onClick={() => set('kept')}
              aria-pressed={cell.status === 'kept'}
            >kept</button>
            <button
              className={cell.status === 'broken' ? 'on-broken' : ''}
              onClick={() => set('broken')}
              aria-pressed={cell.status === 'broken'}
            >broken</button>
          </div>
        )}
      </div>

      {!released && cell.steps.length > 0 && (
        <div className="steps">
          {cell.steps.map((s) => (
            <button
              key={s.id}
              className={`step${s.checked ? ' done' : ''}${s.applicable ? '' : ' na'}`}
              disabled={!s.applicable}
              onClick={() => toggleStep(s.id, !s.checked)}
            >
              <span className="box" />
              <span>
                {s.name}
                {!s.applicable && ' — not tonight'}
                {s.detail && <span className="step-detail"><br />{s.detail}</span>}
              </span>
            </button>
          ))}
        </div>
      )}

      {!released && cell.status === 'broken' && (
        <div className="reasonbox">
          <label htmlFor={`why-${cell.lineageId}`}>Why was it broken?</label>
          <input
            id={`why-${cell.lineageId}`}
            type="text"
            value={reason}
            autoFocus={askReason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="One sentence is enough."
          />
        </div>
      )}
    </div>
  );
}
