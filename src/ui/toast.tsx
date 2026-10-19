// One toast at a time, floating above the tab bar. Screens call toast(text).

import { useEffect, useState } from 'preact/hooks';

interface ToastAction {
  label: string;
  run: () => void;
}
interface Toast {
  text: string;
  id: number;
  action?: ToastAction;
}

let push: ((t: Toast) => void) | null = null;
let seq = 0;

/** Show a toast; with an action (e.g. Undo) it stays a little longer. */
export function toast(text: string, action?: ToastAction): void {
  push?.({ text, id: ++seq, ...(action ? { action } : {}) });
}

export function ToastHost() {
  const [t, setT] = useState<Toast | null>(null);
  useEffect(() => {
    push = setT;
    return () => {
      push = null;
    };
  }, []);
  useEffect(() => {
    if (!t) return;
    const h = setTimeout(() => setT(null), t.action ? 4600 : 2800);
    return () => clearTimeout(h);
  }, [t?.id]);
  return t ? (
    <div class={`toast${t.action ? ' toast--action' : ''}`} role="status" key={t.id}>
      <span>{t.text}</span>
      {t.action && (
        <button
          type="button"
          onClick={() => {
            t.action!.run();
            setT(null);
          }}
        >
          {t.action.label}
        </button>
      )}
    </div>
  ) : null;
}
