import { useRef, useState } from 'react';
import type { DragEvent, KeyboardEvent } from 'react';

function moved<T>(items: T[], from: number, to: number): T[] {
  const next = [...items];
  const [row] = next.splice(from, 1);
  next.splice(to, 0, row);
  return next;
}

/**
 * Drag a row by its grip to reorder a list.
 *
 * The grip is the draggable element, not the row: make the whole row
 * draggable and selecting the text in one of its fields starts a drag
 * instead. The row is still what you see moving — the grip hands its own
 * row to `setDragImage` on the way out.
 *
 * The list reorders live under the cursor rather than waiting for the drop,
 * so you can see where something will land before letting go. `setItems` is
 * that preview; `onDrop` saves, and runs once at the end rather than on every
 * pass over a neighbour.
 *
 * The grip is a button, so the same move works from the keyboard: focus it
 * and press the arrow keys.
 */
export function useSortable<T>(opts: {
  items: T[];
  setItems: (next: T[]) => void;
  onDrop?: (next: T[]) => void;
}) {
  const [from, setFrom] = useState<number | null>(null);
  const latest = useRef(opts);
  latest.current = opts;

  const finish = () => {
    if (from !== null) latest.current.onDrop?.(latest.current.items);
    setFrom(null);
  };

  return {
    dragging: from,

    /** The grip: the only part of a row that starts a drag. */
    grip: (i: number) => ({
      className: 'grip',
      type: 'button' as const,
      draggable: true,
      'aria-label': 'Reorder — drag, or use the arrow keys',
      title: 'Drag to reorder',
      onDragStart: (e: DragEvent<HTMLElement>) => {
        setFrom(i);
        e.dataTransfer.effectAllowed = 'move';
        // Firefox refuses to start a drag with nothing on the clipboard.
        e.dataTransfer.setData('text/plain', String(i));
        const row = e.currentTarget.closest('[data-sortable-row]');
        if (row) e.dataTransfer.setDragImage(row, 20, 16);
      },
      onDragEnd: finish,
      onKeyDown: (e: KeyboardEvent) => {
        const dir = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
        if (!dir) return;
        e.preventDefault();
        const to = i + dir;
        const { items, setItems, onDrop } = latest.current;
        if (to < 0 || to >= items.length) return;
        const next = moved(items, i, to);
        setItems(next);
        onDrop?.(next);
      },
    }),

    /** The row the grip sits in, and a place for another row to land. */
    row: (i: number) => ({
      'data-sortable-row': '',
      onDragOver: (e: DragEvent) => {
        if (from === null) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (from === i) return;
        latest.current.setItems(moved(latest.current.items, from, i));
        setFrom(i);
      },
      onDrop: (e: DragEvent) => { e.preventDefault(); finish(); },
    }),
  };
}
