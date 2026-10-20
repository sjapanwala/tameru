import { describe, expect, it } from 'vitest';
import { OTHER, spendChart, UNCATEGORISED } from './spendChart';
import type { Transaction } from './types';

let n = 0;
const tx = (p: Partial<Transaction>): Transaction =>
  ({ id: `t${++n}`, type: 'expense', amountCents: 0, date: '2026-10-01', accountId: 'a', status: 'posted', needsReview: false, createdAt: '', updatedAt: '', ...p }) as Transaction;

describe('spend chart', () => {
  const dates = ['2026-10-01', '2026-10-02', '2026-10-03'];

  it('stacks each day by category, largest series first, with the daily average', () => {
    const c = spendChart(
      [
        tx({ date: '2026-10-01', amountCents: 1000, categoryId: 'food' }),
        tx({ date: '2026-10-01', amountCents: 500, categoryId: 'fun' }),
        tx({ date: '2026-10-02', amountCents: 3000, categoryId: 'food' }),
        tx({ date: '2026-10-03', amountCents: 200 }), // uncategorised
      ],
      dates,
    );
    expect(c.keys).toEqual(['food', 'fun', UNCATEGORISED]);
    expect(c.days[0]).toEqual({ date: '2026-10-01', totalCents: 1500, parts: [{ key: 'food', cents: 1000 }, { key: 'fun', cents: 500 }] });
    expect(c.days[2]!.parts).toEqual([{ key: UNCATEGORISED, cents: 200 }]);
    expect(c.averageCents).toBe(Math.round(4700 / 3));
    expect(c.maxCents).toBe(3000);
    expect(c.totals).toEqual({ food: 4000, fun: 500, [UNCATEGORISED]: 200 });
  });

  it('splits by split amounts, nets refunds, and skips pending, income, transfers and other days', () => {
    const c = spendChart(
      [
        tx({ amountCents: 1000, splits: [{ categoryId: 'food', amountCents: 600 }, { categoryId: 'home', amountCents: 400 }] }),
        tx({ type: 'refund', amountCents: 100, categoryId: 'food' }),
        tx({ amountCents: 999, categoryId: 'food', status: 'pending' }),
        tx({ type: 'income', amountCents: 5000, categoryId: 'food' }),
        tx({ type: 'transfer', amountCents: 700 }),
        tx({ date: '2026-09-30', amountCents: 800, categoryId: 'food' }),
      ],
      dates,
    );
    expect(c.days[0]).toEqual({ date: '2026-10-01', totalCents: 900, parts: [{ key: 'food', cents: 500 }, { key: 'home', cents: 400 }] });
    expect(c.days[1]).toEqual({ date: '2026-10-02', totalCents: 0, parts: [] });
  });

  it('folds the smallest categories into Other', () => {
    const c = spendChart(
      ['a', 'b', 'c', 'd', 'e'].map((categoryId, i) => tx({ categoryId, amountCents: (5 - i) * 100 })),
      dates,
      3,
    );
    expect(c.keys).toEqual(['a', 'b', OTHER]);
    expect(c.days[0]!.parts).toEqual([{ key: 'a', cents: 500 }, { key: 'b', cents: 400 }, { key: OTHER, cents: 600 }]);
  });
});
