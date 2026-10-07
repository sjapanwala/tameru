import { useEffect, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';

interface SheetProps {
  /** Accessible name for the dialog. */
  label: string;
  onClose(): void;
  children: ReactNode;
  /** "sheet" slides up from the bottom; "alert" is a centred confirm. */
  variant?: 'sheet' | 'alert';
  onKeyDown?(event: KeyboardEvent<HTMLDialogElement>): void;
}

/**
 * Modal built on the native <dialog>: focus trapping, Escape and the inert
 * background come from the browser. Mount it to open, unmount to close.
 */
export function Sheet({ label, onClose, children, variant = 'sheet', onKeyDown }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useLayoutEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  // Hand focus back to whatever opened the dialog.
  useEffect(() => {
    const opener = document.activeElement;
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className={`dialog dialog--${variant}`}
      aria-label={label}
      onClose={onClose}
      onKeyDown={onKeyDown}
      onClick={(event) => {
        // The dialog element itself is only hit on the backdrop.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="dialog__body">{children}</div>
    </dialog>
  );
}

interface ConfirmProps {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm(): void;
  onCancel(): void;
}

export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmProps) {
  return (
    <Sheet label={title} variant="alert" onClose={onCancel}>
      <h2 className="dialog__title">{title}</h2>
      <div className="dialog__text">{children}</div>
      <div className="dialog__actions">
        <button type="button" className="btn btn--quiet" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          className={`btn ${danger ? 'btn--danger' : 'btn--primary'}`}
          onClick={onConfirm}
          disabled={busy}
        >
          {busy ? 'Working…' : confirmLabel}
        </button>
      </div>
    </Sheet>
  );
}
