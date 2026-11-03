// Home's card stack, in three states:
// - All accounts (closed): a summary of what's left, split by card, with the cards
//   resting behind it, just their tops showing.
// - A card selected (closed): that card in front, the next ones peeking above it.
//   Swipe sideways to step through the cards.
// - Open: every card fanned out under an "All accounts" row. Tap one to select it.
// Pull down (or tap) to open; pull up, tap Done, or pick something to close.

import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { money, S } from '../copy/strings';
import type { CatalogCard } from '../domain/cardCatalog';
import type { Account, Cents } from '../domain/types';
import type { CardShare } from '../services/home';
import { CardFace } from './cards';
import { Amount } from './components';
import { haptic, reducedMotion } from './motion';

const SWIPE = 70; // px past which a sideways release moves to the next card
const PULL = 40; // px past which a vertical release opens or closes
const AXIS = 8; // px before a drag picks an axis
const PEEK = 11; // px of each card showing behind the one in front
const DEPTH = 3; // cards drawn in a closed stack; the rest hide behind the last
const ROW = 76; // px of each card showing when the stack is open
const ALL_ROW = 56; // the All accounts row, and the gap under it
const LEGEND = 3; // cards named under the summary bar

export function CardStack(props: {
  cards: Account[];
  colors: Record<string, string>;
  perCard: Record<string, CardShare>;
  leftCents: Cents; // what's left for the period, all cards together
  periodEnd: string;
  catalog: CatalogCard[];
  index: number; // 0 is All accounts, then each card
  onIndex: (i: number) => void;
  open: boolean;
  onOpen: (open: boolean) => void;
}) {
  const { cards, index, open } = props;
  const n = cards.length;
  const frame = useRef<HTMLDivElement>(null);
  const summary = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const [sumH, setSumH] = useState(112);
  const [drag, setDragState] = useState({ x: 0, y: 0, on: false });
  const dragRef = useRef(drag);
  const setDrag = (d: { x: number; y: number; on: boolean }) => {
    dragRef.current = d;
    setDragState(d);
  };
  const g = useRef<{ x: number; y: number; id: number; axis: 'x' | 'y' | null; target: Element | null } | null>(null);

  useLayoutEffect(() => {
    const el = frame.current;
    if (!el) return;
    const measure = () => {
      setW(el.clientWidth);
      if (summary.current) setSumH(summary.current.offsetHeight);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (summary.current) ro.observe(summary.current);
    return () => ro.disconnect();
  }, []);

  // iOS starts its own page scroll for a vertical drag whatever touch-action says, and
  // then cancels our pointer events. A native, non-passive touchmove that blocks the
  // page while the finger is on the stack keeps the drag ours (as useWalletPull does).
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const onTouchMove = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault();
    };
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => el.removeEventListener('touchmove', onTouchMove);
  }, []);

  // Esc closes the open stack, as Done does.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const h = w / 1.586; // card height (ID-1 proportions)
  const sel = index - 1; // selected card, or -1 for All accounts

  const choose = (i: number) => {
    haptic(6);
    props.onIndex(i);
    props.onOpen(false);
  };

  const onDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    g.current = { x: e.clientX, y: e.clientY, id: e.pointerId, axis: null, target: e.target as Element };
  };
  const onMove = (e: PointerEvent) => {
    const s = g.current;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (!s.axis) {
      if (Math.abs(dx) < AXIS && Math.abs(dy) < AXIS) return;
      s.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    }
    if (s.axis === 'x') setDrag({ x: !open && sel >= 0 ? dx : 0, y: 0, on: true });
    else setDrag({ x: 0, y: dy, on: true });
  };
  const onUp = (e: PointerEvent) => {
    const s = g.current;
    g.current = null;
    if (!s || s.id !== e.pointerId) return;
    const { x, y } = dragRef.current;
    setDrag({ x: 0, y: 0, on: false });
    if (!s.axis) {
      // a tap: when open, pick what was tapped; when closed, open
      if (!open) return void (haptic(6), props.onOpen(true));
      const card = s.target?.closest('[data-card]');
      if (card) choose(Number(card.getAttribute('data-card')) + 1);
      return; // the All accounts row is a button and handles its own click
    }
    if (s.axis === 'y') {
      if (y > PULL && !open) (haptic(6), props.onOpen(true));
      else if (y < -PULL && open) props.onOpen(false);
      return;
    }
    if (!open && sel >= 0 && n > 1) {
      if (x < -SWIPE) (haptic(6), props.onIndex(((sel + 1) % n) + 1));
      else if (x > SWIPE) (haptic(6), props.onIndex(((sel - 1 + n) % n) + 1));
    }
  };
  const cancel = () => {
    g.current = null;
    setDrag({ x: 0, y: 0, on: false });
  };

  const pull = Math.max(0, drag.y);
  const pullUp = Math.min(0, drag.y);
  const animate = !drag.on && !reducedMotion();
  const cardsTop = sumH + 16;
  const height = open
    ? ALL_ROW + Math.max(0, n - 1) * ROW + h
    : sel < 0
      ? cardsTop + (Math.min(n, DEPTH) - 1) * PEEK + 14 + pull * 1.1
      : (DEPTH - 1) * PEEK + 2 + h + pull * 0.9;

  // The summary splits what's left by card; each segment is that card's share.
  const left = (a: Account) => props.perCard[a.id]?.leftCents ?? 0;
  const total = props.leftCents;
  const segs = total > 0 ? cards.filter((a) => left(a) > 0) : [];

  return (
    <div class={`stack${open ? ' stack--open' : ''}`}>
      <div
        ref={frame}
        class="stack__frame"
        style={{ height: `${height}px`, transition: animate ? undefined : 'none' }}
        onDragStart={(e) => e.preventDefault()}
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={cancel}
      >
        <div ref={summary} class="stack__summary" aria-hidden={open || sel >= 0} data-on={!open && sel < 0}>
          <span class="stack__sumlabel">{S.home.allLeft(props.periodEnd)}</span>
          <span class="stack__total">
            <Amount c={total} />
          </span>
          {segs.length > 0 && (
            <>
              <span class="stack__bar">
                {segs.map((s) => (
                  <span key={s.id} style={{ width: `${(left(s) / total) * 100}%`, '--seg': props.colors[s.id] }} />
                ))}
              </span>
              <span class="stack__legend">
                {segs.slice(0, LEGEND).map((s) => (
                  <span key={s.id}>
                    <i style={{ '--seg': props.colors[s.id] }} />
                    <span class="stack__name">{s.face?.cardName ?? s.name}</span>
                    <span class="num">{money(Math.round(left(s) / 100) * 100).replace(/\.00$/, '')}</span>
                  </span>
                ))}
              </span>
            </>
          )}
        </div>

        <button type="button" class="stack__allrow" data-allrow tabIndex={open ? 0 : -1} aria-hidden={!open} data-on={open} onClick={() => choose(0)}>
          <span>{S.home.allAccounts}</span>
          {sel < 0 && <span class="stack__check" aria-hidden="true">✓</span>}
        </button>

        {cards.map((a, i) => {
          let y: number;
          let x = 0;
          let rot = 0;
          let depth = 0;
          let z: number;
          let hidden = false;
          if (open) {
            y = ALL_ROW + i * ROW + pullUp * 0.4 * i;
            z = i + 1;
          } else if (sel < 0) {
            // resting behind the summary: the first card furthest back, the last in front
            const d = n - 1 - i;
            depth = Math.min(d, DEPTH - 1);
            hidden = d >= DEPTH;
            y = cardsTop + (DEPTH - 1 - depth) * PEEK - (DEPTH - Math.min(n, DEPTH)) * PEEK + pull * (0.5 + (DEPTH - 1 - depth) * 0.45);
            z = i + 1;
          } else {
            const k = (i - sel + n) % n;
            depth = Math.min(k, DEPTH - 1);
            hidden = k >= DEPTH;
            y = (DEPTH - 1) * PEEK - depth * PEEK + pull * (k === 0 ? 0.9 : Math.max(0.2, 0.9 - k * 0.35));
            z = n - k;
            if (k === 0) {
              x = drag.x;
              rot = drag.x / 26;
            }
          }
          const sc = 1 - depth * 0.05;
          return (
            <div
              key={a.id}
              data-card={i}
              class={`stack__card${animate ? ' stack__card--animate' : ''}`}
              aria-hidden={!open && i !== sel}
              role={open ? 'button' : undefined}
              tabIndex={open ? 0 : undefined}
              aria-label={open ? S.home.showCard(a.face?.cardName ?? a.name) : undefined}
              onKeyDown={open ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), choose(i + 1)) : undefined}
              style={{
                transform: `translate3d(${x}px, ${y}px, ${-depth * 40}px) rotateX(${depth * 7}deg) rotate(${rot}deg) scale(${sc})`,
                zIndex: String(z),
                opacity: hidden ? '0' : '1',
                filter: depth ? `saturate(${1 - depth * 0.15})` : undefined,
                '--shade': String(depth * 0.12),
              }}
            >
              <CardFace account={a} catalog={props.catalog} />
              <span class="stack__peek" data-on={open}>
                {S.home.cardToday(money(props.perCard[a.id]?.safeTodayCents ?? 0))}
              </span>
            </div>
          );
        })}
      </div>
      <button type="button" class="stack__hint" onClick={() => (haptic(6), props.onOpen(!open))}>
        <span class="stack__grabber" aria-hidden="true" />
        <span>{open ? S.home.stackHint.open : sel < 0 ? S.home.stackHint.all : n > 1 ? S.home.stackHint.card : S.home.stackHint.cardOnly}</span>
      </button>
    </div>
  );
}
