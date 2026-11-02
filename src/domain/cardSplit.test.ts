import { describe, expect, it } from 'vitest';
import { tx } from '../../tests/factories';
import { spendingWeights, spentToday, splitByWeight } from './cardSplit';

const sum = (r: Record<string, number>) => Object.values(r).reduce((s, v) => s + v, 0);

describe('card split', () => {
  it('weights cards by posted spending in the last 30 days, less refunds', () => {
    const txs = [
      tx({ accountId: 'a', amountCents: 3000, date: '2026-03-30' }),
      tx({ accountId: 'a', type: 'refund', amountCents: 1000, date: '2026-03-29' }),
      tx({ accountId: 'b', amountCents: 500, date: '2026-03-02' }),
      tx({ accountId: 'b', amountCents: 9999, date: '2026-03-01' }), // 31 days ago
      tx({ accountId: 'b', amountCents: 9999, date: '2026-03-30', status: 'pending' }),
      tx({ accountId: 'b', type: 'income', amountCents: 9999, date: '2026-03-30' }),
      tx({ accountId: 'other', amountCents: 9999, date: '2026-03-30' }),
    ];
    expect(spendingWeights(['a', 'b'], txs, '2026-03-31')).toEqual({ a: 2000, b: 500 });
  });
  it('never weights a card below zero', () => {
    const txs = [tx({ accountId: 'a', type: 'refund', amountCents: 1000, date: '2026-03-30' })];
    expect(spendingWeights(['a'], txs, '2026-03-31')).toEqual({ a: 0 });
  });
  it('splits by weight and always sums to the total', () => {
    expect(splitByWeight(10000, { a: 3, b: 1 })).toEqual({ a: 7500, b: 2500 });
    const odd = splitByWeight(1000, { a: 1, b: 1, c: 1 });
    expect(sum(odd)).toBe(1000);
    expect(odd).toEqual({ a: 334, b: 333, c: 333 });
  });
  it('splits evenly without history, and splits a shortfall too', () => {
    expect(splitByWeight(900, { a: 0, b: 0, c: 0 })).toEqual({ a: 300, b: 300, c: 300 });
    const short = splitByWeight(-1001, { a: 1, b: 1 });
    expect(sum(short)).toBe(-1001);
    expect(short.a! < 0 && short.b! < 0).toBe(true);
    expect(splitByWeight(0, { a: 1 })).toEqual({ a: 0 });
    expect(splitByWeight(500, {})).toEqual({});
  });
  it('totals what each card spent today', () => {
    const txs = [tx({ accountId: 'a', amountCents: 450, date: '2026-03-31' }), tx({ accountId: 'a', amountCents: 999, date: '2026-03-30' })];
    expect(spentToday(['a', 'b'], txs, '2026-03-31')).toEqual({ a: 450, b: 0 });
  });
});
