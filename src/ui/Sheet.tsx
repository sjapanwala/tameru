// Bottom sheet: slides up over the current screen. Closes on backdrop tap or Escape.

import { createPortal } from 'preact/compat';
import { useEffect, useState } from 'preact/hooks';
import { reducedMotion } from './motion';

/** Matches --t-mid in tokens.css so the panel finishes gliding out before unmounting. */
const CLOSE_MS = 420;

export function Sheet({ onClose, label, children }: { onClose: () => void; label: string; children: preact.ComponentChildren }) {
  const [closing, setClosing] = useState(false);
  const close = () => {
    if (reducedMotion()) return onClose();
    setClosing(true);
    setTimeout(onClose, CLOSE_MS);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    document.body.classList.add('sheet-open');
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.classList.remove('sheet-open');
    };
  }, []);
  // Rendered at the end of <body>: inside a screen, any transformed ancestor (e.g. a
  // page's entrance animation) would make position: fixed relative to it and push
  // the sheet off-screen.
  return createPortal(
    <div class={`sheet${closing ? ' sheet--closing' : ''}`}>
      <div class="sheet__backdrop" onClick={close} />
      <div class="sheet__panel" role="dialog" aria-modal="true" aria-label={label}>
        <div class="sheet__grabber" onClick={close} />
        {children}
      </div>
    </div>,
    document.body,
  );
}
