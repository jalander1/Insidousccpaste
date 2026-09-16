import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { track, useDebouncedSave } from '../save.js';
import { addDays, longDate, shortDate, toISO, trackingDate }
  from '../../../shared/dates.js';
import { ONE_PERCENT_POINTS, TIER_POINTS, TIERS, type Tier }
  from '../../../shared/score.js';
import type { DayCell, DayView } from '../../../shared/types.js';

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

      <Comparison day={day} />

      {day.unfilled.length > 0 && (
        <p className="nudge">
          Nothing recorded for{' '}
          {day.unfilled.map((d, i) => (
            <span key={d}>
              {i > 0 && (i === day.unfilled.length - 1 ? ' and ' : ', ')}
              <button className="linkish" onClick={() => setDate(d)}>{shortDate(d)}</button>
            </span>
          ))}
          . A blank day is a lost one — go back and fill them in.
        </p>
      )}

      <div className="ledger">
        {day.cells.map((cell, i) => (
          <Entry key={cell.lineageId} cell={cell} index={i + 1} date={date} onChange={apply} />
        ))}
      </div>

      <Objectives day={day} date={date} onChange={apply} />
      <OnePercent day={day} date={date} onChange={apply} />

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
 * The day against yesterday, line by line. Not a score — a reflection: what
 * you got today that you did not get yesterday, and what slipped the other way.
 */
function Comparison({ day }: { day: DayView }) {
  const { comparison: c, run } = day;

  if (!c.rival) {
    return (
      <p className="nudge" style={{ borderLeftColor: 'var(--rule)' }}>
        {day.score.competes
          ? 'No day behind this one yet — this is where it starts.'
          : 'Sunday. The day of rest does not race.'}
      </p>
    );
  }

  const word = c.verdict === 'won' ? 'Up on yesterday'
    : c.verdict === 'held' ? 'Level with yesterday'
    : c.verdict === 'lost' ? 'Down on yesterday'
    : 'Against yesterday';

  return (
    <section className="compare">
      <div className="compare-head">
        <span className={`compare-verdict ${c.verdict ?? 'open'}`}>{word}</span>
        <span className="compare-tally">
          <b>{c.gained.length}</b> up · <b>{c.dropped.length}</b> down
          {c.verdict === null && ' · still running'}
        </span>
        {run > 0 && <span className="run">held or better · {run} days</span>}
      </div>

      {c.gained.length === 0 && c.dropped.length === 0 ? (
        <p className="compare-none">Nothing has moved either way yet.</p>
      ) : (
        <div className="compare-lines">
          {c.gained.map((l) => (
            <div className="compare-line up" key={l.key}>
              <span className="arrow">↑</span>
              <span className="what">{l.name}</span>
              <span className="how">missed yesterday, got it today</span>
            </div>
          ))}
          {c.dropped.map((l) => (
            <div className="compare-line down" key={l.key}>
              <span className="arrow">↓</span>
              <span className="what">{l.name}</span>
              <span className="how">had it yesterday, not today</span>
            </div>
          ))}
        </div>
      )}

      {c.level > 0 && (
        <p className="compare-level">{c.level} the same as yesterday</p>
      )}
    </section>
  );
}

/** What he set out to do today, from his notepad. Hit or missed, nothing more. */
function Objectives({
  day, date, onChange,
}: { day: DayView; date: string; onChange: (v: DayView | undefined) => void }) {
  const [tomorrow, setTomorrow] = useState(false);

  return (
    <section className="panel">
      <h2>Objectives</h2>
      <p className="serif muted" style={{ fontSize: 15, marginTop: 2 }}>
        The tasks you set out for today.
      </p>

      {TIERS.map((tier) => (
        <ObjectiveRow
          key={tier}
          tier={tier}
          date={date}
          value={day.objectives.find((o) => o.tier === tier)!}
          onChange={onChange}
        />
      ))}

      <div style={{ marginTop: 18, borderTop: '1px solid var(--rule)', paddingTop: 14 }}>
        {tomorrow ? (
          <TomorrowObjectives date={addDays(date, 1)} onDone={() => setTomorrow(false)} />
        ) : (
          <button className="mini" onClick={() => setTomorrow(true)}>
            + set tomorrow's
          </button>
        )}
      </div>
    </section>
  );
}

/** Not one of the tasks: the one thing being done better than yesterday. */
function OnePercent({
  day, date, onChange,
}: { day: DayView; date: string; onChange: (v: DayView | undefined) => void }) {
  const [text, setText] = useState(day.onePercent.text);
  const unsaved = useRef(false);

  useEffect(() => {
    if (!unsaved.current) setText(day.onePercent.text);
  }, [day.onePercent.text]);

  useDebouncedSave(text, async (v) => {
    if (v === day.onePercent.text) return;
    const out = await api.onePercent(date, { text: v });
    unsaved.current = false;
    return out;
  });

  const set = async (status: 'hit' | 'missed') =>
    onChange(await track(api.onePercent(date,
      { status: day.onePercent.status === status ? 'unset' : status })));

  return (
    <section className="panel">
      <h2>1% better</h2>
      <p className="serif muted" style={{ fontSize: 15, marginTop: 2 }}>
        One thing, done better than yesterday.
      </p>
      <div className="objective" style={{ marginTop: 14 }}>
        <div className="obj-head">
          <span className="obj-tier">the 1%</span>
          <span className="obj-pts">{ONE_PERCENT_POINTS}</span>
        </div>
        <div className="obj-main">
          <input
            type="text"
            value={text}
            onChange={(e) => { unsaved.current = true; setText(e.target.value); }}
            placeholder="Where you are being 1% better today"
          />
          {text.trim() && (
            <div className="choice">
              <button className={day.onePercent.status === 'hit' ? 'on-kept' : ''}
                onClick={() => set('hit')}
                aria-pressed={day.onePercent.status === 'hit'}>hit</button>
              <button className={day.onePercent.status === 'missed' ? 'on-broken' : ''}
                onClick={() => set('missed')}
                aria-pressed={day.onePercent.status === 'missed'}>missed</button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function ObjectiveRow({
  tier, date, value, onChange,
}: {
  tier: Tier; date: string;
  value: { tier: string; text: string; status: string };
  onChange: (v: DayView | undefined) => void;
}) {
  const [text, setText] = useState(value.text);
  const unsaved = useRef(false);

  useEffect(() => { if (!unsaved.current) setText(value.text); }, [value.text]);

  useDebouncedSave(text, async (v) => {
    if (v === value.text) return;
    const out = await api.objective(date, tier, { text: v });
    unsaved.current = false;
    return out;
  });

  const set = async (status: 'hit' | 'missed') =>
    onChange(await track(api.objective(date, tier,
      { status: value.status === status ? 'unset' : status })));

  return (
    <div className="objective">
      <div className="obj-head">
        <span className="obj-tier">{tier}</span>
        <span className="obj-pts">{TIER_POINTS[tier]}</span>
      </div>
      <div className="obj-main">
        <input
          type="text"
          value={text}
          onChange={(e) => { unsaved.current = true; setText(e.target.value); }}
          placeholder={tier === 'primary' ? 'The one that matters most' : 'Optional'}
        />
        {text.trim() && (
          <div className="choice">
            <button className={value.status === 'hit' ? 'on-kept' : ''}
              onClick={() => set('hit')} aria-pressed={value.status === 'hit'}>hit</button>
            <button className={value.status === 'missed' ? 'on-broken' : ''}
              onClick={() => set('missed')} aria-pressed={value.status === 'missed'}>missed</button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Written during the evening routine, while he is already sitting there. */
function TomorrowObjectives({ date, onDone }: { date: string; onDone: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void api.objectives(date).then((rows) => {
      setValues(Object.fromEntries(rows.map((r) => [r.tier, r.text])));
      setLoaded(true);
    });
  }, [date]);

  useDebouncedSave(values, async (v) => {
    if (!loaded) return;
    for (const tier of TIERS) {
      if (v[tier] !== undefined) await api.objective(date, tier, { text: v[tier] });
    }
  });

  if (!loaded) return null;

  return (
    <div>
      <p className="lead">Tomorrow — {longDate(date)}</p>
      {TIERS.map((tier) => (
        <div className="objective" key={tier}>
          <div className="obj-head">
            <span className="obj-tier">{tier}</span>
            <span className="obj-pts">{TIER_POINTS[tier]}</span>
          </div>
          <input
            type="text"
            value={values[tier] ?? ''}
            onChange={(e) => setValues({ ...values, [tier]: e.target.value })}
            placeholder={tier === 'primary' ? 'The one that matters most' : 'Optional'}
          />
        </div>
      ))}
      <button className="mini" onClick={onDone} style={{ marginTop: 10 }}>done</button>
    </div>
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
          <div className="choice">
            <button className={cell.status === 'kept' ? 'on-kept' : ''}
              onClick={() => set('kept')} aria-pressed={cell.status === 'kept'}>kept</button>
            <button className={cell.status === 'broken' ? 'on-broken' : ''}
              onClick={() => set('broken')} aria-pressed={cell.status === 'broken'}>broken</button>
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
