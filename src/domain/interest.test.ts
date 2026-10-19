import { describe, expect, it } from 'vitest';
import { eachDay } from './dates';
import { computeInterest, dailyRate, effectiveAnnualRate } from './interest';

const flat = (from: string, to: string, cents: number) => eachDay(from, to).map((date) => ({ date, balanceCents: cents }));

describe('interest', () => {
  it('converts APR to APY', () => {
    expect(effectiveAnnualRate({ rateBps: 500, kind: 'apy', compounding: 'monthly' })).toBeCloseTo(0.05, 10);
    expect(effectiveAnnualRate({ rateBps: 500, kind: 'apr', compounding: 'monthly' })).toBeCloseTo(0.051162, 6);
    expect(effectiveAnnualRate({ rateBps: 500, kind: 'apr', compounding: 'daily' })).toBeCloseTo(0.051267, 6);
    expect((1 + dailyRate({ rateBps: 400, kind: 'apy', compounding: 'daily' })) ** 365).toBeCloseTo(1.04, 10);
  });
  it('a constant balance earns the APY over a year, posted monthly in whole cents', () => {
    const r = computeInterest({ rateBps: 400, kind: 'apy', compounding: 'monthly' }, flat('2026-01-01', '2026-12-31', 1_000_000));
    expect(r.postings).toHaveLength(12);
    expect(r.postings.every((p) => Number.isInteger(p.cents))).toBe(true);
    expect(r.postings.map((p) => p.date).slice(0, 3)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
    const total = r.postings.reduce((a, p) => a + p.cents, 0);
    expect(Math.abs(total - 40_000)).toBeLessThanOrEqual(1);
  });
  it('daily compounding reaches the same APY', () => {
    const r = computeInterest({ rateBps: 400, kind: 'apy', compounding: 'daily' }, flat('2026-01-01', '2026-12-31', 1_000_000));
    expect(Math.abs(r.postings.reduce((a, p) => a + p.cents, 0) - 40_000)).toBeLessThanOrEqual(1);
  });
  it('quarterly and annual posting', () => {
    const q = computeInterest({ rateBps: 400, kind: 'apy', compounding: 'quarterly' }, flat('2026-01-01', '2026-12-31', 1_000_000));
    expect(q.postings.map((p) => p.date)).toEqual(['2026-03-31', '2026-06-30', '2026-09-30', '2026-12-31']);
    const a = computeInterest({ rateBps: 400, kind: 'apy', compounding: 'annually' }, flat('2026-01-01', '2026-12-31', 1_000_000));
    expect(a.postings).toEqual([{ date: '2026-12-31', cents: 40_000 }]);
  });
  it('prorates a partial first period and exposes the accrued amount', () => {
    const r = computeInterest({ rateBps: 365, kind: 'apy', compounding: 'monthly' }, flat('2026-01-17', '2026-02-10', 100_000));
    expect(r.postings).toHaveLength(1);
    expect(r.postings[0]!.cents).toBe(Math.round(100_000 * (1.0365 ** (15 / 365) - 1)));
    expect(r.accruedCents).toBeGreaterThan(0);
  });
  it('carries sub-cent remainders instead of losing them', () => {
    // $10 at 1% earns ~0.8 cents a month: postings must still add up over a year.
    const r = computeInterest({ rateBps: 100, kind: 'apy', compounding: 'monthly' }, flat('2026-01-01', '2026-12-31', 1000));
    expect(r.postings.reduce((a, p) => a + p.cents, 0)).toBe(10);
  });
  it('earns nothing on negative balances or a zero rate', () => {
    expect(computeInterest({ rateBps: 400, kind: 'apy', compounding: 'monthly' }, flat('2026-01-01', '2026-03-31', -5000)).postings).toEqual([]);
    expect(computeInterest({ rateBps: 0, kind: 'apy', compounding: 'monthly' }, flat('2026-01-01', '2026-03-31', 5000)).postings).toEqual([]);
  });
});
