import { describe, expect, it } from 'vitest';
import { account, tx } from '../../tests/factories';
import { balanceAsOf, dailyBalances, netContributed, spendingByCategory, validateTransaction } from './ledger';

const chq = account({ id: 'chq', openingBalanceCents: 50000, openingDate: '2026-01-05' });
const card = account({ id: 'card', type: 'credit_card', openingBalanceCents: -2000, openingDate: '2026-01-01' });
const inv = account({ id: 'inv', type: 'investing', openingBalanceCents: 10000, openingDate: '2026-01-01' });

describe('balances', () => {
  const txs = [
    tx({ accountId: 'chq', amountCents: 1500, date: '2026-01-06', categoryId: 'g' }),
    tx({ accountId: 'chq', type: 'income', amountCents: 80000, date: '2026-01-10' }),
    tx({ accountId: 'chq', type: 'transfer', toAccountId: 'card', amountCents: 2000, date: '2026-01-12' }),
    tx({ accountId: 'card', amountCents: 3000, date: '2026-01-12', categoryId: 'd' }),
    tx({ accountId: 'chq', amountCents: 999, date: '2026-01-04' }), // before opening date: history only
    tx({ accountId: 'chq', amountCents: 5000, date: '2026-01-07', status: 'pending' }),
    tx({ accountId: 'chq', amountCents: 5000, date: '2026-01-07', status: 'skipped' }),
    tx({ accountId: 'card', type: 'refund', amountCents: 500, date: '2026-01-13', categoryId: 'd' }),
  ];
  it('derives balances from opening + effects', () => {
    expect(balanceAsOf(chq, txs, '2026-01-31')).toBe(50000 - 1500 + 80000 - 2000);
    expect(balanceAsOf(chq, txs, '2026-01-31', { includePending: true })).toBe(50000 - 1500 + 80000 - 2000 - 5000);
    expect(balanceAsOf(card, txs, '2026-01-31')).toBe(-2000 + 2000 - 3000 + 500);
    expect(balanceAsOf(chq, txs, '2026-01-09')).toBe(48500);
  });
  it('produces daily balances', () => {
    const d = dailyBalances(chq, txs, '2026-01-04', '2026-01-10');
    expect(d.map((x) => x.balanceCents)).toEqual([0, 50000, 48500, 48500, 48500, 48500, 128500]);
  });
  it('never counts transfers as spending; refunds reduce spending; splits split', () => {
    const s = spendingByCategory(
      [...txs, tx({ amountCents: 1000, date: '2026-01-15', splits: [{ categoryId: 'g', amountCents: 600 }, { categoryId: 'd', amountCents: 400 }] })],
      '2026-01-01',
      '2026-01-31',
    );
    expect(s).toEqual({ g: 2100, d: 2900 });
  });
  it('tracks investing net contributions only', () => {
    const t = [
      tx({ type: 'transfer', accountId: 'chq', toAccountId: 'inv', amountCents: 5000, date: '2026-01-10' }),
      tx({ type: 'transfer', accountId: 'inv', toAccountId: 'chq', amountCents: 2000, date: '2026-01-20' }),
    ];
    expect(netContributed(inv, t, '2026-01-31')).toBe(13000);
    expect(netContributed(inv, t, '2026-01-15')).toBe(15000);
  });
});

describe('validateTransaction', () => {
  const accts = [chq, card, inv];
  const ok = { type: 'expense' as const, amountCents: 100, date: '2026-01-01', accountId: 'chq' };
  it('accepts a valid expense', () => expect(validateTransaction(ok, accts)).toEqual([]));
  it('rejects bad amounts and floats', () => {
    expect(validateTransaction({ ...ok, amountCents: 0 }, accts)).toContain('amount_invalid');
    expect(validateTransaction({ ...ok, amountCents: 1.5 }, accts)).toContain('amount_invalid');
  });
  it('checks transfers', () => {
    expect(validateTransaction({ ...ok, type: 'transfer' }, accts)).toContain('transfer_needs_to');
    expect(validateTransaction({ ...ok, type: 'transfer', toAccountId: 'chq' }, accts)).toContain('transfer_same');
    expect(validateTransaction({ ...ok, type: 'transfer', toAccountId: 'inv' }, accts)).toEqual([]);
  });
  it('allows only transfers on investing accounts', () =>
    expect(validateTransaction({ ...ok, accountId: 'inv' }, accts)).toContain('investing_transfer_only'));
  it('checks split totals', () =>
    expect(validateTransaction({ ...ok, splits: [{ categoryId: 'a', amountCents: 50 }] }, accts)).toContain('split_mismatch'));
});
