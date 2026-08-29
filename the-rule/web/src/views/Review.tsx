import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { track, useDebouncedSave } from '../save.js';
import {
  addDays, addMonths, longDate, mondayOf, monthLabel, monthOf, shortDate, toISO,
  weekdayIndex,
} from '../../../shared/dates.js';
import type { MonthView, WeekView } from '../../../shared/types.js';

export default function Review({ date }: { date: string }) {
  const [mode, setMode] = useState<'week' | 'month'>('week');
  return (
    <>
      <nav className="tabs" style={{ marginTop: -6 }}>
        <button onClick={() => setMode('week')} aria-current={mode === 'week' ? 'page' : undefined}>
          The week
        </button>
        <button onClick={() => setMode('month')} aria-current={mode === 'month' ? 'page' : undefined}>
          The month
        </button>
      </nav>
      {mode === 'week' ? <WeekReview date={date} /> : <MonthReview date={date} />}
    </>
  );
}

function WeekReview({ date }: { date: string }) {
  const [weekStart, setWeekStart] = useState(mondayOf(date));
  const [week, setWeek] = useState<WeekView | null>(null);
  const [next, setNext] = useState<WeekView | null>(null);
  const [review, setReview] = useState('');
  const [plan, setPlan] = useState({ priority1: '', priority2: '', priority3: '', onePercent: '' });
  const loadedFor = useRef('');

  const load = useCallback(async (ws: string) => {
    const [v, n] = await Promise.all([api.week(ws), api.week(addDays(ws, 7))]);
    setWeek(v);
    setNext(n);
    loadedFor.current = ws;
    setReview(v.plan.review);
    setPlan({
      priority1: n.plan.priority1, priority2: n.plan.priority2,
      priority3: n.plan.priority3, onePercent: n.plan.onePercent,
    });
  }, []);

  useEffect(() => { void load(weekStart); }, [weekStart, load]);

  useDebouncedSave(review, async (v) => {
    if (loadedFor.current !== weekStart) return;
    return api.saveWeek(weekStart, { review: v });
  });
  useDebouncedSave(plan, async (v) => {
    if (loadedFor.current !== weekStart) return;
    return api.saveWeek(addDays(weekStart, 7), v);
  });

  if (!week || !next) return null;

  const broken = week.rows.flatMap((r) =>
    r.cells.filter((c) => c.status === 'broken').map((c) => ({ name: r.name, ...c })));
  const answered = week.tally.kept + week.tally.broken;
  const pct = answered ? Math.round((week.tally.kept / answered) * 100) : null;
  const isSaturday = weekdayIndex(toISO(new Date())) === 5;
  const thisWeek = mondayOf(toISO(new Date())) === weekStart;

  return (
    <>
      <div className="datebar">
        <button className="navbtn" onClick={() => setWeekStart(addDays(weekStart, -7))}
          aria-label="Previous week">←</button>
        <span className="label">
          Week of <b>{shortDate(weekStart)}</b> – {shortDate(addDays(weekStart, 6))}
        </span>
        {!week.plan.reviewedAt && thisWeek && isSaturday && (
          <span className="badge work">review day</span>
        )}
        <button className="navbtn" onClick={() => setWeekStart(addDays(weekStart, 7))}
          aria-label="Next week">→</button>
      </div>

      <div className="stat-row">
        <div className="stat">
          <div className={`n${pct === null ? ' muted' : ''}`}>{pct === null ? '—' : `${pct}%`}</div>
          <div className="k">kept</div>
        </div>
        <div className="stat">
          <div className="n">{week.tally.kept}</div><div className="k">kept</div>
        </div>
        <div className="stat">
          <div className="n">{week.tally.broken}</div><div className="k">broken</div>
        </div>
        <div className="stat">
          <div className="n muted">{week.tally.unanswered}</div><div className="k">unanswered</div>
        </div>
      </div>

      <section className="panel">
        <h2>What broke, and why</h2>
        {broken.length === 0 ? (
          <p className="empty">
            {answered === 0
              ? 'Nothing recorded for this week yet.'
              : 'Nothing broken this week. Read that twice, then keep going.'}
          </p>
        ) : (
          <div className="reasons">
            {broken.map((b, i) => (
              <div className="reason-item" key={`${b.date}-${i}`}>
                <div className="reason-date">{shortDate(b.date)} · {b.name}</div>
                <div className="reason-text">
                  {b.reason || <span className="dimmed">— no reason recorded —</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Reflect on the week</h2>
        <p className="prompt">What did this week teach you that last week did not?</p>
        <textarea
          value={review}
          onChange={(e) => setReview(e.target.value)}
          placeholder="What worked, what broke, and what you are carrying forward."
          style={{ minHeight: 140 }}
        />
        <div className="row" style={{ marginTop: 14 }}>
          <button
            className="mini"
            onClick={() => track(api.saveWeek(weekStart, { markReviewed: !week.plan.reviewedAt }))
              .then(() => load(weekStart))}
          >
            {week.plan.reviewedAt ? 'reviewed ✓' : 'mark reviewed'}
          </button>
          <span className="spacer" />
          {week.plan.reviewedAt && (
            <span className="dimmed" style={{ fontSize: 10, letterSpacing: '.1em' }}>
              {new Date(week.plan.reviewedAt).toLocaleDateString()}
            </span>
          )}
        </div>
      </section>

      <section className="panel">
        <h2>Plan the next</h2>
        <p className="eyebrow" style={{ marginTop: 10 }}>
          Week of {shortDate(addDays(weekStart, 7))}
        </p>
        {(['priority1', 'priority2', 'priority3'] as const).map((k, i) => (
          <div className="field" key={k}>
            <input
              type="text" value={plan[k]}
              onChange={(e) => setPlan({ ...plan, [k]: e.target.value })}
              placeholder={`Priority ${i + 1}`}
            />
          </div>
        ))}
        <div className="field">
          <label htmlFor="np">Where I will be 1% better</label>
          <input
            id="np" type="text" value={plan.onePercent}
            onChange={(e) => setPlan({ ...plan, onePercent: e.target.value })}
            placeholder="One small thing, sharpened."
          />
        </div>
      </section>
    </>
  );
}

function MonthReview({ date }: { date: string }) {
  const [month, setMonth] = useState(monthOf(date));
  const [view, setView] = useState<MonthView | null>(null);
  const [goals, setGoals] = useState<{ text: string; done: boolean }[]>([]);
  const [workingOn, setWorkingOn] = useState('');
  const [review, setReview] = useState('');
  const loadedFor = useRef('');

  const load = useCallback(async (m: string) => {
    const v = await api.month(m);
    setView(v);
    loadedFor.current = m;
    setGoals(v.goals.length ? v.goals : [{ text: '', done: false }]);
    setWorkingOn(v.workingOn);
    setReview(v.review);
  }, []);

  useEffect(() => { void load(month); }, [month, load]);

  useDebouncedSave({ goals, workingOn, review }, async (v) => {
    if (loadedFor.current !== month) return;
    return api.saveMonth(month, {
      goals: v.goals.filter((g) => g.text.trim()),
      workingOn: v.workingOn,
      review: v.review,
    });
  });

  if (!view) return null;

  const setGoal = (i: number, patch: Partial<{ text: string; done: boolean }>) =>
    setGoals(goals.map((g, j) => (j === i ? { ...g, ...patch } : g)));

  return (
    <>
      <div className="datebar">
        <button className="navbtn" onClick={() => setMonth(addMonths(month, -1))}
          aria-label="Previous month">←</button>
        <span className="label"><b>{monthLabel(month)}</b></span>
        <button className="navbtn" onClick={() => setMonth(addMonths(month, 1))}
          aria-label="Next month">→</button>
      </div>

      <div className="stat-row">
        <div className="stat">
          <div className={`n${view.stats.percent === null ? ' muted' : ''}`}>
            {view.stats.percent === null ? '—' : `${view.stats.percent}%`}
          </div>
          <div className="k">kept</div>
        </div>
        <div className="stat">
          <div className="n">{view.stats.kept}</div><div className="k">kept</div>
        </div>
        <div className="stat">
          <div className="n">{view.stats.broken}</div><div className="k">broken</div>
        </div>
      </div>

      {view.weeks.some((w) => w.percent !== null) && (
        <div className="bars">
          {view.weeks.map((w) => (
            <div className="bar-row" key={w.weekStart}>
              <span className="bar-label">w/c {shortDate(w.weekStart)}</span>
              <span className="bar-track">
                <span className="bar-fill" style={{ width: `${w.percent ?? 0}%` }} />
              </span>
              <span className="bar-val">{w.percent === null ? '—' : `${w.percent}%`}</span>
            </div>
          ))}
        </div>
      )}

      <section className="panel">
        <h2>Goals for the month</h2>
        {goals.map((g, i) => (
          <div className="row" key={i} style={{ marginBottom: 8 }}>
            <button
              className={`flag${g.done ? ' on' : ''}`}
              style={{ width: 'auto', padding: 0 }}
              onClick={() => setGoal(i, { done: !g.done })}
              aria-label={g.done ? 'Done' : 'Not done'}
            >
              <span className="dot" />
            </button>
            <input
              type="text" value={g.text}
              onChange={(e) => setGoal(i, { text: e.target.value })}
              placeholder={`Goal ${i + 1}`}
              style={{ textDecoration: g.done ? 'line-through' : undefined }}
            />
          </div>
        ))}
        <button className="mini" onClick={() => setGoals([...goals, { text: '', done: false }])}>
          + add goal
        </button>
      </section>

      <section className="panel">
        <h2>What I am working on</h2>
        <textarea
          value={workingOn}
          onChange={(e) => setWorkingOn(e.target.value)}
          placeholder="The larger thing this month is in service of."
          style={{ minHeight: 100 }}
        />
      </section>

      <section className="panel">
        <h2>Month in review</h2>
        <textarea
          value={review}
          onChange={(e) => setReview(e.target.value)}
          placeholder="Written at the end, honestly."
          style={{ minHeight: 130 }}
        />
        <div className="row" style={{ marginTop: 14 }}>
          <button
            className="mini"
            onClick={() => track(api.saveMonth(month, { markReviewed: !view.reviewedAt }))
              .then(() => load(month))}
          >
            {view.reviewedAt ? 'reviewed ✓' : 'mark reviewed'}
          </button>
        </div>
      </section>
    </>
  );
}
