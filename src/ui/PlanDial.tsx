// The Plan dial and its tick ruler.
//
// Dial: the period's income as a ring of 100 ticks, 1% each, every category and goal
// filling its share in its own colour; empty ticks are money not yet planned. Tap a
// colour to pick it. Pulled open (p → 1) the ring shrinks to the middle and each colour
// moves to the left and every colour gets a floating label in a column beside it (in the
// ring's clockwise order), joined to its colour by a leader line, with its share.
// Ruler: a strip of 1% ticks scrubbed sideways (like a camera zoom wheel) to set the
// selected slice's share, with a light haptic on each tick.

import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { TICKS } from '../domain/allocation';
import { haptic } from './motion';

export interface DialSlice {
  key: string;
  ticks: number;
  color: string;
  name: string;
  detail: string; // e.g. "25% · $420"
}

const VB = 260; // viewBox size
const C = VB / 2;
const R_IN = 98;
const R_OUT = 116;
const R_OUT_ON = 124; // the selected slice's ticks reach further out
const OPEN_RING = 128; // ring size in px when pulled open
const LABEL_H = 44; // vertical room per floating label
const LABEL_GAP = 22; // between the ring and the label column

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const angleOf = (tick: number) => (tick / TICKS) * Math.PI * 2 - Math.PI / 2;

export function PlanDial(props: { slices: DialSlice[]; selected?: string; p: number; onSelect: (key?: string) => void; children: preact.ComponentChildren }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(300);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Tick i belongs to whichever slice covers it, in order, from 12 o'clock clockwise.
  const owner: (DialSlice | undefined)[] = [];
  const firstTick = new Map<string, number>();
  for (const s of props.slices) {
    if (s.ticks > 0) firstTick.set(s.key, owner.length);
    for (let i = 0; i < s.ticks && owner.length < TICKS; i++) owner.push(s);
  }

  // Floating labels, in the ring's clockwise order down a column to its right. Each
  // leader starts at its colour: the outer edge on the ring's right side, the inner edge
  // (across the empty middle) on the left, so no line runs over other colours.
  const shown = props.slices.filter((s) => s.ticks > 0);
  const p = Math.max(0, Math.min(1, props.p));
  const closedRing = Math.min(width, VB);
  const ring = lerp(closedRing, OPEN_RING, p);
  const height = lerp(closedRing, Math.max(OPEN_RING, shown.length * LABEL_H) + 8, p);
  const cx = lerp(width / 2, OPEN_RING / 2 + 4, p);
  const cy = height / 2;
  const scale = ring / VB;
  const edge = cx + ring / 2 + LABEL_GAP;
  const labels = shown.map((s, i) => {
    const a = angleOf(firstTick.get(s.key)! + s.ticks / 2);
    const r = (Math.cos(a) >= 0 ? R_OUT + 3 : R_IN - 4) * scale;
    return { s, y: cy - (shown.length * LABEL_H) / 2 + LABEL_H * (i + 0.5), from: { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r } };
  });
  const labelW = Math.max(80, width - edge);

  const pick = (e: MouseEvent) => {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * VB - C;
    const y = ((e.clientY - r.top) / r.height) * VB - C;
    const d = Math.hypot(x, y);
    if (d < R_IN - 16) return props.onSelect(undefined); // the middle clears the selection
    if (d > R_OUT_ON + 14) return;
    const a = (Math.atan2(y, x) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
    const s = owner[Math.floor((a / (Math.PI * 2)) * TICKS) % TICKS];
    haptic(5);
    props.onSelect(s && s.key !== props.selected ? s.key : undefined);
  };

  return (
    <div ref={box} class="plan-dial" style={{ height: `${height}px` }}>
      {/* leaders first, so the ring's ticks sit on top of any line that crosses them */}
      {p > 0 && (
        <svg class="plan-dial__leaders" width={width} height={height} style={{ opacity: String(p) }} aria-hidden="true">
          {labels.map((l) => (
            <polyline
              key={l.s.key}
              points={`${l.from.x},${l.from.y} ${edge - 10},${l.y} ${edge},${l.y}`}
              style={{ stroke: l.s.color }}
              class={props.selected && props.selected !== l.s.key ? 'dim' : ''}
            />
          ))}
        </svg>
      )}
      <svg
        class="plan-dial__ring"
        viewBox={`0 0 ${VB} ${VB}`}
        style={{ width: `${ring}px`, height: `${ring}px`, left: `${cx - ring / 2}px`, top: `${cy - ring / 2}px` }}
        onClick={pick}
        role="img"
      >
        {Array.from({ length: TICKS }, (_, i) => {
          const s = owner[i];
          const on = !!s && s.key === props.selected;
          const dim = !!props.selected && !on;
          const a = angleOf(i);
          const r2 = on ? R_OUT_ON : R_OUT;
          return (
            <line
              key={i}
              class={`plan-dial__tick${s ? '' : ' plan-dial__tick--empty'}${on ? ' on' : ''}${dim ? ' dim' : ''}`}
              x1={C + Math.cos(a) * R_IN}
              y1={C + Math.sin(a) * R_IN}
              x2={C + Math.cos(a) * r2}
              y2={C + Math.sin(a) * r2}
              style={s ? { stroke: s.color } : undefined}
            />
          );
        })}
      </svg>
      <div class="plan-dial__center" style={{ width: `${ring * 0.56}px`, height: `${ring * 0.56}px`, left: `${cx}px`, top: `${cy}px`, opacity: String(1 - p) }}>
        {props.children}
      </div>
      {p > 0 &&
        labels.map((l) => (
          <button
            type="button"
            key={l.s.key}
            class={`plan-callout${props.selected === l.s.key ? ' on' : ''}${props.selected && props.selected !== l.s.key ? ' dim' : ''}`}
            style={{ top: `${l.y}px`, left: `${edge}px`, width: `${labelW}px`, opacity: String(p), '--c': l.s.color }}
            onClick={() => props.onSelect(props.selected === l.s.key ? undefined : l.s.key)}
          >
            <strong>{l.s.name}</strong>
            <small>{l.s.detail}</small>
          </button>
        ))}
    </div>
  );
}

const STEP_PX = 12; // distance between 1% ticks on the ruler

export function TickRuler(props: { value: number; max: number; onChange: (v: number) => void; onCommit: (v: number) => void; label: string }) {
  const drag = useRef<{ x: number; start: number; id: number; last: number } | null>(null);
  const set = (v: number) => {
    const next = Math.max(0, Math.min(props.max, Math.round(v)));
    if (next !== drag.current?.last) {
      if (drag.current) drag.current.last = next;
      haptic(4);
      props.onChange(next);
    }
    return next;
  };
  const nudge = (d: number) => {
    const next = Math.max(0, Math.min(props.max, props.value + d));
    if (next === props.value) return;
    haptic(4);
    props.onChange(next);
    props.onCommit(next);
  };
  return (
    <div class="tick-ruler">
      <button type="button" class="tick-ruler__step" aria-label={`${props.label} −1%`} onClick={() => nudge(-1)} disabled={props.value <= 0}>
        −
      </button>
      <div
        class="tick-ruler__track"
        role="slider"
        tabIndex={0}
        aria-label={props.label}
        aria-valuemin={0}
        aria-valuemax={props.max}
        aria-valuenow={props.value}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') (e.preventDefault(), nudge(1));
          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') (e.preventDefault(), nudge(-1));
        }}
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, start: props.value, id: e.pointerId, last: props.value };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || d.id !== e.pointerId) return;
          // Dragging left brings higher numbers to the centre, like turning a wheel.
          set(d.start + (d.x - e.clientX) / STEP_PX);
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (d && d.id === e.pointerId && d.last !== d.start) props.onCommit(d.last);
        }}
        onPointerCancel={() => (drag.current = null)}
      >
        <div class="tick-ruler__strip" style={{ transform: `translateX(${-props.value * STEP_PX}px)` }}>
          {Array.from({ length: TICKS + 1 }, (_, i) => (
            <span key={i} class={`tick-ruler__tick${i % 10 === 0 ? ' major' : i % 5 === 0 ? ' mid' : ''}${i > props.max ? ' off' : ''}`} style={{ left: `${i * STEP_PX}px` }}>
              {i % 10 === 0 && <b>{i}</b>}
            </span>
          ))}
        </div>
        <span class="tick-ruler__marker" />
      </div>
      <button type="button" class="tick-ruler__step" aria-label={`${props.label} +1%`} onClick={() => nudge(1)} disabled={props.value >= props.max}>
        +
      </button>
    </div>
  );
}
