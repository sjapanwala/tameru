// Small motion helpers. Everything respects prefers-reduced-motion.

import { useEffect, useState } from 'preact/hooks';

export const reducedMotion = (): boolean => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// Quintic ease-out: moves quickly, then settles slowly — a glide, not a snap.
const glide = (t: number) => (t >= 1 ? 1 : 1 - (1 - t) ** 5);

// Last shown value per key, so returning to a screen doesn't re-roll from zero.
const lastShown = new Map<string, number>();

/** Glides a number from what was last shown to the new value (integers stay integers). */
export function useTween(target: number, key: string, ms = 1100): number {
  const start = lastShown.get(key) ?? 0;
  const [value, setValue] = useState(reducedMotion() ? target : start);
  useEffect(() => {
    const from = lastShown.get(key) ?? 0;
    if (reducedMotion() || from === target) {
      lastShown.set(key, target);
      return setValue(target);
    }
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = glide((now - t0) / ms);
      const v = Math.round(from + (target - from) * t);
      setValue(v);
      lastShown.set(key, v);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return value;
}

/** A light tap on devices that support it (Android); silently does nothing elsewhere. */
export function haptic(ms = 8): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* unsupported */
  }
}
