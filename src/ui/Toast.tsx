import { useEffect } from 'react';
import type { ToastInput } from './context';
import { CloseIcon } from './Icons';

export interface ToastState extends ToastInput {
  id: number;
}

const AUTO_DISMISS_MS = 7000;

export function Toast({ toast, onDismiss }: { toast: ToastState | null; onDismiss(): void }) {
  useEffect(() => {
    if (!toast || toast.sticky) return;
    const timer = window.setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [toast, onDismiss]);

  return (
    // The live region stays mounted so screen readers announce new toasts.
    <div className="toast-region" role="status" aria-live="polite">
      {toast && (
        <div className="toast" key={toast.id}>
          <span className="toast__message">{toast.message}</span>
          {toast.actionLabel && (
            <button
              type="button"
              className="toast__action"
              onClick={() => {
                onDismiss();
                void toast.onAction?.();
              }}
            >
              {toast.actionLabel}
            </button>
          )}
          <button type="button" className="toast__close" aria-label="Dismiss" onClick={onDismiss}>
            <CloseIcon size={18} />
          </button>
        </div>
      )}
    </div>
  );
}
