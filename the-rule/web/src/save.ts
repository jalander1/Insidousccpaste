import { useEffect, useRef, useState } from 'react';

type Listener = (state: { show: boolean; error: boolean }) => void;
const listeners = new Set<Listener>();
let timer: ReturnType<typeof setTimeout> | undefined;

/** The prototype's quiet "Saved" whisper — never a dialog, never in the way. */
export function flashSaved(error = false): void {
  for (const l of listeners) l({ show: true, error });
  clearTimeout(timer);
  timer = setTimeout(() => {
    for (const l of listeners) l({ show: false, error });
  }, 1400);
}

export function useSavedFlash() {
  const [state, setState] = useState({ show: false, error: false });
  useEffect(() => {
    listeners.add(setState);
    return () => { listeners.delete(setState); };
  }, []);
  return state;
}

/** Report a failed write loudly enough to notice, quietly enough to ignore. */
export async function track<T>(p: Promise<T>): Promise<T | undefined> {
  try {
    const out = await p;
    flashSaved();
    return out;
  } catch (err) {
    console.error(err);
    flashSaved(true);
    return undefined;
  }
}

/**
 * Text fields save on a debounce so typing never blocks, and flush on unmount
 * so navigating away mid-sentence does not lose the sentence.
 */
export function useDebouncedSave<T>(
  value: T,
  save: (v: T) => Promise<unknown>,
  delay = 700,
): void {
  const saveRef = useRef(save);
  saveRef.current = save;
  const first = useRef(true);
  const pending = useRef<T | undefined>(undefined);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    pending.current = value;
    const t = setTimeout(() => {
      pending.current = undefined;
      void track(saveRef.current(value));
    }, delay);
    return () => clearTimeout(t);
  }, [value, delay]);

  useEffect(() => () => {
    if (pending.current !== undefined) void saveRef.current(pending.current);
  }, []);
}
