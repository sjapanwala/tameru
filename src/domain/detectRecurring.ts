// Spot repeating charges that aren't set up as recurring items yet. Suggest only.

import { addDays, addMonths, diffDays } from './dates';
import type { Cents, Frequency, Id, LocalDate, Transaction } from './types';

export interface DetectedRecurring {
  merchantKey: string;
  merchant: string; // latest display string
  amountCents: Cents; // median of the matching charges
  freq: Extract<Frequency, 'weekly' | 'biweekly' | 'monthly' | 'yearly'>;
  occurrences: number;
  lastDate: LocalDate;
  nextDate: LocalDate;
  categoryId?: Id;
  accountId: Id;
}

const BANDS: { freq: DetectedRecurring['freq']; lo: number; hi: number; min: number }[] = [
  { freq: 'weekly', lo: 5, hi: 9, min: 3 },
  { freq: 'biweekly', lo: 12, hi: 16, min: 3 },
  { freq: 'monthly', lo: 27, hi: 34, min: 3 },
  { freq: 'yearly', lo: 358, hi: 372, min: 2 },
];

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : Math.round((s[m - 1]! + s[m]!) / 2);
};

/**
 * Same normalised merchant, amount within ±10% of the median, at a regular
 * interval (weekly/biweekly/monthly/yearly ± a few days), seen enough times.
 * `knownKeys` are merchants already covered by a recurring item or dismissed.
 */
export function detectRecurring(txs: readonly Transaction[], knownKeys: ReadonlySet<string>): DetectedRecurring[] {
  const groups = new Map<string, Transaction[]>();
  for (const t of txs) {
    if (t.type !== 'expense' || t.status !== 'posted' || t.recurringId || !t.merchantKey || knownKeys.has(t.merchantKey)) continue;
    const g = groups.get(t.merchantKey) ?? [];
    g.push(t);
    groups.set(t.merchantKey, g);
  }
  const out: DetectedRecurring[] = [];
  for (const [key, all] of groups) {
    if (all.length < 2) continue;
    const med = median(all.map((t) => t.amountCents));
    const series = all.filter((t) => Math.abs(t.amountCents - med) <= med * 0.1).sort((a, b) => a.date.localeCompare(b.date));
    if (series.length < 2) continue;
    const gaps = series.slice(1).map((t, i) => diffDays(series[i]!.date, t.date));
    const mg = median(gaps);
    const band = BANDS.find((b) => mg >= b.lo && mg <= b.hi);
    if (!band || series.length < band.min) continue;
    // Nearly every gap must fit the band: one stray charge in a long series is fine.
    const fit = gaps.filter((g) => g >= band.lo && g <= band.hi).length;
    if (fit < Math.max(band.min - 1, Math.ceil(gaps.length * 0.8))) continue;
    const last = series[series.length - 1]!;
    const nextDate =
      band.freq === 'monthly' ? addMonths(last.date, 1) : band.freq === 'yearly' ? addMonths(last.date, 12) : addDays(last.date, band.freq === 'weekly' ? 7 : 14);
    const cats = series.map((t) => t.categoryId).filter((c): c is Id => !!c);
    out.push({
      merchantKey: key,
      merchant: last.merchant ?? key,
      amountCents: median(series.map((t) => t.amountCents)),
      freq: band.freq,
      occurrences: series.length,
      lastDate: last.date,
      nextDate,
      ...(cats.length ? { categoryId: cats[cats.length - 1] } : {}),
      accountId: last.accountId,
    });
  }
  return out.sort((a, b) => b.occurrences - a.occurrences);
}
