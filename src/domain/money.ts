// Integer-cent money helpers. Never store or sum floats.

import type { Cents } from './types';

export function isCents(n: unknown): n is Cents {
  return typeof n === 'number' && Number.isSafeInteger(n);
}

export function assertCents(n: number, label = 'amount'): Cents {
  if (!isCents(n)) throw new Error(`${label} must be integer cents, got ${n}`);
  return n;
}

/**
 * Parse user input like "12", "12.5", "$1,234.56", "-3.10" into cents
 * using string arithmetic only. Returns null when it isn't a valid amount.
 */
export function parseCents(input: string): Cents | null {
  const s = input.trim().replace(/[$,\s]/g, '').replace(/^CA/i, '');
  const m = /^(-)?(\d*)(?:\.(\d{0,2}))?$/.exec(s);
  if (!m || (m[2] === '' && (m[3] === undefined || m[3] === ''))) return null;
  const whole = Number(m[2] || '0');
  const frac = Number((m[3] ?? '').padEnd(2, '0') || '0');
  const cents = whole * 100 + frac;
  if (!Number.isSafeInteger(cents)) return null;
  return m[1] ? -cents : cents;
}

const formatters = new Map<string, Intl.NumberFormat>();

export function formatCents(cents: Cents, currency = 'CAD'): string {
  let f = formatters.get(currency);
  if (!f) {
    f = new Intl.NumberFormat('en-CA', { style: 'currency', currency });
    formatters.set(currency, f);
  }
  // cents / 100 is exact enough for display at any safe-integer amount; nothing is stored from it.
  return f.format(cents / 100);
}

/** Plain "1234.56" (for CSV / inputs). */
export function centsToDecimal(cents: Cents): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

export const sum = (xs: readonly Cents[]): Cents => xs.reduce((a, b) => a + b, 0);

/** Round half away from zero to an integer cent. */
export function roundCents(x: number): Cents {
  return x < 0 ? -Math.round(-x) : Math.round(x);
}

/** cents × num / den, rounded to the nearest cent. */
export function mulDiv(cents: Cents, num: number, den: number): Cents {
  return roundCents((cents * num) / den);
}

/**
 * Split `total` across weights so the parts are integers and sum exactly to total
 * (largest-remainder method).
 */
export function allocate(total: Cents, weights: readonly number[]): Cents[] {
  const wsum = weights.reduce((a, b) => a + Math.max(0, b), 0);
  if (weights.length === 0) return [];
  if (wsum === 0) {
    const out = weights.map(() => 0);
    out[0] = total;
    return out;
  }
  const raw = weights.map((w) => (total * Math.max(0, w)) / wsum);
  const floors = raw.map((r) => Math.floor(r));
  let left = total - sum(floors);
  const order = raw.map((r, i) => ({ i, rem: r - Math.floor(r) })).sort((a, b) => b.rem - a.rem);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) floors[order[k]!.i]!++;
  return floors;
}
