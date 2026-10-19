import { describe, expect, it } from 'vitest';
import { tx } from '../../tests/factories';
import { addDays, addMonths } from './dates';
import { detectRecurring } from './detectRecurring';

const series = (key: string, dates: string[], amounts: number[]) =>
  dates.map((date, i) => tx({ merchantKey: key, merchant: key.toUpperCase(), date, amountCents: amounts[i % amounts.length]!, categoryId: 'fun' }));

describe('detectRecurring', () => {
  it('finds a monthly subscription with small price drift and day jitter', () => {
    const r = detectRecurring(series('crave', ['2026-01-09', '2026-02-10', '2026-03-09', '2026-04-11'], [999, 999, 1049, 999]), new Set());
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ merchantKey: 'crave', freq: 'monthly', occurrences: 4, nextDate: '2026-05-11', amountCents: 999 });
  });
  it('finds weekly and yearly patterns', () => {
    const weekly = series('gym', [0, 7, 14, 21].map((n) => addDays('2026-01-05', n)), [1500]);
    const yearly = series('domain', ['2024-03-01', '2025-03-03'], [2000]);
    const r = detectRecurring([...weekly, ...yearly], new Set());
    expect(r.map((d) => [d.merchantKey, d.freq])).toEqual([['gym', 'weekly'], ['domain', 'yearly']]);
  });
  it('ignores irregular spending, too-few charges, known merchants and amounts outside ±10%', () => {
    const coffee = series('tims', ['2026-01-01', '2026-01-02', '2026-01-05', '2026-01-06', '2026-01-09', '2026-01-15'], [425]);
    const twice = series('crave', ['2026-01-09', '2026-02-09'], [999]);
    const known = series('netflix', [0, 1, 2].map((n) => addMonths('2026-01-03', n)), [1649]);
    const varied = series('hydro', [0, 1, 2].map((n) => addMonths('2026-01-15', n)), [5000, 9000, 13000]);
    expect(detectRecurring([...coffee, ...twice, ...known, ...varied], new Set(['netflix']))).toEqual([]);
  });
  it('skips charges already linked to a recurring item', () => {
    const linked = series('rent', [0, 1, 2].map((n) => addMonths('2026-01-01', n)), [95000]).map((t) => ({ ...t, recurringId: 'r' }));
    expect(detectRecurring(linked, new Set())).toEqual([]);
  });
});
