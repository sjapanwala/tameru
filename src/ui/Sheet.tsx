// Bottom sheet: slides up over the current screen. Closes on backdrop tap, Escape,
// or by dragging it down (from the grabber, or from the content when it's scrolled to the top).

import { createPortal } from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/hooks';
import { reducedMotion } from './motion';

/** Matches --t-mid in tokens.css so the panel finishes gliding out before unmounting. */
const CLOSE_MS = 420;
/** Drag further than this, or flick faster than FLICK px/ms, and the sheet closes. */
const CLOSE_DISTANCE = 110;
const FLICK = 0.5;

export function Sheet({ onClose, label, children }: { onClose: () => void; label: string; children: preact.ComponentChildren }) {
  const [closing, setClosing] = useState(false);
  const [shown, setShown] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
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

  // Drag to dismiss. Touch events (not pointer events) so the drag can claim the
  // gesture from the panel's own scrolling with preventDefault.
  useEffect(() => {
    const el = panel.current;
    if (!el) return;
    let start: { x: number; y: number; t: number; fromTop: boolean } | null = null;
    let dragging = false;
    let dy = 0;
    const paint = (y: number) => {
      el.style.transform = y ? `translate(-50%, ${y}px)` : '';
      if (backdrop.current) backdrop.current.style.opacity = y ? String(Math.max(0, 1 - y / el.offsetHeight)) : '';
    };
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return (start = null);
      const t = e.touches[0]!;
      const onGrabber = (e.target as Element).closest('.sheet__grabber') !== null;
      start = { x: t.clientX, y: t.clientY, t: e.timeStamp, fromTop: onGrabber || el.scrollTop <= 0 };
      dragging = false;
      dy = 0;
    };
    const onMove = (e: TouchEvent) => {
      if (!start) return;
      const t = e.touches[0]!;
      const y = t.clientY - start.y;
      if (!dragging) {
        // Only a downward, mostly vertical drag that starts with the content at the top.
        if (!start.fromTop || el.scrollTop > 0 || y < 8 || Math.abs(t.clientX - start.x) > y) {
          if (Math.abs(y) > 8 || Math.abs(t.clientX - start.x) > 8) start = null;
          return;
        }
        dragging = true;
        el.parentElement!.dataset.dragging = '';
        (document.activeElement as HTMLElement | null)?.blur?.(); // drop the keyboard while dragging
      }
      e.preventDefault();
      dy = Math.max(0, y - 8);
      paint(dy);
    };
    const onEnd = (e: TouchEvent) => {
      if (!start) return;
      const speed = dy / Math.max(1, e.timeStamp - start.t);
      start = null;
      if (!dragging) return;
      dragging = false;
      delete el.parentElement!.dataset.dragging;
      // Clearing the drag offset lets the transition glide the panel on from where it
      // is: down and out when closing (the class goes on in the same frame), else back up.
      if (dy > CLOSE_DISTANCE || speed > FLICK) {
        el.parentElement!.classList.add('sheet--closing');
        close();
      }
      paint(0);
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  // Rendered at the end of <body>: inside a screen, any transformed ancestor (e.g. a
  // page's entrance animation) would make position: fixed relative to it and push
  // the sheet off-screen.
  return createPortal(
    <div class={`sheet${shown ? ' sheet--shown' : ''}${closing ? ' sheet--closing' : ''}`}>
      <div ref={backdrop} class="sheet__backdrop" onClick={close} />
      <div
        ref={panel}
        class="sheet__panel"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onAnimationEnd={(e) => e.target === e.currentTarget && setShown(true)}
      >
        <div class="sheet__grabber" onClick={close} />
        {children}
      </div>
    </div>,
    document.body,
  );
}
