import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { track } from '../save.js';
import { Failed, useLoader } from '../load.js';
import { useSortable } from '../sortable.js';
import { DOW_LETTER, longDate, toISO, trackingDate } from '../../../shared/dates.js';
import type { Block, RoutineStep, StandardVersion } from '../../../shared/types.js';

type Draft = {
  name: string; definition: string; kind: string; weekdays: string;
  steps: { name: string; detail: string; weekdays: string | null; optional: boolean }[];
};

export default function Manage() {
  const [standards, setStandards] = useState<StandardVersion[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => api.standards().then(setStandards), []);
  const { error, retry } = useLoader(load, []);

  if (error) return <Failed error={error} retry={retry} />;

  const save = async (next: StandardVersion[]) => {
    await track(api.reorder(next.map((s) => s.lineageId)));
    void load();
  };
  const sort = useSortable({
    items: standards,
    setItems: setStandards,
    onDrop: (next) => void save(next),
  });

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
        // Keyed by the version row, not the lineage: two live rows on one
        // lineage used to collide here and take the list apart.
        <div
          className={`manage-item${sort.dragging === i ? ' is-dragging' : ''}`}
          key={s.id}
          {...sort.row(i)}
        >
          {editing === s.lineageId ? (
            <Editor
              initial={{
                name: s.name, definition: s.definition, kind: s.kind,
                weekdays: s.weekdays,
                steps: s.steps.map((t) => ({
                  name: t.name, detail: t.detail, weekdays: t.weekdays, optional: t.optional,
                })),
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
                <button {...sort.grip(i)}>⠿</button>
                <span className="dimmed" style={{ fontSize: 10, paddingTop: 4 }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="name">{s.name}</span>
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

      <Away standards={standards} onPinned={setStandards} />
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

  // The order the steps are dragged into is the order they are asked in: it is
  // written straight back as step_order when the standard is saved.
  const sort = useSortable({
    items: d.steps,
    setItems: (steps) => setD({ ...d, steps }),
  });

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
            <div
              key={i}
              className={`step-edit${sort.dragging === i ? ' is-dragging' : ''}`}
              {...sort.row(i)}
            >
              <div className="row" style={{ gap: 8 }}>
                <button {...sort.grip(i)}>⠿</button>
                <input
                  type="text" value={s.name}
                  onChange={(e) => setStep(i, { name: e.target.value })}
                  placeholder="Step"
                />
              </div>
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
                <button
                  className={`mini${s.optional ? ' on' : ''}`}
                  onClick={() => setStep(i, { optional: !s.optional })}
                  aria-pressed={s.optional}
                  title="An optional step is shown and can be ticked, but never holds the routine open"
                >optional</button>
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
            onClick={() => setD({ ...d, steps: [...d.steps, { name: '', detail: '', weekdays: null, optional: false }] })}
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

const dateBox = {
  width: 'auto', fontFamily: 'var(--mono)', fontSize: 12,
  background: 'var(--ink)', color: 'var(--bone)',
  border: '1px solid var(--rule)', borderRadius: 2, padding: '8px 10px',
} as const;

/**
 * Time away. A block is a stretch of days put out of reach — a holiday, a
 * week ill, a single morning after a 4am landing. Leave the standard blank
 * and it covers the whole sheet bar what is pinned.
 */
function Away({ standards, onPinned }: {
  standards: StandardVersion[];
  onPinned: (next: StandardVersion[]) => void;
}) {
  const [list, setList] = useState<Block[]>([]);
  const [startDate, setStartDate] = useState(trackingDate());
  const [endDate, setEndDate] = useState(trackingDate());
  const [lineageId, setLineageId] = useState<number | ''>('');
  const [reason, setReason] = useState('');

  const load = useCallback(() => api.blocks().then(setList), []);
  useEffect(() => { void load(); }, [load]);

  const nameOf = (id: number) =>
    standards.find((s) => s.lineageId === id)?.name ?? `Standard ${id}`;
  const pinned = standards.filter((s) => s.pinned);

  return (
    <section className="panel">
      <h2>Time away</h2>
      <p className="serif muted" style={{ fontSize: 15 }}>
        Block out a stretch of days — a holiday, a week ill, one morning after a
        late landing. Nothing is asked of you on those days and nothing can be
        ticked, but <b>a block ends a run</b>: you did not keep the standard,
        and the record says so. Only the schedule releases a day for free.
      </p>

      <div className="row wrap" style={{ marginTop: 14, gap: 8 }}>
        <input type="date" value={startDate} style={dateBox}
          onChange={(e) => {
            setStartDate(e.target.value);
            if (e.target.value > endDate) setEndDate(e.target.value);
          }} />
        <span className="dimmed" style={{ fontSize: 11 }}>to</span>
        <input type="date" value={endDate} min={startDate} style={dateBox}
          onChange={(e) => setEndDate(e.target.value)} />
        <select
          value={lineageId} style={{ ...dateBox, width: 'auto' }}
          onChange={(e) => setLineageId(e.target.value ? Number(e.target.value) : '')}
        >
          <option value="">Every standard</option>
          {standards.map((st) => (
            <option key={st.id} value={st.lineageId}>Only — {st.name}</option>
          ))}
        </select>
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <input
          type="text" value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder="Why — e.g. Italy, a week"
        />
        <button
          className="mini"
          onClick={async () => {
            await track(api.block({
              startDate, endDate, lineageId: lineageId === '' ? null : lineageId, reason,
            }));
            setReason(''); setLineageId('');
            void load();
          }}
        >block out</button>
      </div>

      {lineageId === '' && pinned.length > 0 && (
        <p className="dimmed" style={{ fontSize: 11, marginTop: 10 }}>
          Still asked on those days: {pinned.map((st) => st.name).join(', ')}
        </p>
      )}

      {list.length > 0 && (
        <div style={{ marginTop: 18 }}>
          {list.map((b) => (
            <div className="row" key={b.id} style={{ marginBottom: 7 }}>
              <span className="dimmed" style={{ fontSize: 10, width: 150 }}>
                {b.startDate}{b.endDate !== b.startDate && ` → ${b.endDate}`}
              </span>
              <span className="serif" style={{ flex: 1, fontSize: 14 }}>
                {b.lineageId === null ? 'Every standard' : nameOf(b.lineageId)}
                {b.reason && <span className="dimmed"> — {b.reason}</span>}
              </span>
              <button
                className="mini danger"
                onClick={async () => { await track(api.unblock(b.id)); void load(); }}
              >undo</button>
            </div>
          ))}
        </div>
      )}

      <h2 style={{ marginTop: 26 }}>Does not take holidays</h2>
      <p className="serif muted" style={{ fontSize: 15 }}>
        A pinned standard ignores a block: it keeps being asked, it can still be
        ticked, and its run keeps running. Everything else greys out.
      </p>
      <div className="row wrap" style={{ marginTop: 12, gap: 8 }}>
        {standards.map((st) => (
          <button
            key={st.id}
            className={`mini${st.pinned ? ' on' : ''}`}
            aria-pressed={st.pinned}
            onClick={async () => {
              const next = await track(api.pin(st.lineageId, !st.pinned));
              if (next) onPinned(next);
            }}
          >{st.name}</button>
        ))}
      </div>
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
