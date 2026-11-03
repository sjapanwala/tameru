// One category (or goal) on Plan: its colour, name and amount over a strip of 40 ticks.
// Drag sideways anywhere on it to change the amount in $5 steps; the strip spans a fixed
// scale, so each tick is a set amount ($25 at the usual scale). Planned ticks are in the
// category's colour, already-spent ones faded, the rest grey. Tap to open its options.

import { useRef, useState } from 'preact/hooks';
import { money } from '../copy/strings';
import type { Cents } from '../domain/types';
import { haptic } from './motion';

export const ROW_TICKS = 40;
const STEP = 500; // $5
const AXIS = 6; // px before a press picks a direction

/** The dollar span of a row's strip: $1,000, or larger steps if a row needs more room. */
export function rowScale(largest: Cents): Cents {
  for (const s of [100000, 200000, 400000, 1000000]) if (largest <= s * 0.9) return s;
  return Math.ceil(largest / 1000000) * 1000000;
}

export function PlanRow(props: {
  name: string;
  color: string;
  cents: Cents;
  spentCents: Cents; // shown as faded ticks; 0 for goals
  pct: string; // e.g. "21%"
  sub: string;
  scale: Cents;
  max: Cents; // the most it can take (what's left of income, plus its own)
  selected: boolean;
  open: boolean;
  readOnly?: boolean;
  onChange: (cents: Cents) => void; // live, while dragging
  onCommit: (cents: Cents) => void; // on release
  onTap: () => void;
  children?: preact.ComponentChildren; // the options shown when open
}) {
  const g = useRef<{ x: number; y: number; id: number; w: number; start: Cents; axis: 'x' | 'y' | null; last: Cents } | null>(null);
  const [active, setActive] = useState(false);
  const per = props.scale / ROW_TICKS;
  const planned = Math.min(ROW_TICKS, Math.round(props.cents / per));
  const used = Math.max(0, Math.min(planned, Math.round(Math.max(0, props.spentCents) / per)));
  const [whole, cents] = money(props.cents).split('.');

  const onDown = (e: PointerEvent) => {
    if (props.readOnly || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const r = (e.currentTarget as Element).getBoundingClientRect();
    g.current = { x: e.clientX, y: e.clientY, id: e.pointerId, w: r.width, start: props.cents, axis: null, last: props.cents };
  };
  const onMove = (e: PointerEvent) => {
    const s = g.current;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (!s.axis) {
      if (Math.abs(dx) < AXIS && Math.abs(dy) < AXIS) return;
      s.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (s.axis === 'y') return void (g.current = null); // scrolling the page
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      setActive(true);
    }
    const next = Math.max(0, Math.min(props.max, Math.round((s.start + (dx / s.w) * props.scale) / STEP) * STEP));
    if (next !== s.last) {
      if (Math.floor(next / per) !== Math.floor(s.last / per)) haptic(4);
      s.last = next;
      props.onChange(next);
    }
  };
  const onUp = (e: PointerEvent) => {
    const s = g.current;
    g.current = null;
    setActive(false);
    if (!s || s.id !== e.pointerId) return;
    if (!s.axis) return props.onTap();
    if (s.last !== s.start) props.onCommit(s.last);
  };

  return (
    <div
      class={`prow${active ? ' prow--active' : ''}${props.open ? ' prow--open' : ''}`}
      style={{ '--c': props.color, boxShadow: props.selected ? `inset 0 0 0 1.5px ${props.color}` : undefined }}
    >
      <div
        class="prow__face"
        role={props.readOnly ? undefined : 'slider'}
        tabIndex={props.readOnly ? undefined : 0}
        aria-label={props.name}
        aria-valuemin={0}
        aria-valuemax={props.max}
        aria-valuenow={props.cents}
        aria-valuetext={money(props.cents)}
        aria-expanded={props.readOnly ? undefined : props.open}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => ((g.current = null), setActive(false))}
        onKeyDown={(e) => {
          if (props.readOnly) return;
          const by = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? STEP : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -STEP : 0;
          if (by) {
            e.preventDefault();
            props.onCommit(Math.max(0, Math.min(props.max, props.cents + by)));
          } else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            props.onTap();
          }
        }}
      >
        <div class="prow__top">
          <i class="prow__dot" />
          <span class="prow__name">{props.name}</span>
          <span class="prow__amt">
            {whole}
            <small>.{cents}</small>
          </span>
        </div>
        <div class="prow__ticks" aria-hidden="true">
          {Array.from({ length: ROW_TICKS }, (_, j) => (
            <i key={j} class={[j < planned && 'on', j < used && 'used', j === planned - 1 && 'edge'].filter(Boolean).join(' ')} />
          ))}
        </div>
        <div class="prow__foot">
          <span>{props.sub}</span>
          <span>{props.pct}</span>
        </div>
      </div>
      {props.children && (
        <div class="prow__more" data-on={props.open} inert={!props.open}>
          <div>{props.children}</div>
        </div>
      )}
    </div>
  );
}
