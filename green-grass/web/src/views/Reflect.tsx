import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { addDays, longDate, toISO, trackingDate } from '../../../shared/dates.js';

interface Msg { role: 'user' | 'assistant'; content: string }

export default function Reflect({
  date, setDate,
}: { date: string; setDate: (d: string) => void }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState<{ configured: boolean; hint: string | null } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (d: string) => {
    const v = await api.chat(d);
    setMessages(v.messages);
    setKey(v.key);
  }, []);

  useEffect(() => { void load(date); }, [date, load]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); },
    [messages.length, pending]);

  const send = async () => {
    const text = draft.trim();
    if (!text || pending !== null) return;
    setDraft('');
    setError(null);
    setMessages((m) => [...m, { role: 'user', content: text }]);
    setPending('');
    let acc = '';
    const { error: err } = await api.send(date, text, (t) => {
      acc += t;
      setPending(acc);
    });
    setPending(null);
    // A failed send keeps what he wrote, in the box, ready to try again.
    if (err) { setError(err); setDraft(text); }
    void load(date);
  };

  const today = toISO(new Date());

  if (key && !key.configured) return <NoKey onSaved={() => load(date)} />;

  return (
    <>
      <div className="datebar">
        <button className="navbtn" onClick={() => setDate(addDays(date, -1))}
          aria-label="Previous day">←</button>
        <span className="label">{longDate(date)}</span>
        <button className="navbtn" onClick={() => setDate(addDays(date, 1))}
          disabled={date >= today} aria-label="Next day">→</button>
        {date !== trackingDate() && (
          <button className="navbtn" onClick={() => setDate(trackingDate())}>today</button>
        )}
      </div>

      {messages.length === 0 && pending === null && (
        <p className="empty">
          It has read your record — what you kept, what broke, and every reason
          you wrote down. Say what happened.
        </p>
      )}

      <div className="chat">
        {messages.map((m, i) => (
          <div className={`msg ${m.role}`} key={i}>
            {m.content.split('\n\n').map((p, j) => <p key={j}>{p}</p>)}
          </div>
        ))}
        {pending !== null && (
          <div className="msg assistant">
            {pending === ''
              ? <p className="dimmed">thinking…</p>
              : pending.split('\n\n').map((p, j) => <p key={j}>{p}</p>)}
          </div>
        )}
        {error && <p className="chat-error">{error}</p>}
        <div ref={endRef} />
      </div>

      <div className="composer">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send(); }
          }}
          placeholder="I fell off this week…"
          style={{ minHeight: 84 }}
          disabled={pending !== null}
        />
        <div className="row" style={{ marginTop: 10 }}>
          <button
            className="mini"
            style={{ borderColor: 'var(--brass)', color: 'var(--bone)' }}
            onClick={() => void send()}
            disabled={pending !== null || !draft.trim()}
          >send</button>
          <span className="dimmed" style={{ fontSize: 10, letterSpacing: '.1em' }}>⌘↵</span>
          <span className="spacer" />
          {messages.length > 0 && (
            <button
              className="mini danger"
              onClick={async () => {
                if (!confirm('Delete this conversation? The marks and notes stay.')) return;
                await api.clearChat(date);
                void load(date);
              }}
            >clear</button>
          )}
        </div>
      </div>
    </>
  );
}

function NoKey({ onSaved }: { onSaved: () => void }) {
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  return (
    <section className="panel" style={{ marginTop: 0 }}>
      <h2>Reflecting out loud</h2>
      <p className="serif muted" style={{ fontSize: 15 }}>
        This is the one part of Green Grass that talks to something outside your
        machine. To use it, paste an Anthropic API key below. When you send a
        message, your standards, your marks for the last thirty days, the
        reasons you wrote when something broke, and your recent notes are sent
        to Anthropic along with it, so the reply is about your actual week
        rather than habits in general. Nothing is sent until you press send, and
        the rest of the app never leaves this machine.
      </p>
      <p className="serif muted" style={{ fontSize: 15 }}>
        Get a key at <span className="dimmed">console.anthropic.com</span> under
        API keys. It is billed to you by usage — a conversation here costs a
        penny or two.
      </p>
      <div className="row" style={{ marginTop: 14 }}>
        <input
          type="password" value={value} onChange={(e) => setValue(e.target.value)}
          placeholder="sk-ant-…"
        />
        <button
          className="mini"
          disabled={!value.trim() || saving}
          onClick={async () => {
            setSaving(true);
            await api.setApiKey(value.trim());
            setSaving(false);
            onSaved();
          }}
        >save</button>
      </div>
    </section>
  );
}
