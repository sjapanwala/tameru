// The card wallet in Home's hero. Closed: up to three cards peek out of the hero's
// bottom edge. Pull the hero down (or tap the stack / the handle) and the cards fan
// out into a list, each peeking from behind the next, like a real wallet. Tapping a
// card in the open wallet opens it on the Accounts carousel.
//
// One value drives everything: p, from 0 (closed) to 1 (open). While dragging it
// follows the finger; on release it glides to 0 or 1.

import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { S } from '../copy/strings';
import type { CatalogCard } from '../domain/cardCatalog';
import type { Account } from '../domain/types';
import { CardFace } from './cards';
import { haptic, reducedMotion } from './motion';
import { go } from './router';

const CLOSED_H = 132; // visible height of the closed stack inside the hero
const TOP = 28; // where the front card starts within the stack
const PEEK = 58; // how much of each card shows in the open wallet
const OPEN_AT = 0.3; // release past this fraction to open (or below 1 − this to close)
const DRAG_START = 6; // px of vertical movement before a press becomes a drag
const HOLD_MS = 380; // press-and-hold on an open card picks it up to rearrange

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number) => Math.max(0, Math.min(1, v));

export interface WalletPull {
  p: number;
  open: boolean;
  dragging: boolean;
  setOpen: (o: boolean) => void;
  /** Spread on the element the gesture should work on (the hero). */
  bind: {
    onPointerDown: (e: PointerEvent) => void;
    onPointerMove: (e: PointerEvent) => void;
    onPointerUp: (e: PointerEvent) => void;
    onPointerCancel: (e: PointerEvent) => void;
    onClickCapture: (e: MouseEvent) => void;
    style: Record<string, string>;
  };
  /** Wallet height difference between open and closed (set by <Wallet/>). */
  setTravel: (px: number) => void;
  /** Attach to the hero: blocks the page's own scroll during a pull (iOS ignores pan-up/pan-down). */
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
  // the finger pulls the wallet open (closed, at the top, moving down) or pushes it
  // closed (open, moving up). Everything else scrolls normally.
  // The hero mounts after Home's data loads, so track the element in state (via a
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

export function Wallet({
  accounts,
  catalog,
  pull,
  onReorder,
}: {
  accounts: Account[];
  catalog: CatalogCard[];
  pull: WalletPull;
  onReorder: (ids: string[]) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  // Rearranging: the lifted card follows the finger; the rest glide to make room.
  const [lift, setLift] = useState<{ id: string; pointer: number; startY: number; y: number; slot: number } | null>(null);
  const hold = useRef<{ timer: number; x: number; y: number } | null>(null);
  const justDropped = useRef(false);
  const [width, setWidth] = useState(320);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth || 320);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = accounts.length;
  const cardH = width / 1.586;
  const openH = TOP + Math.max(0, n - 1) * PEEK + cardH + 28;
  useEffect(() => pull.setTravel(openH - CLOSED_H), [openH]);
  if (!n) return null;

  const p = pull.p;
  const t = clamp(p);
  const animate = !pull.dragging && !reducedMotion();

  // Open-wallet slots run top to bottom; the first account (front card) is the bottom slot.
  const visual = [...accounts].reverse().map((x) => x.id);
  const orderWith = (id: string, slot: number): string[] => {
    const v = visual.filter((x) => x !== id);
    v.splice(slot, 0, id);
    return v.reverse(); // back to front-first order
  };
  const order = lift ? [...orderWith(lift.id, lift.slot)].reverse() : visual;
  const slotOf = (id: string) => order.indexOf(id);

  return (
    <>
      <div
        ref={box}
        class={`wallet${animate ? ' wallet--animate' : ''}${pull.open ? ' wallet--open' : ''}`}
        style={{ height: `${lerp(CLOSED_H, openH, Math.max(0, p))}px` }}
        onClick={() => !pull.open && pull.setOpen(true)}
        role={pull.open ? undefined : 'button'}
        aria-label={pull.open ? undefined : S.wallet.open}
        aria-expanded={pull.open}
      >
        {accounts.map((a, i) => {
          // Closed: up to three cards fanned behind the front one. Open: a list where
          // the front card (i = 0) sits at the bottom, fully visible, others peeking above.
          const depth = Math.min(i, 2);
          const closedY = TOP - depth * 14;
          const closedScale = 1 - depth * 0.06;
          const closedOpacity = i < 3 ? 1 - depth * 0.28 : 0;
          const lifted = lift?.id === a.id;
          const openY = lifted ? lift!.y : TOP + slotOf(a.id) * PEEK;
          const y = lerp(closedY, openY, Math.max(0, p));
          const scale = lifted ? 1.04 : lerp(closedScale, 1, t);
          const opacity = lerp(closedOpacity, 1, t);
          return (
            <button
              type="button"
              key={a.id}
              class={`wallet__card${lifted ? ' wallet__card--lifted' : ''}`}
              tabIndex={pull.open ? 0 : -1}
              aria-label={a.name}
              style={{ transform: `translateY(${y}px) scale(${scale})`, opacity: String(opacity), zIndex: String(lifted ? n + 1 : n - i) }}
              onPointerDown={(e) => {
                if (!pull.open || e.button !== 0) return;
                const target = e.currentTarget as HTMLElement;
                const pointerId = e.pointerId;
                const startY = e.clientY;
                hold.current = {
                  x: e.clientX,
                  y: e.clientY,
                  timer: window.setTimeout(() => {
                    hold.current = null;
                    pull.yieldTo(true);
                    target.setPointerCapture?.(pointerId);
                    haptic(14);
                    const slot = slotOf(a.id);
                    setLift({ id: a.id, pointer: startY, startY: TOP + slot * PEEK, y: TOP + slot * PEEK, slot });
                  }, HOLD_MS),
                };
              }}
              onPointerMove={(e) => {
                const h = hold.current;
                if (h && Math.hypot(e.clientX - h.x, e.clientY - h.y) > DRAG_START) {
                  // Moved before the hold: it's a scroll or a wallet push, not a pick-up.
                  window.clearTimeout(h.timer);
                  hold.current = null;
                }
                if (!lift || lift.id !== a.id) return;
                e.stopPropagation(); // the hero mustn't treat this as a pull
                const y = Math.max(TOP - 24, Math.min(TOP + (n - 1) * PEEK + 24, lift.startY + e.clientY - lift.pointer));
                const slot = Math.max(0, Math.min(n - 1, Math.round((y - TOP) / PEEK)));
                if (slot !== lift.slot) haptic(4);
                setLift({ ...lift, y, slot });
              }}
              onPointerUp={(e) => {
                if (hold.current) {
                  window.clearTimeout(hold.current.timer);
                  hold.current = null;
                }
                if (!lift || lift.id !== a.id) return;
                e.stopPropagation();
                const ids = orderWith(lift.id, lift.slot);
                setLift(null);
                pull.yieldTo(false);
                justDropped.current = true;
                if (ids.join() !== accounts.map((x) => x.id).join()) onReorder(ids);
              }}
              onPointerCancel={() => {
                if (hold.current) window.clearTimeout(hold.current.timer);
                hold.current = null;
                if (lift?.id === a.id) {
                  setLift(null);
                  pull.yieldTo(false);
                }
              }}
              onContextMenu={(e) => pull.open && e.preventDefault()}
              onClick={(e) => {
                if (!pull.open) return; // the first tap opens the wallet
                e.stopPropagation();
                if (justDropped.current) {
                  justDropped.current = false; // releasing a rearranged card isn't a tap
                  return;
                }
                go(`/accounts?id=${encodeURIComponent(a.id)}`);
              }}
            >
              <CardFace account={a} catalog={catalog} />
            </button>
          );
        })}
      </div>
      <button type="button" class="wallet__handle" aria-label={pull.open ? S.wallet.close : S.wallet.open} aria-expanded={pull.open} onClick={() => pull.setOpen(!pull.open)}>
        <span />
      </button>
    </>
  );
}
