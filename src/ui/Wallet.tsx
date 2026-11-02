// A pull-to-open gesture (used by the spend cards on Plan): pull the element down and
// it opens, push it up and it closes.
//
// One value drives everything: p, from 0 (closed) to 1 (open). While dragging it
// follows the finger; on release it glides to 0 or 1.

import { useEffect, useRef, useState } from 'preact/hooks';
import { haptic } from './motion';

const OPEN_AT = 0.3; // release past this fraction to open (or below 1 − this to close)
const DRAG_START = 6; // px of vertical movement before a press becomes a drag

export interface WalletPull {
  p: number;
  open: boolean;
  dragging: boolean;
  setOpen: (o: boolean) => void;
  /** Spread on the element the gesture should work on. */
  bind: {
    onPointerDown: (e: PointerEvent) => void;
    onPointerMove: (e: PointerEvent) => void;
    onPointerUp: (e: PointerEvent) => void;
    onPointerCancel: (e: PointerEvent) => void;
    onClickCapture: (e: MouseEvent) => void;
    style: Record<string, string>;
  };
  /** Distance between open and closed, in px. */
  setTravel: (px: number) => void;
  /** Attach to the same element: blocks the page's own scroll during a pull (iOS ignores pan-up/pan-down). */
  ref: (el: HTMLElement | null) => void;
  /** A card has been picked up to rearrange: stop treating this press as a pull. */
  yieldTo: (reordering: boolean) => void;
}

export function useWalletPull(): WalletPull {
  const [open, setOpenState] = useState(false);
  const [p, setP] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ y: number; base: number; id: number; active: boolean } | null>(null);
  const travel = useRef(300);
  const moved = useRef(false);
  const openRef = useRef(open);
  openRef.current = open;
  const reordering = useRef(false);

  // Native, non-passive touchmove so we can stop the page scrolling/bouncing while
  // the finger pulls it open (closed, at the top, moving down) or pushes it
  // closed (open, moving up). Everything else scrolls normally.
  // The element may mount after its data loads, so track the element in state (via a
  // stable ref callback) and attach whenever it appears.
  const [node, setNode] = useState<HTMLElement | null>(null);
  const refCallback = useRef((n: HTMLElement | null) => setNode(n)).current;
  const touchY = useRef(0);
  useEffect(() => {
    if (!node) return;
    const onStart = (e: TouchEvent) => {
      touchY.current = e.touches[0]?.clientY ?? 0;
    };
    const onMove = (e: TouchEvent) => {
      const dy = (e.touches[0]?.clientY ?? 0) - touchY.current;
      const pulling = !openRef.current && dy > 0 && window.scrollY <= 0;
      const pushing = openRef.current && dy < 0;
      if ((pulling || pushing || reordering.current) && e.cancelable) e.preventDefault();
    };
    node.addEventListener('touchstart', onStart, { passive: true });
    node.addEventListener('touchmove', onMove, { passive: false });
    return () => {
      node.removeEventListener('touchstart', onStart);
      node.removeEventListener('touchmove', onMove);
    };
  }, [node]);

  const setOpen = (o: boolean) => {
    setOpenState(o);
    setP(o ? 1 : 0);
    haptic(o ? 10 : 6);
  };

  return {
    ref: refCallback,
    yieldTo: (on) => {
      reordering.current = on;
      if (on) {
        start.current = null;
        setDragging(false);
      }
    },
    p,
    open,
    dragging,
    setOpen,
    setTravel: (px) => {
      travel.current = Math.max(120, px);
    },
    bind: {
      onPointerDown: (e) => {
        if (e.button !== 0) return;
        start.current = { y: e.clientY, base: open ? 1 : 0, id: e.pointerId, active: false };
        moved.current = false;
      },
      onPointerMove: (e) => {
        const s = start.current;
        if (!s || s.id !== e.pointerId) return;
        const dy = e.clientY - s.y;
        if (!s.active) {
          // Only a pull down when closed, or a push up when open, becomes a drag.
          if (Math.abs(dy) < DRAG_START || (s.base === 0 && dy < 0) || (s.base === 1 && dy > 0)) return;
          s.active = true;
          moved.current = true;
          setDragging(true);
          (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
        }
        // Rubber-band slightly past the ends.
        const raw = s.base + dy / travel.current;
        setP(raw < 0 ? raw * 0.2 : raw > 1 ? 1 + (raw - 1) * 0.2 : raw);
      },
      onPointerUp: (e) => {
        const s = start.current;
        start.current = null;
        if (!s || !s.active || s.id !== e.pointerId) return;
        setDragging(false);
        const next = s.base === 0 ? p > OPEN_AT : p > 1 - OPEN_AT;
        setOpen(next);
      },
      onPointerCancel: () => {
        start.current = null;
        setDragging(false);
        setP(open ? 1 : 0);
      },
      // A drag must not also count as a tap on whatever it started on.
      onClickCapture: (e) => {
        if (moved.current) {
          e.preventDefault();
          e.stopPropagation();
          moved.current = false;
        }
      },
      // Let the browser handle sideways pans and the direction we don't use, so
      // the page still scrolls; we take the pull down (closed) / push up (open).
      style: { touchAction: open ? 'pan-x pan-down' : 'pan-x pan-up' },
    },
  };
}
