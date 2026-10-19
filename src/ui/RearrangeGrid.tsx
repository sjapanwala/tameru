// "Jiggle mode" for cards, like rearranging apps on iOS: every card shown small in a
// two-column grid, gently wiggling. Drag one and the others slide out of its way.

import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { CatalogCard } from '../domain/cardCatalog';
import type { Account } from '../domain/types';
import { CardFace } from './cards';
import { haptic } from './motion';

const GAP = 14;
const LABEL_H = 24;

export function RearrangeGrid(props: { accounts: Account[]; catalog: CatalogCard[]; onDone: (ids: string[]) => void; hint: string; doneLabel: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  const [order, setOrder] = useState(() => props.accounts.map((a) => a.id));
  const [drag, setDrag] = useState<{ id: string; sx: number; sy: number; x: number; y: number; ox: number; oy: number } | null>(null);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth || 320);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const colW = (width - GAP) / 2;
  const rowH = colW / 1.586 + LABEL_H + GAP;
  const pos = (k: number) => ({ x: (k % 2) * (colW + GAP), y: Math.floor(k / 2) * rowH });
  const nearest = (x: number, y: number) => {
    let best = 0;
    let dist = Infinity;
    order.forEach((_, k) => {
      const p = pos(k);
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < dist) {
        dist = d;
        best = k;
      }
    });
    return best;
  };
  const byId = new Map(props.accounts.map((a) => [a.id, a]));

  return (
    <div class="rearrange">
      <div class="rearrange__bar">
        <p class="muted">{props.hint}</p>
        <button type="button" class="primary" onClick={() => props.onDone(order)}>
          {props.doneLabel}
        </button>
      </div>
      <div ref={box} class="rearrange__grid" style={{ height: `${Math.ceil(order.length / 2) * rowH}px` }}>
        {order.map((id, k) => {
          const a = byId.get(id);
          if (!a) return null;
          const dragging = drag?.id === id;
          const p = dragging ? { x: drag!.x, y: drag!.y } : pos(k);
          return (
            <div
              key={id}
              class={`rearrange__item${dragging ? ' rearrange__item--dragging' : ''}`}
              style={{ width: `${colW}px`, transform: `translate(${p.x}px, ${p.y}px)${dragging ? ' scale(1.08)' : ''}` }}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                haptic(10);
                const o = pos(k);
                setDrag({ id, sx: e.clientX, sy: e.clientY, x: o.x, y: o.y, ox: o.x, oy: o.y });
              }}
              onPointerMove={(e) => {
                if (!drag || drag.id !== id) return;
                const x = drag.ox + e.clientX - drag.sx;
                const y = drag.oy + e.clientY - drag.sy;
                setDrag({ ...drag, x, y });
                const to = nearest(x, y);
                if (to !== k) {
                  haptic(4);
                  const next = order.filter((o) => o !== id);
                  next.splice(to, 0, id);
                  setOrder(next);
                }
              }}
              onPointerUp={() => setDrag(null)}
              onPointerCancel={() => setDrag(null)}
            >
              <div class={`rearrange__wiggle${k % 2 ? ' rearrange__wiggle--alt' : ''}`}>
                <CardFace account={a} catalog={props.catalog} />
              </div>
              <span class="rearrange__label">{a.name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
