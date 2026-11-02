// Home's card stack. "All accounts" sits on top, then each card in the user's order.
// Drag the top card sideways to step through them (it wraps); the cards behind fan up
// above it. All accounts shows today's safe-to-spend split by card. Tap the top card to open it on Accounts.

import { useRef, useState } from 'preact/hooks';
import { money, S } from '../copy/strings';
import type { CatalogCard } from '../domain/cardCatalog';
import type { Account, Cents } from '../domain/types';
import type { CardShare } from '../services/home';
import { CardFace } from './cards';
import { Amount } from './components';
import { haptic, reducedMotion } from './motion';
import { go } from './router';

const SWIPE = 70; // px past which a release moves to the next card
const DRAG_START = 6;
const SHOWN = 3; // cards visible in the stack at once
const LEGEND = 3; // cards named under the All accounts bar

export function CardStack(props: {
  cards: Account[];
  colors: Record<string, string>;
  perCard: Record<string, CardShare>;
  totalCents: Cents; // today's safe-to-spend, all cards together
  catalog: CatalogCard[];
  index: number;
  onIndex: (i: number) => void;
}) {
  const { cards, index } = props;
  const n = cards.length + 1;
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const g = useRef<{ x: number; y: number; id: number; on: boolean } | null>(null);

  const step = (by: number) => {
    haptic(6);
    props.onIndex((index + by + n) % n);
  };
  const open = () => go(index === 0 ? '/accounts' : `/accounts?id=${encodeURIComponent(cards[index - 1]!.id)}`);

  const onDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    g.current = { x: e.clientX, y: e.clientY, id: e.pointerId, on: false };
  };
  const onMove = (e: PointerEvent) => {
    const s = g.current;
    if (!s || s.id !== e.pointerId) return;
    const x = e.clientX - s.x;
    const y = e.clientY - s.y;
    if (!s.on) {
      if (Math.abs(y) > 10 && Math.abs(y) > Math.abs(x)) return void (g.current = null); // scrolling
      if (Math.abs(x) < DRAG_START) return;
      s.on = true;
      setDragging(true);
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    }
    setDx(x);
  };
  const onUp = (e: PointerEvent) => {
    const s = g.current;
    g.current = null;
    if (!s || s.id !== e.pointerId) return;
    if (!s.on) return open(); // a tap
    setDragging(false);
    setDx(0);
    if (dx < -SWIPE) step(1);
    else if (dx > SWIPE) step(-1);
  };

  // The bar splits today's safe-to-spend by card; each segment is that card's share.
  const today = (a: Account) => props.perCard[a.id]?.safeTodayCents ?? 0;
  const total = props.totalCents;
  const segs = total > 0 ? cards.filter((a) => today(a) > 0) : [];
  const animate = !dragging && !reducedMotion();

  return (
    <div class="stack">
      <div
        class="stack__frame"
        role="group"
        aria-roledescription="carousel"
        aria-label={index === 0 ? S.home.allAccounts : cards[index - 1]!.name}
        onDragStart={(e) => e.preventDefault()}
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => {
          g.current = null;
          setDragging(false);
          setDx(0);
        }}
      >
        {Array.from({ length: n }, (_, i) => {
          const pos = (i - index + n) % n;
          const top = pos === 0;
          const transform = top ? `translateX(${dx}px) rotate(${dx / 22}deg)` : `translateY(${-pos * 14}px) scale(${1 - pos * 0.06})`;
          const a = i > 0 ? cards[i - 1] : undefined;
          return (
            <div
              key={a?.id ?? 'all'}
              class={`stack__card${animate || !top ? ' stack__card--animate' : ''}`}
              aria-hidden={!top}
              style={{ transform, zIndex: String(n - pos), opacity: pos < SHOWN ? '1' : '0' }}
            >
              {a ? (
                <CardFace account={a} catalog={props.catalog} />
              ) : (
                <div class="cardface allcard">
                  <span class="allcard__top">
                    <span class="allcard__title">{S.home.allAccounts}</span>
                    <span class="allcard__count">{S.home.cardCount(cards.length)}</span>
                  </span>
                  <span class="allcard__total">
                    <span class="allcard__label">{S.home.safeToday}</span>
                    <Amount c={total} />
                  </span>
                  <span class="allcard__split">
                    <span class="allcard__bar">
                      {segs.map((s) => (
                        <span key={s.id} style={{ width: `${(today(s) / total) * 100}%`, '--seg': props.colors[s.id] }} />
                      ))}
                    </span>
                    <span class="allcard__legend">
                      {segs.slice(0, LEGEND).map((s) => (
                        <span key={s.id}>
                          <i style={{ '--seg': props.colors[s.id] }} />
                          <span class="allcard__name">{s.face?.cardName ?? s.name}</span>
                          <span class="num">{money(Math.round(today(s) / 100) * 100).replace(/\.00$/, '')}</span>
                        </span>
                      ))}
                    </span>
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div class="stack__foot">
        <div class="stack__pager">
          {Array.from({ length: n }, (_, i) => (
            <button
              type="button"
              key={i}
              class={i === index ? 'on' : ''}
              aria-label={i === 0 ? S.home.allAccounts : S.home.showCard(cards[i - 1]!.name)}
              aria-current={i === index}
              onClick={() => props.onIndex(i)}
            />
          ))}
        </div>
        <span class="stack__hint">{S.home.swipeCards}</span>
      </div>
    </div>
  );
}
