// A vertical card roll, like a rolodex: one card in front, the next ones peeking out
// below it and the previous ones above, each a little smaller and darker. Swipe up or
// down to cycle (it wraps); the front card follows the finger and the next one comes
// forward. Tap a peeking card to bring it to the front. On a computer: the wheel or
// trackpad, and ↑ ↓.
//
// One number drives it: pos, the (fractional) slide at the front. Each slide sits at its
// signed distance d from pos, round the ring, and its transform comes from d alone.

import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { haptic, reducedMotion } from './motion';

const PEEK = 11; // px of each card showing behind the one in front
const SHRINK = 0.07; // scale lost per step back
const LIFT = 34; // px a card swings out as it passes the front
const SHOWN = 2; // cards drawn on each side of the front one
const STEP = 64; // px of drag per slide
const AXIS = 8; // px before a drag picks a direction

/** Signed distance from `pos` to slide `i` round a ring of `n`, in −n/2…n/2. */
const ringDist = (i: number, pos: number, n: number) => ((((i - pos) % n) + n + n / 2) % n) - n / 2;

export function CardRoll(props: {
  count: number;
  initial?: number;
  label: string;
  onChange: (i: number) => void;
  renderSlide: (i: number, front: boolean) => preact.ComponentChildren;
}) {
  const n = props.count;
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const [pos, setPos] = useState(props.initial ?? 0); // may run past 0…n; slides are taken mod n
  const [dragging, setDragging] = useState(false);
  const g = useRef<{ x: number; y: number; id: number; axis: 'x' | 'y' | null; start: number; t: number } | null>(null);
  const prevD = useRef<number[]>([]);
  const wheel = useRef({ acc: 0, timer: 0 });

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const front = (((Math.round(pos) % n) + n) % n) || 0;
  const first = useRef(true);
  useEffect(() => {
    props.onChange(front);
    if (first.current) first.current = false;
    else haptic(5);
  }, [front]);

  // A touch that starts on the roll is ours: stop the page scrolling under it (iOS
  // ignores touch-action here, so this has to be a document listener).
  useEffect(() => {
    let ours = false;
    const onStart = (e: TouchEvent) => {
      ours = !!box.current && e.target instanceof Node && box.current.contains(e.target);
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

  const goTo = (p: number) => setPos(Math.round(p));
  const by = (k: number) => goTo(Math.round(pos) + k);

  // Shared by touch (finger) and pointer (mouse) input.
  const start = (x: number, y: number, id: number) => {
    g.current = { x, y, id, axis: null, start: pos, t: performance.now() };
  };
  const move = (x: number, y: number, id: number) => {
    const s = g.current;
    if (!s || s.id !== id) return;
    const dy = y - s.y;
    if (!s.axis) {
      if (Math.abs(x - s.x) < AXIS && Math.abs(dy) < AXIS) return;
      s.axis = Math.abs(dy) >= Math.abs(x - s.x) ? 'y' : 'x';
      if (s.axis === 'y') setDragging(true);
    }
    if (s.axis === 'y') setPos(s.start - dy / STEP); // swipe up → the next card comes forward
  };
  const end = (id: number, y: number) => {
    const s = g.current;
    g.current = null;
    if (!s || s.id !== id) return;
    setDragging(false);
    if (!s.axis) {
      // A tap on a peek brings that card forward. Judged by where the tap lands against
      // the front card's edges, not by its target: touch adjustment (iOS, Chrome) snaps a
      // finger near the front card onto it, so thin peeks would never be hit.
      const r = box.current?.getBoundingClientRect();
      if (!r) return;
      const mid = r.top + r.height / 2;
      const past = s.y < mid - h / 2 ? s.y - (mid - h / 2) : s.y > mid + h / 2 ? s.y - (mid + h / 2) : 0;
      if (past) goTo(Math.round(pos) + Math.sign(past) * Math.min(SHOWN, 1 + Math.floor(Math.abs(past) / (PEEK + 6))));
      return;
    }
    if (s.axis !== 'y') return;
    // a quick flick moves one card even if it didn't travel far
    const dy = y - s.y;
    const fast = Math.abs(dy) / Math.max(1, performance.now() - s.t) > 0.45;
    const travelled = s.start - dy / STEP;
    goTo(fast && Math.abs(travelled - s.start) < 0.5 ? s.start + (dy < 0 ? 1 : -1) : travelled);
  };

  const h = w / 1.586;
  const height = h + 2 * (SHOWN * PEEK + (h * SHRINK * SHOWN) / 2) + 8;
  const animate = !dragging && !reducedMotion();

  return (
    <div
      ref={box}
      class="roll"
      style={{ height: `${height}px` }}
      role="region"
      aria-roledescription="carousel"
      aria-label={props.label}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') (e.preventDefault(), by(1));
        if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') (e.preventDefault(), by(-1));
      }}
      onWheel={(e) => {
        // a trackpad or wheel nudge of a slide's worth moves one card, then rests
        e.preventDefault();
        const acc = (wheel.current.acc += e.deltaY);
        if (Math.abs(acc) > 40) {
          wheel.current.acc = 0;
          by(acc > 0 ? 1 : -1);
        }
        window.clearTimeout(wheel.current.timer);
        wheel.current.timer = window.setTimeout(() => (wheel.current.acc = 0), 160);
      }}
      onTouchStart={(e) => {
        const t = e.changedTouches[0];
        if (t && e.touches.length === 1) start(t.clientX, t.clientY, -1 - t.identifier);
      }}
      onTouchMove={(e) => {
        const t = e.changedTouches[0];
        if (t) move(t.clientX, t.clientY, -1 - t.identifier);
      }}
      onTouchEnd={(e) => {
        const t = e.changedTouches[0];
        if (!t) return;
        if (g.current?.axis) e.preventDefault(); // a drag isn't a tap
        end(-1 - t.identifier, t.clientY);
      }}
      onTouchCancel={() => ((g.current = null), setDragging(false), goTo(pos))}
      onPointerDown={(e) => e.pointerType === 'mouse' && e.button === 0 && start(e.clientX, e.clientY, e.pointerId)}
      onPointerMove={(e) => e.pointerType === 'mouse' && move(e.clientX, e.clientY, e.pointerId)}
      onPointerUp={(e) => e.pointerType === 'mouse' && end(e.pointerId, e.clientY)}
    >
      {Array.from({ length: n }, (_, i) => {
        const d = ringDist(i, pos, n);
        const a = Math.abs(d);
        // A card that wrapped round the ring (from the top end to the bottom) jumps
        // without animating, while it's hidden at the back.
        const jumped = prevD.current[i] !== undefined && Math.abs(prevD.current[i]! - d) > n / 2;
        prevD.current[i] = d;
        const k = Math.min(a, SHOWN + 0.6);
        const s = 1 - SHRINK * k;
        // Behind the front card each one sits a peek further out, plus what its shrinking
        // takes off its edge; passing the front it swings out a little and back.
        const y = Math.sign(d) * ((h * (1 - s)) / 2 + PEEK * k + LIFT * Math.sin(Math.PI * Math.min(a, 1)) * 0.5);
        const isFront = i === front;
        return (
          <div
            key={i}
            data-slide={i}
            class={`roll__card${animate && !jumped ? ' roll__card--animate' : ''}${isFront ? ' is-front' : ''}`}
            aria-hidden={!isFront}
            style={{
              top: `${(height - h) / 2}px`,
              transform: `translateY(${y}px) scale(${s})`,
              zIndex: String(100 - Math.round(a * 10)),
              opacity: a > SHOWN + 0.5 ? '0' : '1',
              '--shade': String(Math.min(a, SHOWN) * 0.1),
            }}
          >
            {props.renderSlide(i, isFront)}
          </div>
        );
      })}
    </div>
  );
}
