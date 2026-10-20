// The Plan dial: income shown as 100 ticks, each 1%. Pure helpers to turn allocations
// (cents) into whole ticks and percentages back into cents.

import type { Cents } from './types';

export const TICKS = 100;

/** A share of `base` as a percentage (unrounded); 0 when there's no base. */
export const percentOf = (cents: Cents, base: Cents): number => (base > 0 ? (cents / base) * 100 : 0);

/** A whole percentage of `base` in cents, rounded to the dollar (plans read in dollars). */
export const centsForPercent = (pct: number, base: Cents): Cents => Math.round((base * pct) / 100 / 100) * 100;

/**
 * Whole ticks per slice, by largest remainder so rounding never adds up to more ticks
 * than the slices really cover. Past 100% (over-planned) the ticks are scaled to fit.
 */
export function shareTicks<K extends string>(slices: readonly { key: K; cents: Cents }[], base: Cents, ticks = TICKS): { key: K; ticks: number }[] {
  const total = slices.reduce((s, x) => s + Math.max(0, x.cents), 0);
  const denom = Math.max(base, total);
  if (denom <= 0) return slices.map((s) => ({ key: s.key, ticks: 0 }));
  const exact = slices.map((s) => (Math.max(0, s.cents) / denom) * ticks);
  const out = exact.map(Math.floor);
  let left = Math.round((total / denom) * ticks) - out.reduce((a, b) => a + b, 0);
  const order = exact.map((e, i) => [e - Math.floor(e), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (left <= 0) break;
    out[i]! += 1;
    left -= 1;
  }
  return slices.map((s, i) => ({ key: s.key, ticks: out[i]! }));
}
