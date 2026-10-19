import { describe, expect, it } from 'vitest';
import { account, recurring, tx } from '../../tests/factories';
import { addDays } from './dates';
import { DEFAULT_DAILY_DISCRETIONARY_CENTS, estimateDiscretionary, forecast, periodOutlook } from './forecast';

const chq = account({ id: 'chq', openingBalanceCents: 100000, openingDate: '2026-01-01' });
const sav = account({ id: 'sav', type: 'savings', openingBalanceCents: 1_000_000, openingDate: '2026-01-01', interest: { rateBps: 400, kind: 'apy', compounding: 'monthly' } });
const none = { dailyCents: 0, perCategoryDaily: {}, accountShares: {}, source: 'default' as const };

describe('estimateDiscretionary', () => {
  it('averages the last 8 weeks of non-recurring spending', () => {
    const txs = Array.from({ length: 56 }, (_, i) => tx({ accountId: 'chq', categoryId: 'g', amountCents: 1000, date: addDays('2026-03-01', -56 + i) }));
    txs.push(tx({ accountId: 'chq', categoryId: 'b', amountCents: 99999, date: '2026-02-15', recurringId: 'rent', originKey: 'rec:rent:2026-02-15' }));
    txs.push(tx({ accountId: 'chq', categoryId: 'g', amountCents: 99999, date: '2025-11-01' })); // outside the window
    const e = estimateDiscretionary({ today: '2026-03-01', transactions: txs });
    expect(e.source).toBe('history');
    expect(e.dailyCents).toBeCloseTo(1000, 6);
    expect(e.perCategoryDaily).toEqual({ g: 1000 });
    expect(e.accountShares).toEqual({ chq: 1 });
  });
  it('falls back to plan, then habits, then a default', () => {
    const short = [tx({ amountCents: 500, date: '2026-02-25' })];
    expect(estimateDiscretionary({ today: '2026-03-01', transactions: short, planFlexible: { perCategory: { g: 31000 }, periodDays: 31 } })).toMatchObject({ source: 'plan', dailyCents: 1000 });
    expect(estimateDiscretionary({ today: '2026-03-01', transactions: [], habitsWeekly: { g: 7000 } })).toMatchObject({ source: 'habits', dailyCents: 1000 });
    expect(estimateDiscretionary({ today: '2026-03-01', transactions: [], fallbackAccountId: 'chq' })).toMatchObject({
      source: 'default', dailyCents: DEFAULT_DAILY_DISCRETIONARY_CENTS, accountShares: { chq: 1 },
    });
  });
});

describe('forecast', () => {
  const rent = recurring({ id: 'rent', schedule: { freq: 'monthly', day: 1 }, amount: { fixedCents: 95000 }, defaultAccountId: 'chq', startDate: '2026-01-01' });
  const pay = recurring({ id: 'pay', kind: 'income', schedule: { freq: 'biweekly', anchor: '2026-01-09' }, amount: { fixedCents: 80000 }, defaultAccountId: 'chq', startDate: '2026-01-09' });
  it('projects recurring flows and flags the lowest point and negative days', () => {
    const f = forecast({ today: '2026-01-25', horizonDays: 30, accounts: [chq], transactions: [], recurring: [rent, pay], estimate: none });
    // 1000 → +800 (Jan 23 already passed) ... Feb 1 rent −950 → 50; Feb 6 pay → 850; Feb 20 pay → 1650
    const on = (d: string) => f.days.find((x) => x.date === d)!.balances.chq;
    expect(on('2026-01-31')).toBe(100000);
    expect(on('2026-02-01')).toBe(5000);
    expect(on('2026-02-06')).toBe(85000);
    expect(f.lowest.chq).toEqual({ date: '2026-02-01', balanceCents: 5000 });
    expect(f.negatives).toEqual([]);
    const tight = forecast({ today: '2026-01-25', horizonDays: 30, accounts: [chq], transactions: [], recurring: [rent, pay], estimate: { ...none, dailyCents: 2000, accountShares: { chq: 1 } } });
    expect(tight.negatives[0]).toMatchObject({ accountId: 'chq', date: '2026-02-01' });
    expect(tight.lowestSpendable.date).toBe('2026-02-05');
  });
  it('spreads fractional discretionary spending in whole cents with exact totals', () => {
    const f = forecast({ today: '2026-01-01', horizonDays: 29, accounts: [chq], transactions: [], recurring: [], estimate: { ...none, dailyCents: 333.33, accountShares: { chq: 1 } } });
    const last = f.days[f.days.length - 1]!.balances.chq!;
    expect(Number.isInteger(last)).toBe(true);
    expect(100000 - last).toBe(Math.round(333.33 * 30));
  });
  it('does not double-count recorded or pending occurrences', () => {
    const pending = tx({ accountId: 'chq', amountCents: 95000, date: '2026-02-01', status: 'pending', originKey: 'rec:rent:2026-02-01', recurringId: 'rent' });
    const f = forecast({ today: '2026-02-01', horizonDays: 5, accounts: [chq], transactions: [pending], recurring: [rent], estimate: none });
    expect(f.days[0]!.balances.chq).toBe(5000);
  });
  it('includes savings interest', () => {
    const f = forecast({ today: '2026-01-15', horizonDays: 30, accounts: [sav], transactions: [], recurring: [], estimate: none });
    expect(f.interest).toHaveLength(1);
    expect(f.interest[0]!.date).toBe('2026-01-31');
    expect(f.days.find((d) => d.date === '2026-01-31')!.balances.sav).toBe(1_000_000 + f.interest[0]!.cents);
    expect(f.interest[0]!.cents).toBe(Math.round(1_000_000 * (1.04 ** (31 / 365) - 1)));
  });
});

describe('periodOutlook', () => {
  it('estimates savings and per-category spend', () => {
    const rentItem = recurring({ id: 'rent', categoryId: 'bills', schedule: { freq: 'monthly', day: 28 }, amount: { fixedCents: 50000 }, startDate: '2026-01-01' });
    const payItem = recurring({ id: 'pay', kind: 'income', schedule: { freq: 'monthly', day: 15 }, amount: { fixedCents: 200000 }, startDate: '2026-01-01' });
    const txs = [tx({ categoryId: 'dine', amountCents: 6000, date: '2026-01-05' }), tx({ type: 'income', amountCents: 100000, date: '2026-01-01' })];
    const o = periodOutlook({ start: '2026-01-01', end: '2026-01-31' }, '2026-01-11', txs, [rentItem, payItem], { ...none, perCategoryDaily: { dine: 500 } });
    expect(o.perCategory.dine).toEqual({ spentCents: 6000, projectedCents: 6000 + 500 * 20 });
    expect(o.perCategory.bills).toEqual({ spentCents: 0, projectedCents: 50000 });
    expect(o.incomeCents).toBe(300000);
    expect(o.onTrackToSaveCents).toBe(300000 - 16000 - 50000);
  });
});

describe('forecast with removed accounts', () => {
  it('ignores bills and pending items on archived accounts', () => {
    const old = account({ id: 'old', archived: true, openingDate: '2026-01-01' });
    const bill = recurring({ id: 'b', schedule: { freq: 'monthly', day: 1 }, amount: { fixedCents: 5000 }, defaultAccountId: 'old', startDate: '2026-01-01' });
    const f = forecast({ today: '2026-01-25', horizonDays: 10, accounts: [chq, old], transactions: [], recurring: [bill], estimate: none });
    expect(Object.keys(f.days[0]!.balances)).toEqual(['chq']);
    expect(f.negatives).toEqual([]);
  });
});
