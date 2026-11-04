// A vertical card roll, like a rolodex: one card in front, the next ones peeking out
// below it and the previous ones above, each a little smaller and darker. Swipe up or
// down to cycle (it wraps); the front card follows the finger and the next one comes
// forward. Tap a peeking card to bring it to the front. On a computer: the wheel or
// trackpad, and ↑ ↓.
//
// One number drives it: pos, the (fractional) slide at the front. Each slide sits at its
// signed distance d from pos, round the ring, and its transform (and stacking) comes from
// d alone. pos is moved by a spring, frame by frame, so a card's place in the stack
// changes exactly as it moves: cards pass behind each other, never through. A card
// leaving one end of the ring goes round behind the front card to the other end.

import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { haptic, reducedMotion } from './motion';

const PEEK = 11; // px of each card showing behind the one in front
const SHRINK = 0.07; // scale lost per step back
// Two cards passing at the front swap layers halfway, so at that moment they mustn't
// overlap or one shows through the other. The one on the upper side rotates up and over
// the top of the stack, tipping back until it's almost edge-on, so it needs to rise
// only a little to be clear of the other, and comes down in its new place. The lower
// card dips a touch to make room. (All as shares of the card's height, at the halfway
// point. 0.35 is the least that stays clear; this keeps a few px spare.) The cards
// behind only swap layers while the lower card of the pair covers them.
const OVER = 0.4; // how far the upper card rises
const TILT = 84; // deg it leans back
const NARROW = 0.15; // how much smaller it gets
const DIP = 0.08; // how far the lower card drops
const SHOWN = 2; // cards drawn on each side of the front one
const STEP = 80; // px of drag per slide
const AXIS = 8; // px before a drag picks a direction
const STIFF = 210; // the spring that settles pos on a card (per s²)
const DAMP = 27; // its damping (per s): just short of critical, a whisper of overshoot

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
  // pos may run past 0…n; slides are taken mod n. It lives in refs and is drawn straight
  // to the cards' styles each frame; only the front card's index goes through state.
  const pos = useRef(props.initial ?? 0);
  const target = useRef(pos.current);
  const vel = useRef(0); // slides per second
  const raf = useRef(0);
  const cardEls = useRef<(HTMLDivElement | null)[]>([]);
  const g = useRef<{ x: number; y: number; id: number; axis: 'x' | 'y' | null; start: number; t: number; lastY: number; lastT: number; v: number } | null>(null);
  const wheel = useRef({ acc: 0, timer: 0 });
  const [front, setFront] = useState((((Math.round(pos.current) % n) + n) % n) || 0);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The page below the roll follows the front card, and re-rendering it costs frames, so
  // it's told only once the roll has all but settled (see draw), never mid-swing.
  useEffect(() => props.onChange(front), [front]);
  const passed = useRef(Math.round(pos.current)); // for the haptic as each card passes the front

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

  const h = w / 1.586;
  const height = h + 2 * (SHOWN * PEEK + (h * SHRINK * SHOWN) / 2) + 8;

  // Draw every card for the current pos.
  const draw = () => {
    const p = pos.current;
    const half = n / 2;
    for (let i = 0; i < n; i++) {
      const el = cardEls.current[i];
      if (!el) continue;
      const d = ringDist(i, p, n);
      const a = Math.abs(d);
      // Two cards: the other one always peeks above, and the two swap through the middle.
      // More: past the ring's halfway point a card folds in behind the front one, so it
      // goes round from one end to the other out of sight rather than jumping.
      const side = n === 2 ? -1 : Math.sign(d);
      const fold = n > 2 ? Math.min(1, Math.max(0, (a - (half - 0.5)) / 0.5)) : 0;
      const k = Math.min(a, SHOWN + 0.6);
      const s = 1 - SHRINK * k;
      // the swing over the top: only the upper card of the pair passing the front
      // (sin², so it eases out of the stack and back in rather than leaping away)
      const swing = d < 0 && a < 1 ? Math.sin(Math.PI * a) ** 2 : 0;
      const dip = d > 0 && a < 1 && n > 1 ? Math.sin(Math.PI * a) ** 2 : 0;
      const y = side * (1 - fold) * ((h * (1 - s)) / 2 + PEEK * k) - swing * OVER * h + dip * DIP * h;
      el.style.transform =
        `perspective(900px) translate3d(0, ${y.toFixed(2)}px, 0) rotateX(${(swing * TILT).toFixed(2)}deg) scale(${(s * (1 - swing * NARROW)).toFixed(4)})`;
      el.style.zIndex = String(1000 - Math.round(a * 100));
      el.style.opacity = String(Math.min(1, Math.max(0, (SHOWN + 0.9 - a) / 0.6)));
      el.style.setProperty('--shade', String(Math.min(a, SHOWN) * 0.1));
    }
    const r = Math.round(p);
    if (r !== passed.current) (passed.current = r), haptic(5);
    if (!g.current?.axis && Math.abs(p - target.current) < 0.12) {
      const f = (((Math.round(target.current) % n) + n) % n) || 0;
      setFront((old) => (old === f ? old : f));
    }
  };
  useLayoutEffect(draw);

  // The spring: pos toward target, carrying whatever speed a flick left it with.
  const run = () => {
    cancelAnimationFrame(raf.current);
    if (reducedMotion()) {
      pos.current = target.current;
      vel.current = 0;
      return draw();
    }
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.032, (now - last) / 1000);
      last = now;
      const x = pos.current - target.current;
      vel.current += (-STIFF * x - DAMP * vel.current) * dt;
      pos.current += vel.current * dt;
      if (Math.abs(pos.current - target.current) < 0.0005 && Math.abs(vel.current) < 0.005) {
        pos.current = target.current;
        vel.current = 0;
        return draw();
      }
      draw();
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const goTo = (p: number) => {
    target.current = Math.round(p);
    run();
  };
  const by = (k: number) => goTo(Math.round(target.current) + k);

  // Shared by touch (finger) and pointer (mouse) input.
  const start = (x: number, y: number, id: number) => {
    // catching a moving roll stops it where it is
    cancelAnimationFrame(raf.current);
    vel.current = 0;
    const t = performance.now();
    g.current = { x, y, id, axis: null, start: pos.current, t, lastY: y, lastT: t, v: 0 };
  };
  const move = (x: number, y: number, id: number) => {
    const s = g.current;
    if (!s || s.id !== id) return;
    const dy = y - s.y;
    if (!s.axis) {
      if (Math.abs(x - s.x) < AXIS && Math.abs(dy) < AXIS) return;
      s.axis = Math.abs(dy) >= Math.abs(x - s.x) ? 'y' : 'x';
    }
    if (s.axis !== 'y') return;
    // finger speed, smoothed, in slides per second (swipe up → the next card comes forward)
    const now = performance.now();
    const dt = now - s.lastT;
    if (dt > 0) s.v = s.v * 0.4 + (-(y - s.lastY) / STEP / (dt / 1000)) * 0.6;
    s.lastY = y;
    s.lastT = now;
    pos.current = s.start - dy / STEP;
    draw();
  };
  const end = (id: number, y: number) => {
    const s = g.current;
    g.current = null;
    if (!s || s.id !== id) return;
    if (!s.axis) {
      if (pos.current !== target.current) return goTo(target.current); // caught mid-spin: settle
      // A tap on a peek brings that card forward. Judged by where the tap lands against
      // the front card's edges, not by its target: touch adjustment (iOS, Chrome) snaps a
      // finger near the front card onto it, so thin peeks would never be hit.
      const r = box.current?.getBoundingClientRect();
      if (!r) return;
      const mid = r.top + r.height / 2;
      const past = s.y < mid - h / 2 ? s.y - (mid - h / 2) : s.y > mid + h / 2 ? s.y - (mid + h / 2) : 0;
      if (past) goTo(Math.round(pos.current) + Math.sign(past) * Math.min(SHOWN, 1 + Math.floor(Math.abs(past) / (PEEK + 6))));
      return;
    }
    if (s.axis !== 'y') return goTo(pos.current);
    // a quick flick moves one card even if it didn't travel far
    const dy = y - s.y;
    const fast = Math.abs(dy) / Math.max(1, performance.now() - s.t) > 0.45;
    const travelled = s.start - dy / STEP;
    const stale = performance.now() - s.lastT > 80; // the finger stopped before lifting
    vel.current = stale ? 0 : Math.max(-8, Math.min(8, s.v));
    const startRound = Math.round(s.start);
    // otherwise it settles where it was heading, a little past where it was let go
    goTo(fast && Math.abs(travelled - s.start) < 0.5 ? startRound + (dy < 0 ? 1 : -1) : travelled + vel.current * 0.08);
  };

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
      onTouchCancel={() => ((g.current = null), goTo(pos.current))}
      onPointerDown={(e) => e.pointerType === 'mouse' && e.button === 0 && start(e.clientX, e.clientY, e.pointerId)}
      onPointerMove={(e) => e.pointerType === 'mouse' && move(e.clientX, e.clientY, e.pointerId)}
      onPointerUp={(e) => e.pointerType === 'mouse' && end(e.pointerId, e.clientY)}
    >
      {Array.from({ length: n }, (_, i) => {
        // Behind the front card each one sits a peek further out, plus what its shrinking
        // takes off its edge; passing the front it swings out a little and back. (draw()
        // sets the transform, stacking and shade; render leaves them alone.)
        const isFront = i === front;
        return (
          <div
            key={i}
            ref={(el) => {
              cardEls.current[i] = el;
            }}
            data-slide={i}
            class={`roll__card${isFront ? ' is-front' : ''}`}
            aria-hidden={!isFront}
            style={{ top: `${(height - h) / 2}px` }}
          >
            {props.renderSlide(i, isFront)}
          </div>
        );
      })}
    </div>
  );
}
