import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { track } from '../save.js';
import { DOW_LETTER, longDate, toISO, trackingDate } from '../../../shared/dates.js';
import type { RoutineStep, StandardVersion } from '../../../shared/types.js';

type Draft = {
  name: string; definition: string; kind: string; weekdays: string;
  steps: { name: string; detail: string; weekdays: string | null }[];
};

export default function Manage() {
  const [standards, setStandards] = useState<StandardVersion[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => api.standards().then(setStandards), []);
  useEffect(() => { void load(); }, [load]);

  const move = async (i: number, dir: -1 | 1) => {
    const next = [...standards];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setStandards(next);
    await track(api.reorder(next.map((s) => s.lineageId)));
    void load();
  };

  return (
    <>
      <p className="eyebrow">The standards themselves</p>
      <p className="serif muted" style={{ fontSize: 15, marginTop: 0 }}>
        Editing never rewrites the past: a re-wording takes effect from today,
        so days you have already recorded keep the words that were true when
        you marked them. A standard you add now starts on the day you are
        currently filling in.
      </p>

      {standards.map((s, i) => (
        <div className="manage-item" key={s.lineageId}>
          {editing === s.lineageId ? (
            <Editor
              initial={{
                name: s.name, definition: s.definition, kind: s.kind,
                weekdays: s.weekdays,
                steps: s.steps.map((t) => ({ name: t.name, detail: t.detail, weekdays: t.weekdays })),
              }}
              onCancel={() => setEditing(null)}
              onSave={async (d) => {
                await track(api.updateStandard(s.lineageId, d));
                setEditing(null);
                void load();
              }}
            />
          ) : (
            <>
              <div className="manage-head">
                <span className="dimmed" style={{ fontSize: 10, paddingTop: 4 }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="name">{s.name}</span>
                <button className="mini" onClick={() => move(i, -1)} aria-label="Move up">↑</button>
                <button className="mini" onClick={() => move(i, 1)} aria-label="Move down">↓</button>
                <button className="mini" onClick={() => setEditing(s.lineageId)}>edit</button>
                <button
                  className="mini danger"
                  onClick={async () => {
                    if (!confirm(`Retire "${s.name}"? Past marks are kept; it stops being asked from today.`)) return;
                    await track(api.retire(s.lineageId));
                    void load();
                  }}
                >retire</button>
              </div>
              <div className="row wrap" style={{ marginTop: 8, gap: 14 }}>
                <span className="dimmed" style={{ fontSize: 10, letterSpacing: '.14em' }}>
                  {s.kind.toUpperCase()}
                </span>
                <WeekdayDots mask={s.weekdays} />
                {s.steps.length > 0 && (
                  <span className="dimmed" style={{ fontSize: 10 }}>
                    {s.steps.length} steps
                  </span>
                )}
                {s.effectiveFrom !== '2000-01-01' && (
                  <span className="dimmed" style={{ fontSize: 10 }}>
                    this wording since {s.effectiveFrom}
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      ))}

      <div className="manage-item">
        {adding ? (
          <Editor
            initial={{ name: '', definition: '', kind: 'binary', weekdays: 'MTWTFSS', steps: [] }}
            onCancel={() => setAdding(false)}
            onSave={async (d) => {
              await track(api.createStandard(d));
              setAdding(false);
              void load();
            }}
          />
        ) : (
          <button className="mini" onClick={() => setAdding(true)}>+ add a standard</button>
        )}
      </div>

      <Exemptions standards={standards} />
      <DataPanel />
    </>
  );
}

function WeekdayDots({ mask }: { mask: string }) {
  return (
    <span className="row" style={{ gap: 3 }}>
      {DOW_LETTER.map((d, i) => (
        <span
          key={i}
          style={{
            fontSize: 10,
            color: mask[i] !== '-' ? 'var(--brass)' : 'var(--dimmer)',
            opacity: mask[i] !== '-' ? 1 : 0.5,
          }}
        >{d}</span>
      ))}
    </span>
  );
}

function Editor({
  initial, onSave, onCancel,
}: { initial: Draft; onSave: (d: Draft) => void; onCancel: () => void }) {
  const [d, setD] = useState<Draft>(initial);

  const toggleDay = (i: number) => {
    const chars = [...d.weekdays.padEnd(7, '-')];
    chars[i] = chars[i] === '-' ? DOW_LETTER[i] : '-';
    setD({ ...d, weekdays: chars.join('') });
  };

  const setStep = (i: number, patch: Partial<Draft['steps'][number]>) =>
    setD({ ...d, steps: d.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

  return (
    <div>
      <div className="field">
        <label>Name</label>
        <input type="text" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
      </div>
      <div className="field">
        <label>What counts</label>
        <textarea
          value={d.definition}
          onChange={(e) => setD({ ...d, definition: e.target.value })}
          style={{ minHeight: 80 }}
          placeholder="Write the standard so tomorrow-you cannot argue with it."
        />
      </div>
      <div className="field">
        <label>Kind</label>
        <div className="row">
          {(['binary', 'abstain', 'checklist'] as const).map((k) => (
            <button
              key={k}
              className="mini"
              style={d.kind === k ? { borderColor: 'var(--brass)', color: 'var(--bone)' } : undefined}
              onClick={() => setD({ ...d, kind: k })}
            >{k}</button>
          ))}
        </div>
      </div>
      <div className="field">
        <label>Days it applies</label>
        <div className="weekdays">
          {DOW_LETTER.map((letter, i) => (
            <button
              key={i}
              className={d.weekdays[i] !== '-' ? 'on' : ''}
              onClick={() => toggleDay(i)}
              aria-label={`Toggle ${letter}`}
            >{letter}</button>
          ))}
        </div>
      </div>

      {d.kind === 'checklist' && (
        <div className="field">
          <label>Steps</label>
          {d.steps.map((s, i) => (
            <div key={i} style={{ marginBottom: 12, borderLeft: '1px solid var(--rule)', paddingLeft: 12 }}>
              <input
                type="text" value={s.name}
                onChange={(e) => setStep(i, { name: e.target.value })}
                placeholder="Step"
              />
              <input
                type="text" value={s.detail}
                onChange={(e) => setStep(i, { detail: e.target.value })}
                placeholder="Detail — e.g. name the exact exercises"
                style={{ marginTop: 5, fontSize: 13 }}
              />
              <div className="row" style={{ marginTop: 6 }}>
                <span className="dimmed" style={{ fontSize: 10, letterSpacing: '.12em' }}>
                  days
                </span>
                <div className="weekdays">
                  {DOW_LETTER.map((letter, j) => {
                    const mask = s.weekdays ?? 'MTWTFSS';
                    return (
                      <button
                        key={j}
                        className={mask[j] !== '-' ? 'on' : ''}
                        onClick={() => {
                          const chars = [...mask.padEnd(7, '-')];
                          chars[j] = chars[j] === '-' ? DOW_LETTER[j] : '-';
                          const next = chars.join('');
                          setStep(i, { weekdays: next === 'MTWTFSS' ? null : next });
                        }}
                      >{letter}</button>
                    );
                  })}
                </div>
                <span className="spacer" />
                <button
                  className="mini danger"
                  onClick={() => setD({ ...d, steps: d.steps.filter((_, j) => j !== i) })}
                >remove</button>
              </div>
            </div>
          ))}
          <button
            className="mini"
            onClick={() => setD({ ...d, steps: [...d.steps, { name: '', detail: '', weekdays: null }] })}
          >+ add step</button>
        </div>
      )}

      <div className="row" style={{ marginTop: 14 }}>
        <button
          className="mini"
          style={{ borderColor: 'var(--brass)', color: 'var(--bone)' }}
          onClick={() => onSave({ ...d, steps: d.steps.filter((s) => s.name.trim()) })}
        >save</button>
        <button className="mini" onClick={onCancel}>cancel</button>
      </div>
    </div>
  );
}

/** Exceptions to the rule — a requirement, not an edge case. */
function Exemptions({ standards }: { standards: StandardVersion[] }) {
  const [list, setList] = useState<{ date: string; lineageId: number; reason: string }[]>([]);
  const [date, setDate] = useState(trackingDate());
  const [lineageId, setLineageId] = useState<number | ''>('');
  const [reason, setReason] = useState('');

  const load = useCallback(() => api.exemptions().then(setList), []);
  useEffect(() => { void load(); }, [load]);

  const nameOf = (id: number) =>
    standards.find((s) => s.lineageId === id)?.name ?? `Standard ${id}`;

  return (
    <section className="panel">
      <h2>Exceptions</h2>
      <p className="serif muted" style={{ fontSize: 15 }}>
        Release a single standard on a single day — illness, travel, a shift
        that made it impossible. A released day is not a broken day: it is left
        out of the counting entirely.
      </p>

      <div className="row wrap" style={{ marginTop: 14, gap: 8 }}>
        <input
          type="date" value={date} onChange={(e) => setDate(e.target.value)}
          style={{
            width: 'auto', fontFamily: 'var(--mono)', fontSize: 12,
            background: 'var(--ink)', color: 'var(--bone)',
            border: '1px solid var(--rule)', borderRadius: 2, padding: '8px 10px',
          }}
        />
        <select
          value={lineageId}
          onChange={(e) => setLineageId(e.target.value ? Number(e.target.value) : '')}
          style={{
            fontFamily: 'var(--mono)', fontSize: 12, background: 'var(--ink)',
            color: 'var(--bone)', border: '1px solid var(--rule)',
            borderRadius: 2, padding: '8px 10px',
          }}
        >
          <option value="">Which standard…</option>
          {standards.map((s) => (
            <option key={s.lineageId} value={s.lineageId}>{s.name}</option>
          ))}
        </select>
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <input
          type="text" value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder="Why (optional)"
        />
        <button
          className="mini"
          disabled={lineageId === ''}
          onClick={async () => {
            if (lineageId === '') return;
            await track(api.exempt(date, lineageId, reason));
            setReason(''); setLineageId('');
            void load();
          }}
        >release</button>
      </div>

      {list.length > 0 && (
        <div style={{ marginTop: 18 }}>
          {list.map((e) => (
            <div className="row" key={`${e.date}-${e.lineageId}`} style={{ marginBottom: 7 }}>
              <span className="dimmed" style={{ fontSize: 10, width: 92 }}>{e.date}</span>
              <span className="serif" style={{ flex: 1, fontSize: 14 }}>
                {nameOf(e.lineageId)}
                {e.reason && <span className="dimmed"> — {e.reason}</span>}
              </span>
              <button
                className="mini danger"
                onClick={async () => {
                  await track(api.unexempt(e.date, e.lineageId));
                  void load();
                }}
              >undo</button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function DataPanel() {
  const [loc, setLoc] = useState<{ dbPath: string; backups: string; canReveal: boolean } | null>(null);
  useEffect(() => { void api.dataLocation().then(setLoc); }, []);

  return (
    <section className="panel">
      <h2>Your data</h2>
      <p className="serif muted" style={{ fontSize: 15 }}>
        Everything lives in one file on this machine. Nothing is sent anywhere.
        A dated copy is made every time the app opens, and the last thirty are
        kept.
      </p>
      {loc && (
        <p className="dimmed" style={{ fontSize: 11, wordBreak: 'break-all', marginTop: 12 }}>
          {loc.dbPath}
        </p>
      )}
      <div className="row wrap" style={{ marginTop: 14, gap: 8 }}>
        <a className="mini" href="/api/export.json" download
          style={{ textDecoration: 'none', display: 'inline-block' }}>export json</a>
        <a className="mini" href="/api/export.csv" download
          style={{ textDecoration: 'none', display: 'inline-block' }}>export csv</a>
        {loc?.canReveal && (
          <button className="mini" onClick={() => api.reveal()}>show in finder</button>
        )}
      </div>
    </section>
  );
}
