import { describe, expect, it } from 'vitest';
import { category, tx } from '../../tests/factories';
import { budgetHistory } from './budgets';
import { coverOptions } from './reabsorb';
import type { BudgetMove, PeriodSegment } from './types';

const reset = category({ id: 'dine', name: 'Eating out', behaviour: 'reset' });
const roll = category({ id: 'groc', name: 'Groceries', behaviour: 'rollover' });
const fund = category({ id: 'fund', name: 'Irregular', behaviour: 'fund', isBuffer: true, group: 'savings' });
const fun = category({ id: 'fun', name: 'Fun', behaviour: 'reset', group: 'lifestyle' });
const periods = [
  { start: '2026-01-01', end: '2026-01-31' },
  { start: '2026-02-01', end: '2026-02-28' },
  { start: '2026-03-01', end: '2026-03-31' },
];
const alloc: Record<string, number> = { dine: 10000, groc: 40000, fund: 5000, fun: 10000 };
const run = (txs: ReturnType<typeof tx>[], moves: BudgetMove[] = [], segments: PeriodSegment[] = []) =>
  budgetHistory({ categories: [reset, roll, fund, fun], periods, allocationFor: (c) => alloc[c] ?? 0, moves, segments, transactions: txs });
const move = (p: Partial<BudgetMove>): BudgetMove => ({ id: 'm', createdAt: '', updatedAt: '', periodStart: '2026-01-01', fromCategoryId: 'fun', toCategoryId: 'dine', amountCents: 0, ...p });

describe('budgets', () => {
  it('reset loses unspent money; rollover and fund carry it', () => {
    const h = run([tx({ categoryId: 'dine', amountCents: 4000 }), tx({ categoryId: 'groc', amountCents: 30000 })]);
    expect(h.get('2026-02-01')!.get('dine')!.remainingCents).toBe(10000);
    expect(h.get('2026-02-01')!.get('groc')!.remainingCents).toBe(50000);
    expect(h.get('2026-03-01')!.get('groc')!.carriedInCents).toBe(50000);
    expect(h.get('2026-03-01')!.get('fund')!.remainingCents).toBe(15000);
  });
  it('rollover overspending reduces the next period', () => {
    const h = run([tx({ categoryId: 'groc', amountCents: 45000 })]);
    expect(h.get('2026-01-01')!.get('groc')!).toMatchObject({ remainingCents: -5000, overCents: 5000 });
    expect(h.get('2026-02-01')!.get('groc')!.remainingCents).toBe(35000);
  });
  it('a cover from another category clears the over and is not carried', () => {
    const h = run([tx({ categoryId: 'groc', amountCents: 45000 })], [move({ fromCategoryId: 'fun', toCategoryId: 'groc', amountCents: 5000 })]);
    expect(h.get('2026-01-01')!.get('groc')!.remainingCents).toBe(0);
    expect(h.get('2026-01-01')!.get('fun')!.remainingCents).toBe(5000);
    expect(h.get('2026-02-01')!.get('groc')!.remainingCents).toBe(40000);
  });
  it('borrowing from next period reduces only next allocation', () => {
    const h = run([tx({ categoryId: 'dine', amountCents: 13000 })], [move({ fromCategoryId: 'next_period', toCategoryId: 'dine', amountCents: 3000 })]);
    expect(h.get('2026-01-01')!.get('dine')!.remainingCents).toBe(0);
    expect(h.get('2026-02-01')!.get('dine')!).toMatchObject({ allocatedCents: 7000, borrowedAheadCents: 3000, remainingCents: 7000 });
    expect(h.get('2026-03-01')!.get('dine')!.allocatedCents).toBe(10000);
  });
  it('refunds give money back; transfers never count', () => {
    const h = run([
      tx({ categoryId: 'dine', amountCents: 5000 }),
      tx({ categoryId: 'dine', amountCents: 2000, type: 'refund' }),
      tx({ type: 'transfer', amountCents: 99999, toAccountId: 'x' }),
    ]);
    expect(h.get('2026-01-01')!.get('dine')!.remainingCents).toBe(7000);
  });
  it('a fresh-start segment restarts the period', () => {
    const h = run(
      [tx({ categoryId: 'groc', amountCents: 30000, date: '2026-02-03' }), tx({ categoryId: 'groc', amountCents: 1000, date: '2026-02-20' })],
      [],
      [{ id: 's', createdAt: '', updatedAt: '', periodStart: '2026-02-01', segmentStart: '2026-02-15' }],
    );
    expect(h.get('2026-02-01')!.get('groc')!).toMatchObject({ carriedInCents: 0, spentCents: 1000, remainingCents: 39000 });
  });
});

describe('coverOptions', () => {
  it('ranks by slack, then funds, then next period, then leave', () => {
    // Jan 20: 20 days in, 12 left. Dining is $30 over.
    const h = run([
      tx({ categoryId: 'dine', amountCents: 13000 }),
      tx({ categoryId: 'fun', amountCents: 2000 }), // burn 100/day → expects 1200 more; slack 6800
      tx({ categoryId: 'groc', amountCents: 20000 }), // burn 1000/day → expects 12000; slack 8000
    ]).get('2026-01-01')!;
    const opts = coverOptions('dine', h, [reset, roll, fund, fun], 20, 12);
    expect(opts.map((o) => [o.kind, 'fromCategoryId' in o ? o.fromCategoryId : '', o.amountCents])).toEqual([
      ['category', 'groc', 3000],
      ['category', 'fun', 3000],
      ['fund', 'fund', 3000],
      ['next_period', '', 3000],
      ['leave', '', 0],
    ]);
  });
  it('skips categories whose remaining money is already spoken for', () => {
    const h = run([tx({ categoryId: 'dine', amountCents: 13000 }), tx({ categoryId: 'groc', amountCents: 30000 }), tx({ categoryId: 'fun', amountCents: 9000 })]).get('2026-01-01')!;
    const opts = coverOptions('dine', h, [reset, roll, fund, fun], 20, 12);
    expect(opts.map((o) => o.kind)).toEqual(['fund', 'next_period', 'leave']);
  });
  it('offers nothing when not over', () => {
    expect(coverOptions('dine', run([]).get('2026-01-01')!, [reset], 1, 30)).toEqual([]);
  });
});
