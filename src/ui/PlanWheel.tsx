// Plan's tick wheel: the period's income as 100 ticks round a circle, 1% each, every
// category and goal filling its share in its own colour from 12 o'clock clockwise;
// empty ticks are money not planned yet. Tap a colour to pick that slice (the others
// dim), then drag round the wheel to move its end, so it grows or shrinks. Tap the
// middle to let go of it. The middle shows whatever is in `children`.

import { useEffect, useRef } from 'preact/hooks';
import { TICKS } from '../domain/allocation';
import { haptic } from './motion';

export interface WheelSlice {
  key: string;
  ticks: number; // whole ticks this slice covers
  color: string;
}

const CENTRE = 0.645; // a tap closer to the middle than this (of the radius) lets go

export function PlanWheel(props: {
  slices: WheelSlice[];
  selected?: string;
  onSelect: (key: string | undefined) => void;
  /** Dragging round with a slice picked: the tick under the finger (0–99), live. */
  onDrag?: (tick: number) => void;
  onDragEnd?: () => void;
  label: string;
  children: preact.ComponentChildren;
}) {
  const g = useRef<{ id: number; tick: number; moved: boolean; dist: number } | null>(null);
  const el = useRef<HTMLDivElement>(null);
  // iOS scrolls the page under a drag whatever touch-action says, and may skip a listener
  // on the wheel itself: block the page's scroll, from the document, for touches that
  // start on the wheel.
  useEffect(() => {
    let ours = false;
    const onStart = (e: TouchEvent) => {
      ours = !!el.current && e.target instanceof Node && el.current.contains(e.target);
    };
    const onMove = (e: TouchEvent) => {
      if (ours && e.cancelable) e.preventDefault();
    };
    const onEnd = () => (ours = false);
    document.addEventListener('touchstart', onStart, { passive: true, capture: true });
    document.addEventListener('touchmove', onMove, { passive: false, capture: true });
    document.addEventListener('touchend', onEnd, { capture: true });
    return () => {
      document.removeEventListener('touchstart', onStart, { capture: true });
      document.removeEventListener('touchmove', onMove, { capture: true });
      document.removeEventListener('touchend', onEnd, { capture: true });
    };
  }, []);

  // Tick i belongs to whichever slice covers it, in order.
  const owner: (WheelSlice | undefined)[] = [];
  for (const s of props.slices) for (let i = 0; i < s.ticks && owner.length < TICKS; i++) owner.push(s);

  const geo = (e: PointerEvent) => {
    const r = (e.currentTarget as Element).getBoundingClientRect();
    const x = e.clientX - (r.left + r.width / 2);
    const y = e.clientY - (r.top + r.height / 2);
    const deg = ((Math.atan2(x, -y) * 180) / Math.PI + 360) % 360;
    return { tick: Math.min(TICKS - 1, Math.floor(deg / (360 / TICKS))), dist: Math.hypot(x, y) / (r.width / 2) };
  };

  const onDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const { tick, dist } = geo(e);
    g.current = { id: e.pointerId, tick, moved: false, dist };
  };
  const onMove = (e: PointerEvent) => {
    const s = g.current;
    if (!s || s.id !== e.pointerId) return;
    const { tick } = geo(e);
    if (!s.moved && tick === s.tick) return;
    s.moved = true;
    if (!props.selected || !props.onDrag) return;
    if (tick !== s.tick) haptic(4);
    s.tick = tick;
    props.onDrag(tick);
  };
  const onUp = (e: PointerEvent) => {
    const s = g.current;
    g.current = null;
    if (!s || s.id !== e.pointerId) return;
    if (s.moved) return void (props.selected && props.onDragEnd?.());
    if (s.dist < CENTRE) return props.onSelect(undefined);
    const hit = owner[s.tick];
    haptic(6);
    props.onSelect(hit && hit.key !== props.selected ? hit.key : undefined);
  };

  return (
    <div
      ref={el}
      class="wheel"
      role="group"
      aria-label={props.label}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={() => (g.current = null)}
    >
      {Array.from({ length: TICKS }, (_, i) => {
        const s = owner[i];
        const on = !!s && s.key === props.selected;
        return (
          <i
            key={i}
            class={`wheel__tick${on ? ' wheel__tick--on' : ''}${props.selected && !on ? ' wheel__tick--dim' : ''}`}
            style={{ '--a': `${i * (360 / TICKS) + 180 / TICKS}deg`, background: s?.color }}
          />
        );
      })}
      <div class="wheel__centre">{props.children}</div>
    </div>
  );
}
