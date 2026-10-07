import { useEffect, useState, useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

export const prefersReducedMotion = () => window.matchMedia(QUERY).matches;

export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(QUERY);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    prefersReducedMotion,
  );
}

// Brand palette (see tokens.css): Shu, green, ochre, bone.
const CONFETTI_COLORS = ['#A5482C', '#1F6B4F', '#C79A2B', '#ECE5D7'];

export type Celebration = 'account' | 'payday' | 'reveal';

/**
 * Confetti for the three moments that earn it. Each run is under two
 * seconds. With reduced motion nothing is loaded or drawn: those screens
 * rely on their plain fade instead.
 */
export async function celebrate(kind: Celebration, from?: Element | null): Promise<void> {
  if (prefersReducedMotion()) return;
  // Bundled and lazy: fetched from our own origin (and the offline cache) on first use.
  const { default: confetti } = await import('canvas-confetti');
  const rect = from?.getBoundingClientRect();
  const origin = rect
    ? {
        x: (rect.left + rect.width / 2) / window.innerWidth,
        y: (rect.top + rect.height / 2) / window.innerHeight,
      }
    : { x: 0.5, y: 0.6 };
  const base = { colors: CONFETTI_COLORS, disableForReducedMotion: true, ticks: 110, origin };

  if (kind === 'account') {
    void confetti({ ...base, particleCount: 28, spread: 55, startVelocity: 26, scalar: 0.8 });
  } else if (kind === 'payday') {
    void confetti({ ...base, particleCount: 55, spread: 75, startVelocity: 32 });
  } else {
    void confetti({ ...base, particleCount: 90, spread: 100, startVelocity: 42, origin: { x: 0.5, y: 0.7 } });
    window.setTimeout(() => {
      void confetti({ ...base, particleCount: 45, angle: 60, spread: 60, origin: { x: 0, y: 0.75 } });
      void confetti({ ...base, particleCount: 45, angle: 120, spread: 60, origin: { x: 1, y: 0.75 } });
    }, 220);
  }
}

/**
 * Animate a number from its previous value to `target`. Returns the value to
 * show right now. Jumps straight to the target under reduced motion.
 */
export function useCountUp(target: number, durationMs = 700): number {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(reduced ? target : 0);

  useEffect(() => {
    if (reduced) {
      setShown(target);
      return;
    }
    let frame = 0;
    let from: number | null = null;
    const start = performance.now();
    const tick = (now: number) => {
      setShown((current) => {
        from ??= current;
        const t = Math.min(1, (now - start) / durationMs);
        const eased = 1 - (1 - t) ** 3;
        return Math.round(from + (target - from) * eased);
      });
      if (now - start < durationMs) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs, reduced]);

  return shown;
}
