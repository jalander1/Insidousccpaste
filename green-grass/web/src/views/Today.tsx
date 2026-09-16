import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { track, useDebouncedSave } from '../save.js';
import { addDays, longDate, shortDate, toISO, trackingDate }
  from '../../../shared/dates.js';
import type { CellStatus, DayCell, DayView } from '../../../shared/types.js';

export default function Today({
  date, setDate,
}: { date: string; setDate: (d: string) => void }) {
  const [day, setDay] = useState<DayView | null>(null);

  const load = useCallback(async (d: string) => { setDay(await api.day(d)); }, []);
  useEffect(() => { void load(date); }, [date, load]);

  if (!day) return null;

  const today = toISO(new Date());
  const isTracking = date === trackingDate();
  const apply = (v: DayView | undefined) => { if (v) setDay(v); };
  const c = day.comparison;


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
        <OnePercentRow day={day} date={date} onChange={apply} />
      </div>

      {c.verdict && (
        <p className={`standing ${c.verdict}`}>
          {c.verdict === 'won' ? 'Up on yesterday'
            : c.verdict === 'held' ? 'Level with yesterday'
            : 'Down on yesterday'}
          {(c.gained.length > 0 || c.dropped.length > 0) &&
            ` · ${c.gained.length} up, ${c.dropped.length} down`}
          {day.run > 0 && ` · ${day.run} day${day.run === 1 ? '' : 's'} held or better`}
        </p>
      )}

      <Tomorrow date={date} initial={day.tomorrowOnePercent} />

      <details className="defs">
        <summary>The definitions</summary>
        {day.cells.map((c, i) => (
          <div className="def" key={c.lineageId}>
            <span className="n">{String(i + 1).padStart(2, '0')}</span>
            <div className="t">{c.name}</div>
            {c.definition && <div className="d">{c.definition}</div>}
          </div>
        ))}
      </details>
    </>
  );
}

/**
 * What yesterday did with this same row. Silent when yesterday has nothing to
 * say about it — a marker on every line is noise, not information.
 */
function Yesterday({ status }: { status: CellStatus | null }) {
  if (status === 'kept') return <span className="yday kept">yesterday · kept</span>;
  if (status === 'broken') return <span className="yday missed">yesterday · broken</span>;
  return null;
}

/** The 1%: written the night before, ticked that day, gone after it. */
function OnePercentRow({
  day, date, onChange,
}: { day: DayView; date: string; onChange: (v: DayView | undefined) => void }) {
  const { onePercent } = day;
  const [text, setText] = useState(onePercent.text);
  const unsaved = useRef(false);

  useEffect(() => { if (!unsaved.current) setText(onePercent.text); }, [onePercent.text]);

  useDebouncedSave(text, async (v) => {
    if (v === onePercent.text) return;
    const out = await api.onePercent(date, { text: v });
    unsaved.current = false;
    return out;
  });

  const set = async (status: 'hit' | 'missed') =>
    onChange(await track(api.onePercent(date,
      { status: onePercent.status === status ? 'unset' : status })));

  return (
    <div className="entry">
      <div className="entry-main">
        <div className="entry-body">
          <div className="entry-num">the 1%</div>
          {onePercent.text.trim() ? (
            <div className="entry-name">{onePercent.text}</div>
          ) : (
            <input
              type="text"
              value={text}
              onChange={(e) => { unsaved.current = true; setText(e.target.value); }}
              placeholder="Nothing set for today — write it in"
              style={{ marginTop: 4 }}
            />
          )}
        </div>

        {onePercent.text.trim() && (
          <div className="choice-stack">
            <div className="choice">
              <button className={onePercent.status === 'hit' ? 'on-kept' : ''}
                onClick={() => set('hit')}
                aria-pressed={onePercent.status === 'hit'}>kept</button>
              <button className={onePercent.status === 'missed' ? 'on-broken' : ''}
                onClick={() => set('missed')}
                aria-pressed={onePercent.status === 'missed'}>broken</button>
            </div>
            <Yesterday status={
              onePercent.yesterday === 'hit' ? 'kept'
                : onePercent.yesterday === 'missed' ? 'broken' : null} />
          </div>
        )}
      </div>
    </div>
  );
}

/** Written while winding down, for the day ahead. */
function Tomorrow({ date, initial }: { date: string; initial: string }) {
  const [text, setText] = useState(initial);
  const unsaved = useRef(false);
  const tomorrow = addDays(date, 1);

  useEffect(() => { if (!unsaved.current) setText(initial); }, [initial]);

  useDebouncedSave(text, async (v) => {
    if (v === initial) return;
    await api.onePercent(tomorrow, { text: v });
    unsaved.current = false;
  });

  return (
    <section className="tomorrow">
      <label htmlFor="tomorrow-pct">Tomorrow's 1%</label>
      <input
        id="tomorrow-pct"
        type="text"
        value={text}
        onChange={(e) => { unsaved.current = true; setText(e.target.value); }}
        placeholder="The one thing you will do better tomorrow"
      />
    </section>
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
  const unsaved = useRef(false);

  useEffect(() => { if (!unsaved.current) setReason(cell.reason); }, [cell.reason]);

  useDebouncedSave(reason, async (v) => {
    if (cell.status !== 'broken' || v === cell.reason) return;
    const out = await api.mark(date, cell.standardId, 'broken', v);
    unsaved.current = false;
    return out;
  });

  const set = async (status: 'kept' | 'broken') => {
    const next = cell.status === status ? 'unanswered' : status;
    if (next !== 'broken' && reason.trim() &&
        !confirm(`Clear the reason you wrote for "${cell.name}"?\n\n“${reason}”`)) return;
    setAskReason(next === 'broken');
    if (next !== 'broken') { unsaved.current = false; setReason(''); }
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
              {cell.exemptReason ? `Released — ${cell.exemptReason}` : 'Released today.'}
            </div>
          ) : (
            cell.definition && <div className="entry-def">{cell.definition}</div>
          )}
        </div>

        {!released && (
          <div className="choice-stack">
            <div className="choice">
              <button className={cell.status === 'kept' ? 'on-kept' : ''}
                onClick={() => set('kept')} aria-pressed={cell.status === 'kept'}>kept</button>
              <button className={cell.status === 'broken' ? 'on-broken' : ''}
                onClick={() => set('broken')} aria-pressed={cell.status === 'broken'}>broken</button>
            </div>
            <Yesterday status={cell.yesterday} />
          </div>
        )}
      </div>

      {!released && cell.steps.some((s) => s.applicable) && (
        <div className="steps">
          {cell.steps.filter((s) => s.applicable).map((s) => (
            <button
              key={s.id}
              className={`step${s.checked ? ' done' : ''}`}
              onClick={() => toggleStep(s.id, !s.checked)}
              aria-pressed={s.checked}
            >
              <span className="box" />
              <span>
                {s.name}
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
            onChange={(e) => { unsaved.current = true; setReason(e.target.value); }}
            placeholder="One sentence is enough."
          />
        </div>
      )}
    </div>
  );
}
