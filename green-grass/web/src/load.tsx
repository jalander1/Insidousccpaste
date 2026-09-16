import { Component, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

function message(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  const s = String(err ?? '').trim();
  return s && s !== '[object Object]' ? s : 'The app could not reach its own record.';
}

/**
 * Loading is the one place a failure has to be visible. A view that renders
 * nothing when its fetch fails is indistinguishable from a broken app — you
 * get a window with a title and an empty space under it, and no way to tell
 * whether the day is blank or the database never opened.
 */
export function useLoader(load: () => Promise<unknown>, deps: unknown[]) {
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const ref = useRef(load);
  ref.current = load;

  useEffect(() => {
    let live = true;
    setError(null);
    ref.current().catch((err) => {
      console.error(err);
      if (live) setError(message(err));
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt]);

  return { error, retry: () => setAttempt((n) => n + 1) };
}

export function Failed({ error, retry }: { error: string; retry: () => void }) {
  return (
    <div className="failed">
      <p className="eyebrow">Could not read the record</p>
      <p className="serif">{error}</p>
      <button className="navbtn" onClick={retry}>try again</button>
    </div>
  );
}

/**
 * The last net: a crash in any view leaves a readable page rather than a
 * white window, so a broken app can say what broke.
 */
export class Boundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };

  static getDerivedStateFromError(err: unknown) {
    return { error: message(err) };
  }

  componentDidCatch(err: unknown) { console.error(err); }

  render() {
    if (this.state.error === null) return this.props.children;
    return (
      <div className="shell">
        <h1 className="masthead">Green <em>Grass</em></h1>
        <div className="failed">
          <p className="eyebrow">Something in the app broke</p>
          <p className="serif">{this.state.error}</p>
          <button className="navbtn" onClick={() => this.setState({ error: null })}>
            try again
          </button>
        </div>
      </div>
    );
  }
}
