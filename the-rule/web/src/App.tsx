import { useEffect, useState } from 'react';
import { api } from './api.js';
import { useSavedFlash } from './save.js';
import { trackingDate } from '../../shared/dates.js';
import Today from './views/Today.js';
import Week from './views/Week.js';
import Review from './views/Review.js';
import Trends from './views/Trends.js';
import Manage from './views/Manage.js';

const TABS = ['Today', 'Week', 'Review', 'Trends', 'Manage'] as const;
type Tab = (typeof TABS)[number];

export default function App() {
  const [tab, setTab] = useState<Tab>('Today');
  // The day the app opens on: before noon, yesterday — the sheet was always
  // filled the morning after.
  const [date, setDate] = useState<string>(trackingDate());
  const [ready, setReady] = useState(false);
  const saved = useSavedFlash();

  useEffect(() => {
    // Trust the server's clock rather than the renderer's, so a machine left
    // asleep across midnight still opens on the right day.
    api.today()
      .then((t) => setDate(t.trackingDate))
      .catch(() => undefined)
      .finally(() => setReady(true));
  }, []);

  return (
    <div className="shell">
      <div className="titlebar" />
      <p className="eyebrow">Standing rule · kept daily</p>
      <h1 className="masthead">The <em>Rule</em></h1>

      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            aria-current={tab === t ? 'page' : undefined}
          >
            {t}
          </button>
        ))}
      </nav>

      {!ready ? null : tab === 'Today' ? (
        <Today date={date} setDate={setDate} />
      ) : tab === 'Week' ? (
        <Week date={date} setDate={setDate} onOpenDay={(d) => { setDate(d); setTab('Today'); }} />
      ) : tab === 'Review' ? (
        <Review date={date} />
      ) : tab === 'Trends' ? (
        <Trends />
      ) : (
        <Manage />
      )}

      <p className={`saved${saved.show ? ' show' : ''}${saved.error ? ' error' : ''}`}>
        {saved.error ? 'Not saved — try again' : 'Saved'}
      </p>
    </div>
  );
}
