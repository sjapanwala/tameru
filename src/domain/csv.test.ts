import { describe, expect, it } from 'vitest';
import { account, category, tx } from '../../tests/factories';
import { csvToTransactions, parseCsv, toCsv, transactionsToCsv } from './csv';

describe('csv', () => {
  it('parses quotes, escaped quotes, CRLF and BOM', () => {
    expect(parseCsv('﻿a,"b, c","say ""hi"""\r\n1,2,3\n')).toEqual([['a', 'b, c', 'say "hi"'], ['1', '2', '3']]);
    expect(parseCsv('a,"multi\nline"\n')).toEqual([['a', 'multi\nline']]);
  });
  it('round-trips through toCsv', () => {
    const rows = [['x', 'a,b', 'q"q', '']];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
  it('exports and re-imports transactions', () => {
    const a = [account({ id: 'chq', name: 'Chequing' }), account({ id: 'sav', name: 'Savings', type: 'savings' })];
    const c = [category({ id: 'g', name: 'Groceries' }), category({ id: 'd', name: 'Eating out' })];
    const txs = [
      tx({ accountId: 'chq', categoryId: 'g', amountCents: 1234, merchant: 'Loblaws, Inc', note: 'weekly' }),
      tx({ type: 'transfer', accountId: 'chq', toAccountId: 'sav', amountCents: 5000, date: '2026-01-11' }),
      tx({ accountId: 'chq', amountCents: 1000, date: '2026-01-12', splits: [{ categoryId: 'g', amountCents: 700 }, { categoryId: 'd', amountCents: 300 }] }),
    ];
    const res = csvToTransactions(transactionsToCsv(txs, a, c), a, c);
    expect(res.skipped).toEqual([]);
    expect(res.drafts).toEqual([
      { type: 'expense', amountCents: 1234, date: '2026-01-10', accountId: 'chq', status: 'posted', categoryId: 'g', merchant: 'Loblaws, Inc', note: 'weekly' },
      { type: 'transfer', amountCents: 5000, date: '2026-01-11', accountId: 'chq', toAccountId: 'sav', status: 'posted' },
      { type: 'expense', amountCents: 1000, date: '2026-01-12', accountId: 'chq', status: 'posted', splits: [{ categoryId: 'g', amountCents: 700 }, { categoryId: 'd', amountCents: 300 }] },
    ]);
  });
  it('reads a bank-style file with signed amounts', () => {
    const res = csvToTransactions('Date,Description,Amount\n2026-02-01,TIM HORTONS #123,-4.50\n2026-02-02,PAYROLL,900\nbad,x,1\n', [], [], 'chq');
    expect(res.drafts.map((d) => [d.type, d.amountCents])).toEqual([['expense', 450], ['income', 90000]]);
    expect(res.skipped).toEqual([{ line: 4, reason: 'date' }]);
  });
});
