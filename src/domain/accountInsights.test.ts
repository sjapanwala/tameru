import { describe, expect, it } from 'vitest';
import { account, tx } from '../../tests/factories';
import { balanceTrend, cardDates, creditUsed, monthFlows, nextDayOfMonth, nextInterestDate, sparkPath, yearContributions } from './accountInsights';

const chq = account({ id: 'chq', openingBalanceCents: 100000, openingDate: '2026-01-01' });

describe('account insights', () => {
  it('finds the next day of the month, clamping short months', () => {
    expect(nextDayOfMonth('2026-01-10', 28)).toBe('2026-01-28');
    expect(nextDayOfMonth('2026-01-28', 28)).toBe('2026-01-28');
    expect(nextDayOfMonth('2026-01-29', 28)).toBe('2026-02-28');
    expect(nextDayOfMonth('2026-02-01', 31)).toBe('2026-02-28');
    expect(nextDayOfMonth('2026-12-20', 5)).toBe('2027-01-05');
  });
  it('trends the balance and reports the change', () => {
    const txs = [tx({ accountId: 'chq', amountCents: 5000, date: '2026-01-20' }), tx({ accountId: 'chq', type: 'income', amountCents: 20000, date: '2026-01-25' })];
    const t = balanceTrend(chq, txs, '2026-01-30', 30);
    expect(t.days).toBe(30);
    expect(t.series[0]!.balanceCents).toBe(100000);
    expect(t.changeCents).toBe(15000);
    expect(balanceTrend({ ...chq, openingDate: '2026-01-28' }, txs, '2026-01-30').days).toBe(3);
  });
  it('totals money in and out this month, including transfers', () => {
    const txs = [
      tx({ accountId: 'chq', amountCents: 1000, date: '2026-02-03' }),
      tx({ accountId: 'chq', type: 'income', amountCents: 50000, date: '2026-02-05' }),
      tx({ accountId: 'sav', type: 'transfer', toAccountId: 'chq', amountCents: 2000, date: '2026-02-06' }),
      tx({ accountId: 'chq', amountCents: 999, date: '2026-01-31' }),
      tx({ accountId: 'chq', amountCents: 777, date: '2026-02-07', status: 'pending' }),
    ];
    expect(monthFlows(chq, txs, '2026-02-10')).toEqual({ inCents: 52000, outCents: 1000 });
  });
  it('counts this year’s investing contributions', () => {
    const inv = account({ id: 'inv', type: 'investing', openingDate: '2025-01-01' });
    const txs = [
      tx({ type: 'transfer', accountId: 'chq', toAccountId: 'inv', amountCents: 5000, date: '2026-03-01' }),
      tx({ type: 'transfer', accountId: 'inv', toAccountId: 'chq', amountCents: 1000, date: '2026-04-01' }),
      tx({ type: 'transfer', accountId: 'chq', toAccountId: 'inv', amountCents: 9999, date: '2025-12-31' }),
    ];
    expect(yearContributions(inv, txs, '2026-06-01')).toBe(4000);
  });
  it('card dates and credit use', () => {
    const card = account({ id: 'c', type: 'credit_card', openingBalanceCents: -25000, openingDate: '2026-01-01', card: { monthlyFeeCents: 0, statementDay: 5, dueDay: 28, limitCents: 100000 } });
    expect(cardDates(card, '2026-01-20')).toEqual({ statement: '2026-02-05', due: '2026-01-28', daysToDue: 8 });
    expect(creditUsed(card, [], '2026-01-20')).toBe(0.25);
    expect(creditUsed({ ...card, card: { ...card.card!, limitCents: undefined } }, [], '2026-01-20')).toBeUndefined();
  });
  it('next interest payment', () => {
    const sav = account({ type: 'savings', interest: { rateBps: 300, kind: 'apy', compounding: 'quarterly' } });
    expect(nextInterestDate(sav, '2026-04-10')).toBe('2026-06-30');
  });
  it('draws a sparkline path', () => {
    const p = sparkPath([1, 3, 2], 100, 20);
    expect(p.line.startsWith('M0.0,')).toBe(true);
    expect(p.area.endsWith('Z')).toBe(true);
    expect(sparkPath([], 100, 20)).toEqual({ line: '', area: '' });
  });
});
