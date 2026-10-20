// Daily spending broken down by category, for Activity's expandable spending chart.
// Pure: takes transactions and the days to show, returns stacked series.

import type { Cents, Id, LocalDate, Transaction } from './types';

/** Key for spending without a category, and for the categories folded into "Other". */
export const UNCATEGORISED = '';
export const OTHER = 'other';

export interface ChartDay {
  date: LocalDate;
  totalCents: Cents; // expenses − refunds, never below 0
  parts: { key: Id; cents: Cents }[]; // in series order, zeros dropped
}

export interface SpendChart {
  /** Series in stacking order (largest first); at most `maxSeries`, the rest in OTHER. */
  keys: Id[];
  totals: Record<Id, Cents>;
  days: ChartDay[];
  averageCents: Cents; // mean daily spend across the days shown
  maxCents: Cents;
}

/** What a posted transaction adds to (or, for a refund, takes from) each category. */
function shares(t: Transaction): [Id, Cents][] {
  const sign = t.type === 'expense' ? 1 : t.type === 'refund' ? -1 : 0;
  if (!sign || t.status !== 'posted') return [];
  if (t.splits?.length) return t.splits.map((s) => [s.categoryId, sign * s.amountCents]);
  return [[t.categoryId ?? UNCATEGORISED, sign * t.amountCents]];
}

export function spendChart(transactions: readonly Transaction[], dates: readonly LocalDate[], maxSeries = 4): SpendChart {
  const want = new Set(dates);
  const perDay = new Map<LocalDate, Map<Id, Cents>>(dates.map((d) => [d, new Map()]));
  const totals: Record<Id, Cents> = {};
  for (const t of transactions) {
    if (!want.has(t.date)) continue;
    const day = perDay.get(t.date)!;
    for (const [key, cents] of shares(t)) {
      day.set(key, (day.get(key) ?? 0) + cents);
      totals[key] = (totals[key] ?? 0) + cents;
    }
  }
  const ranked = Object.keys(totals)
    .filter((k) => totals[k]! > 0)
    .sort((a, b) => totals[b]! - totals[a]!);
  const fold = ranked.length > maxSeries;
  const keys = fold ? [...ranked.slice(0, maxSeries - 1), OTHER] : ranked;
  const seriesOf = (k: Id) => (keys.includes(k) ? k : OTHER);

  const shown: Record<Id, Cents> = {};
  const days = dates.map((date) => {
    const byKey = new Map<Id, Cents>();
    for (const [k, c] of perDay.get(date)!) byKey.set(seriesOf(k), (byKey.get(seriesOf(k)) ?? 0) + c);
    const parts = keys.map((key) => ({ key, cents: Math.max(0, byKey.get(key) ?? 0) })).filter((p) => p.cents > 0);
    for (const p of parts) shown[p.key] = (shown[p.key] ?? 0) + p.cents;
    const net = [...byKey.values()].reduce((s, c) => s + c, 0);
    return { date, totalCents: Math.max(0, net), parts };
  });
  const sum = days.reduce((s, d) => s + d.totalCents, 0);
  return {
    keys,
    totals: shown,
    days,
    averageCents: dates.length ? Math.round(sum / dates.length) : 0,
    maxCents: Math.max(0, ...days.map((d) => Math.max(d.totalCents, d.parts.reduce((s, p) => s + p.cents, 0)))),
  };
}
