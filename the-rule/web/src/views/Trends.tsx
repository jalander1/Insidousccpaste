import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { addDays, longDate, shortDate, toISO } from '../../../shared/dates.js';
import type { TrendStandard, TrendsView } from '../../../shared/types.js';

const RANGES = [
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: '6 months', days: 182 },
  { label: 'A year', days: 365 },
] as const;

export default function Trends() {
  const [days, setDays] = useState(90);
  const [view, setView] = useState<TrendsView | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    const to = toISO(new Date());
    void api.trends(addDays(to, -(days - 1)), to).then(setView);
  }, [days]);

  if (!view) return null;

  // The wake-up is the standard everything else hangs off, so it leads.
  const hero = view.standards[0];
  const rest = view.standards.slice(1);
  const nothingYet = view.standards.every((s) => s.kept + s.broken === 0);

  return (
    <>
      <div className="datebar">
        <span className="label">
          <b>{shortDate(view.from)}</b> – {shortDate(view.to)}
        </span>
        <div className="row">
          {RANGES.map((r) => (
            <button
              key={r.days}
              className="navbtn"
              onClick={() => setDays(r.days)}
              style={days === r.days ? { borderColor: 'var(--brass-lo)', color: 'var(--bone)' } : undefined}
            >{r.label}</button>
          ))}
        </div>
      </div>

      {nothingYet ? (
        <p className="empty">
          Nothing recorded in this window yet. Mark a few days and the shape of
          the months will start to show here.
        </p>
      ) : (
        <>
          {hero && <Hero s={hero} />}
          {rest.map((s) => (
            <Card
              key={s.lineageId}
              s={s}
              open={open === s.lineageId}
              onToggle={() => setOpen(open === s.lineageId ? null : s.lineageId)}
            />
          ))}

          {view.flags.some((f) => f.count > 0) && (
            <section className="panel">
              <p className="lead">Noticed, not scored</p>
              {view.flags.map((f) => (
                <div className="bar-row" key={f.id}>
                  <span className="serif" style={{ flex: 1, fontSize: 15 }}>{f.label}</span>
                  <span className="bar-val">{f.count}</span>
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </>
  );
}

function Hero({ s }: { s: TrendStandard }) {
  return (
    <div className="hero">
      <p className="eyebrow">The one everything else hangs off</p>
      <h2 style={{ fontFamily: 'var(--display)', fontWeight: 300, fontSize: 26, margin: '0 0 4px' }}>
        {s.name}
      </h2>
      <div className="stat-row">
        <div className="stat">
          <div className="n">{s.streak.current}</div>
          <div className="k">day streak</div>
        </div>
        <div className="stat">
          <div className="n" style={{ color: 'var(--bone)' }}>{s.streak.best}</div>
          <div className="k">best run</div>
        </div>
        <div className="stat">
          <div className="n" style={{ color: 'var(--bone)' }}>
            {s.percent === null ? '—' : `${s.percent}%`}
          </div>
          <div className="k">kept</div>
        </div>
        <div className="stat">
          <div className="n muted">{s.broken}</div>
          <div className="k">broken</div>
        </div>
      </div>
      <Heatmap s={s} />
      <ByDayType s={s} />
      {s.reasons.length > 0 && <Reasons s={s} limit={4} />}
    </div>
  );
}

function Card({ s, open, onToggle }: { s: TrendStandard; open: boolean; onToggle: () => void }) {
  return (
    <div className="trend-card">
      <div className="trend-head">
        <span className="name">{s.name}</span>
        <span className="pct">
          {s.percent === null ? '—' : `${s.percent}%`} · streak {s.streak.current}
        </span>
        <button className="mini" onClick={onToggle}>{open ? 'less' : 'more'}</button>
      </div>
      <Heatmap s={s} />
      {open && (
        <>
          <div className="stat-row">
            <div className="stat"><div className="n">{s.kept}</div><div className="k">kept</div></div>
            <div className="stat"><div className="n">{s.broken}</div><div className="k">broken</div></div>
            <div className="stat"><div className="n muted">{s.unanswered}</div><div className="k">unanswered</div></div>
            <div className="stat"><div className="n">{s.streak.best}</div><div className="k">best run</div></div>
          </div>
          <ByDayType s={s} />
          {s.byWeek.length > 1 && (
            <div className="bars">
              {s.byWeek.slice(-12).map((w) => (
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
          {s.steps.length > 0 && <Steps s={s} />}
          {s.reasons.length > 0 && <Reasons s={s} />}
        </>
      )}
    </div>
  );
}

function Heatmap({ s }: { s: TrendStandard }) {
  return (
    <div className="heatmap">
      {s.heatmap.map((h) => (
        <span
          key={h.date}
          className={`heatcell ${h.status}`}
          title={`${longDate(h.date)} — ${h.status}`}
        />
      ))}
    </div>
  );
}

function ByDayType({ s }: { s: TrendStandard }) {
  const rows = s.byDayType.filter((d) => d.percent !== null);
  if (rows.length < 2) return null;
  return (
    <div className="bars">
      {rows.map((d) => (
        <div className="bar-row" key={d.dayType}>
          <span className="bar-label">{d.dayType} days</span>
          <span className="bar-track">
            <span className="bar-fill" style={{ width: `${d.percent ?? 0}%` }} />
          </span>
          <span className="bar-val">{d.percent}%</span>
        </div>
      ))}
    </div>
  );
}

/** Which step breaks the routine — the useful question about a checklist. */
function Steps({ s }: { s: TrendStandard }) {
  const rows = [...s.steps].sort((a, b) => b.missed - a.missed);
  return (
    <>
      <p className="lead" style={{ marginTop: 18 }}>Where the routine slips</p>
      <div className="bars">
        {rows.map((st) => {
          const pct = st.total ? Math.round((st.missed / st.total) * 100) : 0;
          return (
            <div className="bar-row" key={st.name}>
              <span className="bar-label" style={{ width: 130 }}>{st.name}</span>
              <span className="bar-track">
                <span className="bar-fill" style={{ width: `${pct}%`, background: 'var(--broken)' }} />
              </span>
              <span className="bar-val">{st.missed}/{st.total}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}

function Reasons({ s, limit }: { s: TrendStandard; limit?: number }) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll || !limit ? s.reasons : s.reasons.slice(0, limit);
  return (
    <>
      <p className="lead" style={{ marginTop: 18 }}>Why it broke</p>
      <div className="reasons">
        {shown.map((r, i) => (
          <div className="reason-item" key={`${r.date}-${i}`}>
            <div className="reason-date">{shortDate(r.date)}</div>
            <div className="reason-text">{r.reason}</div>
          </div>
        ))}
      </div>
      {limit && s.reasons.length > limit && !showAll && (
        <button className="mini" onClick={() => setShowAll(true)}>
          all {s.reasons.length}
        </button>
      )}
    </>
  );
}
