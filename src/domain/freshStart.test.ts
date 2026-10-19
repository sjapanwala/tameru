import { describe, expect, it } from 'vitest';
import { tx } from '../../tests/factories';
import { backlogOf, freshStartAllocations, freshStartOffer, summariseBacklog } from './freshStart';

const settings = { freshStartDays: 10, freshStartBacklog: 15 };

describe('fresh start', () => {
  it('offers after N days away or a big backlog', () => {
    expect(freshStartOffer(settings, '2026-01-01', '2026-01-11', 0)).toEqual({ reason: 'away', daysAway: 10, backlog: 0 });
    expect(freshStartOffer(settings, '2026-01-01', '2026-01-10', 0)).toBeNull();
    expect(freshStartOffer(settings, '2026-01-09', '2026-01-10', 15)).toMatchObject({ reason: 'backlog' });
    expect(freshStartOffer(settings, undefined, '2026-01-10', 0)).toBeNull();
  });
  it('collapses the backlog into a summary', () => {
    const txs = [
      tx({ needsReview: true, categoryId: 'g', amountCents: 1000, date: '2026-01-02' }),
      tx({ status: 'pending', categoryId: 'b', amountCents: 5000, date: '2026-01-05' }),
      tx({ status: 'pending', categoryId: 'b', amountCents: 5000, date: '2026-02-05' }), // not due yet
      tx({ needsReview: true, status: 'skipped', categoryId: 'g' }),
      tx({ categoryId: 'g' }),
    ];
    const b = backlogOf(txs, '2026-01-10');
    expect(b).toHaveLength(2);
    expect(summariseBacklog(b)).toEqual({ count: 2, spentCents: 6000, byCategory: { g: 1000, b: 5000 }, from: '2026-01-02', to: '2026-01-05' });
  });
  it('restarts allocations from today: bills still due, flexible prorated and fitted to what is free', () => {
    const p = { start: '2026-01-01', end: '2026-01-30' };
    const tpl = { bills: 100000, groc: 30000, fun: 15000 };
    expect(freshStartAllocations(tpl, 'bills', 20000, 999999, p, '2026-01-16')).toEqual({ bills: 20000, groc: 15000, fun: 7500 });
    const fitted = freshStartAllocations(tpl, 'bills', 20000, 9000, p, '2026-01-16');
    expect(fitted).toEqual({ bills: 20000, groc: 6000, fun: 3000 });
    expect(freshStartAllocations(tpl, 'bills', 0, -500, p, '2026-01-16')).toEqual({ bills: 0, groc: 0, fun: 0 });
  });
});
