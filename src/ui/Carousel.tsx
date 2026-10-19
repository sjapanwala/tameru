// Horizontal snap carousel: one slide centred, neighbours peeking. Swipe on touch,
// trackpad on desktop, plus arrow buttons, ← → keys, and tapping a side slide.

import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { haptic, reducedMotion } from './motion';

export function Carousel(props: {
  count: number;
  renderSlide: (i: number, active: boolean) => preact.ComponentChildren;
  onChange: (i: number) => void;
  label: string;
  prevLabel: string;
  nextLabel: string;
  initial?: number; // slide to centre when first shown (e.g. a card tapped on Home)
}) {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(props.initial ?? 0);

  // Jump (no animation) to the starting slide before the first measure.
  useLayoutEffect(() => {
    const t = track.current;
    const el = t?.children[props.initial ?? 0] as HTMLElement | undefined;
    if (t && el && props.initial) t.scrollLeft = el.offsetLeft + el.offsetWidth / 2 - t.clientWidth / 2;
  }, []);

  const first = useRef(true);
  useEffect(() => {
    props.onChange(active);
    if (first.current) first.current = false;
    else haptic(4); // a small tick as each card settles in
  }, [active]);

  const slideAt = (i: number) => track.current?.children[i] as HTMLElement | undefined;
  const goTo = (i: number) => {
    const el = slideAt(Math.max(0, Math.min(props.count - 1, i)));
    el?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', inline: 'center', block: 'nearest' });
  };

  // Every frame while scrolling, each slide gets --p: its signed distance from centre in
  // slide widths (−1…1). CSS turns that into scale, tilt, fade and sheen, so cards move
  // continuously with the finger. The closest slide is the active one.
  useEffect(() => {
    const t = track.current;
    if (!t) return;
    let raf = 0;
    const measure = () => {
      raf = 0;
      const mid = t.scrollLeft + t.clientWidth / 2;
      let best = 0;
      let dist = Infinity;
      Array.from(t.children).forEach((c, i) => {
        const el = c as HTMLElement;
        const offset = el.offsetLeft + el.offsetWidth / 2 - mid;
        const p = Math.max(-1, Math.min(1, offset / (el.offsetWidth || 1)));
        el.style.setProperty('--p', p.toFixed(4));
        el.style.setProperty('--a', Math.abs(p).toFixed(4));
        if (Math.abs(offset) < dist) {
          dist = Math.abs(offset);
          best = i;
        }
      });
      setActive(best);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    measure();
    t.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      t.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      cancelAnimationFrame(raf);
    };
  }, [props.count]);

  return (
    <div
      class="carousel"
      role="region"
      aria-roledescription="carousel"
      aria-label={props.label}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') goTo(active + 1);
        if (e.key === 'ArrowLeft') goTo(active - 1);
      }}
    >
      <div class="carousel__track" ref={track}>
        {Array.from({ length: props.count }, (_, i) => (
          <div
            key={i}
            class={`carousel__slide${i === active ? ' is-active' : ''}`}
            aria-current={i === active || undefined}
            onClick={() => i !== active && goTo(i)}
          >
            {props.renderSlide(i, i === active)}
          </div>
        ))}
      </div>
      <button type="button" class="carousel__arrow carousel__arrow--prev" aria-label={props.prevLabel} disabled={active === 0} onClick={() => goTo(active - 1)}>
        ‹
      </button>
      <button type="button" class="carousel__arrow carousel__arrow--next" aria-label={props.nextLabel} disabled={active === props.count - 1} onClick={() => goTo(active + 1)}>
        ›
      </button>
      <div class="carousel__dots" aria-hidden="true">
        {Array.from({ length: props.count }, (_, i) => (
          <span key={i} class={i === active ? 'on' : ''} />
        ))}
      </div>
    </div>
  );
}
