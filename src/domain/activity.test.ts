import { describe, expect, it } from 'vitest';
import {
  filterTransactions,
  groupByDay,
  monthTotals,
  recentMerchants,
  sortNewestFirst,
  topCategories,
} from './activity';
import { validateBackup } from './backup';
import { addDays, dayLabel, isISODate, parseISODate, toISODate } from './dates';

let n = 0;
const tx = (over: Partial<Parameters<typeof filterTransactions>[0][number]> = {}) => ({
  date: '2026-10-07',
  createdAt: `2026-10-07T10:00:${String(n++).padStart(2, '0')}.000Z`,
  amountCents: -450,
  categoryId: 'dining' as string | null,
  merchant: "Joe's Coffee",
  rawDescriptor: 'SQ *JOES COFFEE 4412',
  note: '',
  needsReview: false,
  ...over,
});

const names = new Map([
  ['dining', 'Dining out'],
  ['groceries', 'Groceries'],
]);

describe('sortNewestFirst', () => {
  it('orders by date, then by entry time', () => {
    const a = tx({ date: '2026-10-05' });
    const b = tx({ date: '2026-10-07' });
    const c = tx({ date: '2026-10-07' });
    expect(sortNewestFirst([a, b, c])).toEqual([c, b, a]);
  });
});

describe('filterTransactions', () => {
  const coffee = tx();
  const costco = tx({
    merchant: 'Costco',
    rawDescriptor: 'COSTCO WHOLESALE W1234',
    categoryId: 'groceries',
    amountCents: -18234,
    note: 'party supplies',
  });
  const mystery = tx({
    merchant: 'Blue Door',
    rawDescriptor: 'BLUE DOOR 0921',
    categoryId: null,
    needsReview: true,
  });
  const all = [coffee, costco, mystery];
  const run = (query: string, needsReviewOnly = false) =>
    filterTransactions(all, { query, needsReviewOnly }, names);

  it('returns everything with no filter', () => {
    expect(run('')).toEqual(all);
  });

  it('searches merchant, raw descriptor, note and category name', () => {
    expect(run('joe')).toEqual([coffee]);
    expect(run('wholesale')).toEqual([costco]);
    expect(run('PARTY')).toEqual([costco]);
    expect(run('dining')).toEqual([coffee]);
    expect(run('uncategorised')).toEqual([mystery]);
  });

  it('searches amounts', () => {
    expect(run('182.34')).toEqual([costco]);
    expect(run('4.50')).toEqual([coffee, mystery]);
  });

  it('requires every word to match', () => {
    expect(run('costco party')).toEqual([costco]);
    expect(run('costco coffee')).toEqual([]);
  });

  it('filters to needs review, combined with search', () => {
    expect(run('', true)).toEqual([mystery]);
    expect(run('joe', true)).toEqual([]);
  });
});

describe('kind filter, totals and top categories', () => {
  const list = [
    tx({ amountCents: -450, categoryId: 'dining' }),
    tx({ amountCents: -900, categoryId: 'dining' }),
    tx({ amountCents: -3000, categoryId: 'groceries' }),
    tx({ amountCents: 200000, categoryId: null, merchant: 'Payroll' }),
    tx({ date: '2026-09-30', amountCents: -7777, categoryId: 'fun' }),
  ];

  it('filters to expenses or income', () => {
    const only = (kind: 'expense' | 'income') =>
      filterTransactions(list, { query: '', needsReviewOnly: false, kind }, names);
    expect(only('income').map((t) => t.merchant)).toEqual(['Payroll']);
    expect(only('expense')).toHaveLength(4);
  });

  it('totals a month', () => {
    expect(monthTotals(list, '2026-10')).toEqual({
      inCents: 200000,
      outCents: 4350,
      netCents: 195650,
    });
  });

  it('ranks categories by use, then by their own order', () => {
    const categories = [{ id: 'groceries' }, { id: 'dining' }, { id: 'transport' }, { id: 'fun' }];
    expect(topCategories(list, categories).map((c) => c.id)).toEqual([
      'dining',
      'groceries',
      'fun',
    ]);
    expect(topCategories([], categories, 2).map((c) => c.id)).toEqual(['groceries', 'dining']);
  });
});

describe('groupByDay', () => {
  it('groups in order with signed day totals', () => {
    const groups = groupByDay([
      tx({ date: '2026-10-07', amountCents: -450 }),
      tx({ date: '2026-10-07', amountCents: -1000 }),
      tx({ date: '2026-10-06', amountCents: 250000 }),
    ]);
    expect(groups.map((g) => [g.date, g.totalCents, g.items.length])).toEqual([
      ['2026-10-07', -1450, 2],
      ['2026-10-06', 250000, 1],
    ]);
  });
});

describe('recentMerchants', () => {
  it('lists distinct merchants, newest first, with their latest category', () => {
    const list = recentMerchants([
      tx({ date: '2026-10-01', merchant: 'Costco', categoryId: 'groceries' }),
      tx({ date: '2026-10-03', merchant: "Joe's Coffee", categoryId: 'groceries' }),
      tx({ date: '2026-10-07', merchant: 'JOES COFFEE', categoryId: 'dining' }),
      tx({ date: '2026-10-06', merchant: '' }),
    ]);
    expect(list).toEqual([
      { name: 'JOES COFFEE', categoryId: 'dining' },
      { name: 'Costco', categoryId: 'groceries' },
    ]);
  });

  it('respects the limit', () => {
    const many = Array.from({ length: 20 }, (_, i) => tx({ merchant: `Shop ${i}` }));
    expect(recentMerchants(many, 5)).toHaveLength(5);
  });
});

describe('dates', () => {
  it('round-trips local dates', () => {
    expect(toISODate(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(toISODate(parseISODate('2026-12-31'))).toBe('2026-12-31');
  });

  it('adds days across month and year ends', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('validates ISO dates', () => {
    expect(isISODate('2026-02-28')).toBe(true);
    expect(isISODate('2026-02-30')).toBe(false);
    expect(isISODate('07/10/2026')).toBe(false);
  });

  it('labels days relative to today', () => {
    expect(dayLabel('2026-10-07', '2026-10-07')).toBe('Today');
    expect(dayLabel('2026-10-06', '2026-10-07')).toBe('Yesterday');
    expect(dayLabel('2026-10-05', '2026-10-07', 'en-CA')).toBe('Mon, Oct 5');
    expect(dayLabel('2025-12-25', '2026-10-07', 'en-CA')).toContain('2025');
  });
});

describe('validateBackup', () => {
  const base = { createdAt: 't', updatedAt: 't', deletedAt: null };
  const good = {
    app: 'tameru',
    formatVersion: 1,
    exportedAt: '2026-10-07T00:00:00.000Z',
    data: {
      accounts: [{ id: 'a1', ...base, name: 'Chequing' }],
      transactions: [
        { id: 't1', ...base, amountCents: -450, date: '2026-10-07' },
        { id: 't2', ...base, deletedAt: 't', amountCents: -100, date: '2026-10-07' },
      ],
    },
  };

  it('accepts a valid backup, fills missing tables and counts live rows', () => {
    const result = validateBackup(good);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.counts.accounts).toBe(1);
    expect(result.counts.transactions).toBe(1);
    expect(result.backup.data.transactions).toHaveLength(2);
    expect(result.backup.data.goals).toEqual([]);
  });

  it.each([
    ['not an object', 'nope'],
    ['another app', { ...good, app: 'other' }],
    ['a newer format', { ...good, formatVersion: 99 }],
    ['no data', { ...good, data: undefined }],
    ['a non-array table', { ...good, data: { accounts: {} } }],
    ['a row without an id', { ...good, data: { accounts: [{ ...base }] } }],
    [
      'duplicate ids',
      {
        ...good,
        data: {
          accounts: [
            { id: 'a', ...base },
            { id: 'a', ...base },
          ],
        },
      },
    ],
    [
      'a float amount',
      {
        ...good,
        data: { transactions: [{ id: 't', ...base, amountCents: 4.5, date: '2026-10-07' }] },
      },
    ],
  ])('rejects %s', (_, input) => {
    expect(validateBackup(input).ok).toBe(false);
  });
});
