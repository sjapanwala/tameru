// An amount you set by turning a dial or by typing. Drag round the ring and each tick
// passed adds (clockwise) or takes away (anticlockwise) one `step`; one full turn is
// `perTurn` steps. The figure in the middle is a real field: tap it to type.

import { useEffect, useRef, useState } from 'preact/hooks';
import { centsToDecimal, parseCents } from '../domain/money';
import type { Cents } from '../domain/types';
import { haptic } from './motion';

const TICKS = 60; // marks drawn round the ring

/** "225" for whole dollars, "12.50" otherwise; empty for nothing. */
const show = (c: Cents | undefined) => (!c ? '' : c % 100 === 0 ? String(c / 100) : centsToDecimal(c));

export function AmountDial(props: {
  value: Cents | undefined;
  onChange: (c: Cents | undefined) => void;
  step: Cents; // per tick of the dial
  perTurn?: number; // steps in one full turn
  label: string; // for screen readers, and shown under the figure
  hint?: string;
  max?: Cents;
}) {
  const perTurn = props.perTurn ?? 40;
  const value = props.value ?? 0;
  const ring = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(show(props.value));
  const [typing, setTyping] = useState(false);
  const g = useRef<{ id: number; last: number; acc: number; base: Cents } | null>(null);

  // Keep the field in step with the dial (but not while the user is typing in it).
  useEffect(() => {
    if (!typing) setText(show(props.value));
  }, [props.value, typing]);

  // iOS scrolls the page under a drag whatever touch-action says: block it for touches
  // that start on the ring (not the field, which needs its own taps).
  useEffect(() => {
    let ours = false;
    const onStart = (e: TouchEvent) => {
      ours = !!ring.current && e.target instanceof Node && ring.current.contains(e.target) && e.target !== field.current;
    };
    const onMove = (e: TouchEvent) => ours && e.cancelable && e.preventDefault();
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

  const angleOf = (x: number, y: number) => {
    const r = ring.current!.getBoundingClientRect();
    return Math.atan2(y - (r.top + r.height / 2), x - (r.left + r.width / 2));
  };
  const clamp = (c: Cents) => Math.max(0, props.max !== undefined ? Math.min(props.max, c) : c);

  const onDown = (e: PointerEvent) => {
    if (e.target === field.current || e.button > 0) return;
    field.current?.blur();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    g.current = { id: e.pointerId, last: angleOf(e.clientX, e.clientY), acc: 0, base: value };
  };
  const onMove = (e: PointerEvent) => {
    const s = g.current;
    if (!s || s.id !== e.pointerId) return;
    const a = angleOf(e.clientX, e.clientY);
    let d = a - s.last;
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    s.last = a;
    s.acc += d;
    const steps = Math.trunc(s.acc / ((2 * Math.PI) / perTurn));
    const next = clamp(s.base + steps * props.step);
    if (next !== value) {
      haptic(3);
      props.onChange(next || undefined);
    }
  };
  const onUp = (e: PointerEvent) => {
    if (g.current?.id === e.pointerId) g.current = null;
  };

  // Where the knob sits: how far through the current turn the value is.
  const turn = perTurn * props.step;
  const frac = turn > 0 ? (value % turn) / turn : 0;
  const turns = turn > 0 ? Math.floor(value / turn) : 0;
  const knob = frac * 2 * Math.PI - Math.PI / 2;
  const R = 46;

  return (
    <div class="dial">
      <div
        ref={ring}
        class="dial__ring"
        role="slider"
        aria-label={props.label}
        aria-valuemin={0}
        aria-valuenow={value / 100}
        tabIndex={0}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onKeyDown={(e) => {
          const d = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -1 : 0;
          if (d && e.target !== field.current) (e.preventDefault(), props.onChange(clamp(value + d * props.step) || undefined));
        }}
      >
        <svg viewBox="0 0 100 100" aria-hidden="true">
          {Array.from({ length: TICKS }, (_, i) => {
            const a = (i / TICKS) * 2 * Math.PI - Math.PI / 2;
            const on = i / TICKS < frac || turns > 0;
            const long = i % 5 === 0;
            const r1 = long ? 40.5 : 42;
            return (
              <line
                key={i}
                class={`dial__tick${on ? ' is-on' : ''}${i / TICKS < frac ? ' is-lead' : ''}`}
                x1={50 + Math.cos(a) * r1}
                y1={50 + Math.sin(a) * r1}
                x2={50 + Math.cos(a) * 45}
                y2={50 + Math.sin(a) * 45}
              />
            );
          })}
          <circle class="dial__knob" cx={50 + Math.cos(knob) * R} cy={50 + Math.sin(knob) * R} r={3.6} />
        </svg>
        <div class="dial__centre">
          <label class="dial__figure">
            <span class="dial__cur">$</span>
            <input
              ref={field}
              type="text"
              inputMode="decimal"
              enterKeyHint="done"
              placeholder="0"
              aria-label={props.label}
              value={text}
              onFocus={() => setTyping(true)}
              onBlur={() => setTyping(false)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), (e.target as HTMLInputElement).blur())}
              onInput={(e) => {
                const t = (e.target as HTMLInputElement).value;
                setText(t);
                const c = parseCents(t);
                props.onChange(c === null || c <= 0 ? undefined : clamp(c));
              }}
              style={{ width: `${Math.max(1, text.length || 1) + 0.4}ch` }}
            />
          </label>
          <span class="dial__label">{props.label}</span>
        </div>
      </div>
      {props.hint && <p class="dial__hint">{props.hint}</p>}
    </div>
  );
}
