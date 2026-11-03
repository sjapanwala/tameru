// The confirmation after saving from Add: the screen floods with the accent colour from
// where Save was, a check draws itself, then what was logged settles in underneath so
// it can be checked at a glance. Done (or Esc) closes it; Undo removes the entry.

import { useEffect, useRef, useState } from 'preact/hooks';
import { S } from '../copy/strings';
import type { Cents } from '../domain/types';
import { Amount } from './components';
import { haptic, reducedMotion } from './motion';

export interface LoggedEntry {
  kind: string; // "Expense", "Income"…
  amountCents: Cents;
  sign?: '+' | '−';
  rows: [label: string, value: string][];
  origin?: { x: number; y: number }; // where the flood starts, in viewport px
  undo?: () => Promise<void>;
}

let push: ((e: LoggedEntry & { id: number }) => void) | null = null;
let seq = 0;

/** Show the full-screen confirmation for something just logged. */
export function showLogged(entry: LoggedEntry): void {
  push?.({ ...entry, id: ++seq });
}

const LEAVE_MS = 280;

export function LoggedHost() {
  const [entry, setEntry] = useState<(LoggedEntry & { id: number }) | null>(null);
  const [leaving, setLeaving] = useState(false);
  const done = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    push = (e) => {
      setLeaving(false);
      setEntry(e);
    };
    return () => {
      push = null;
    };
  }, []);

  const close = () => {
    if (!entry || leaving) return;
    setLeaving(true);
    setTimeout(() => (setEntry(null), setLeaving(false)), reducedMotion() ? 0 : LEAVE_MS);
  };

  useEffect(() => {
    if (!entry) return;
    haptic(14);
    const t = setTimeout(() => done.current?.focus({ preventScroll: true }), 700);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, [entry?.id, leaving]);

  if (!entry) return null;
  const o = entry.origin ?? { x: window.innerWidth / 2, y: window.innerHeight * 0.85 };
  return (
    <div
      class={`logged${leaving ? ' logged--out' : ''}`}
      key={entry.id}
      role="dialog"
      aria-modal="true"
      aria-label={S.logged.title}
      style={{ '--ox': `${o.x}px`, '--oy': `${o.y}px` }}
    >
      <div class="logged__body">
        <svg class="logged__check" viewBox="0 0 64 64" aria-hidden="true">
          <circle cx="32" cy="32" r="29" />
          <path d="M19 33.5 28 42 45 23" />
        </svg>
        <p class="logged__kind" aria-live="polite">
          {S.logged.saved(entry.kind)}
        </p>
        <p class="logged__amount">
          <Amount c={entry.amountCents} sign={entry.sign} />
        </p>
        <ul class="logged__rows">
          {entry.rows.map(([k, v]) => (
            <li key={k}>
              <span>{k}</span>
              <span>{v}</span>
            </li>
          ))}
        </ul>
      </div>
      <div class="logged__actions">
        <button type="button" ref={done} class="logged__done" onClick={close}>
          {S.common.done}
        </button>
        {entry.undo && (
          <button
            type="button"
            class="logged__undo"
            onClick={async () => {
              await entry.undo!();
              close();
            }}
          >
            {S.common.undo}
          </button>
        )}
      </div>
    </div>
  );
}
