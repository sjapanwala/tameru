// Press-and-hold (or right-click) detection that doesn't fight scrolling:
// moving more than a few pixels before the hold completes cancels it.

import { useRef } from 'preact/hooks';
import { haptic } from './motion';

const HOLD_MS = 450;
const SLOP = 8;

export function useLongPress(onHold: (el: HTMLElement) => void) {
  const t = useRef<{ timer: number; x: number; y: number } | null>(null);
  const fired = useRef(false);
  const cancel = () => {
    if (t.current) window.clearTimeout(t.current.timer);
    t.current = null;
  };
  return {
    onPointerDown: (e: PointerEvent) => {
      if (e.button !== 0) return;
      const el = e.currentTarget as HTMLElement;
      fired.current = false;
      t.current = {
        x: e.clientX,
        y: e.clientY,
        timer: window.setTimeout(() => {
          t.current = null;
          fired.current = true;
          haptic(14);
          onHold(el);
        }, HOLD_MS),
      };
    },
    onPointerMove: (e: PointerEvent) => {
      if (t.current && Math.hypot(e.clientX - t.current.x, e.clientY - t.current.y) > SLOP) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    // Right-click on desktop opens the same options straight away.
    onContextMenu: (e: MouseEvent) => {
      e.preventDefault();
      cancel();
      fired.current = true;
      onHold(e.currentTarget as HTMLElement);
    },
    // The click that ends a hold isn't a tap.
    onClickCapture: (e: MouseEvent) => {
      if (fired.current) {
        e.preventDefault();
        e.stopPropagation();
        fired.current = false;
      }
    },
  };
}
