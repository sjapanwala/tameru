import { describe, expect, it } from 'vitest';
import { account, tx } from '../../tests/factories';
import { analyseCard, cardFlows, dueFor, earlierClosing, lastClosing, shiftClosing, statementHistory, statementsToAsk, typicalMinimum } from './cardAnalysis';
import type { Account } from './types';

// Statement closes on the 5th, payment due on the 28th. In Tameru since Oct 6.
const visa = (over: Partial<Account> = {}): Account =>
  account({
    id: 'visa',
    type: 'credit_card',
    openingBalanceCents: -40000,
    openingDate: '2026-10-06',
    card: { monthlyFeeCents: 0, statementDay: 5, dueDay: 28, limitCents: 200000 },
    ...over,
  });

describe('card statement dates', () => {
  it('finds the last closing, strictly before today', () => {
    expect(lastClosing('2026-11-03', 5)).toBe('2026-10-05');
    expect(lastClosing('2026-11-05', 5)).toBe('2026-10-05');
    expect(lastClosing('2026-11-06', 5)).toBe('2026-11-05');
    expect(lastClosing('2026-03-01', 31)).toBe('2026-02-28');
  });
  it('steps closings by month, clamping short months', () => {
    expect(shiftClosing('2026-01-31', 31, 1)).toBe('2026-02-28');
    expect(shiftClosing('2026-01-05', 5, -1)).toBe('2025-12-05');
    expect(earlierClosing(['2026-09-05', '2026-08-05'], 5)).toBe('2026-07-05');
  });
  it('dates the payment after the statement closes', () => {
    expect(dueFor('2026-10-05', 28)).toBe('2026-10-28');
    expect(dueFor('2026-10-25', 15)).toBe('2026-11-15');
    expect(dueFor('2026-12-20', 10)).toBe('2027-01-10');
  });
  it('uses a typical minimum of $10 or 3%', () => {
    expect(typicalMinimum(0)).toBe(0);
    expect(typicalMinimum(500)).toBe(500);
    expect(typicalMinimum(20000)).toBe(1000);
    expect(typicalMinimum(100000)).toBe(3000);
  });
});

describe('card flows', () => {
  it('splits charges (less refunds) from payments', () => {
    const a = visa();
    const txs = [
      tx({ accountId: 'visa', amountCents: 5000, date: '2026-10-10' }),
      tx({ accountId: 'visa', type: 'refund', amountCents: 1000, date: '2026-10-11' }),
      tx({ type: 'transfer', accountId: 'chq', toAccountId: 'visa', amountCents: 40000, date: '2026-10-20' }),
      tx({ accountId: 'visa', amountCents: 999, date: '2026-10-21', status: 'pending' }),
    ];
    expect(cardFlows(a, txs, '2026-10-05', '2026-11-05')).toEqual({ charges: 4000, payments: 40000 });
  });
});

describe('statement history', () => {
  it('merges entered statements with tracked ones and fills in charges', () => {
    const a = visa({
      card: {
        monthlyFeeCents: 0,
        statementDay: 5,
        dueDay: 28,
        statements: [
          { closingDate: '2026-08-05', balanceCents: 30000, minimumCents: 1000, paidCents: 30000 },
          { closingDate: '2026-09-05', balanceCents: 45000, minimumCents: 1350, paidCents: 20000 },
        ],
      },
    });
    const txs = [
      tx({ accountId: 'visa', amountCents: 6000, date: '2026-10-12' }),
      tx({ type: 'transfer', accountId: 'chq', toAccountId: 'visa', amountCents: 10000, date: '2026-10-20' }),
      tx({ accountId: 'visa', amountCents: 2000, date: '2026-11-07' }),
    ];
    const h = statementHistory(a, txs, '2026-11-10');
    expect(h.map((s) => [s.closingDate, s.source])).toEqual([
      ['2026-08-05', 'entered'],
      ['2026-09-05', 'entered'],
      ['2026-11-05', 'tracked'],
    ]);
    expect(h[0]!.paidInFull).toBe(true);
    expect(h[1]!.paidInFull).toBe(false);
    expect(h[1]!.chargesCents).toBe(45000); // 450 owing, and nothing left over from August (paid in full)
    // November: 400 opening + 60 charged − 100 paid
    expect(h[2]!.balanceCents).toBe(36000);
    expect(h[2]!.minimumEstimated).toBe(true);
    expect(h[2]!.minimumCents).toBe(1080); // 3%, learned from the entered statements
  });
  it('leaves what was paid unknown for statements before the card was in Tameru', () => {
    const a = visa({ card: { monthlyFeeCents: 0, statementDay: 5, dueDay: 28, statements: [{ closingDate: '2026-09-05', balanceCents: 30000 }] } });
    const h = statementHistory(a, [], '2026-11-03');
    expect(h).toHaveLength(1);
    expect(h[0]!.paidCents).toBeUndefined();
    expect(h[0]!.paidInFull).toBeUndefined();
  });
});

describe('card analysis', () => {
  it('reports the cycle, the payment left, credit use and the outlook', () => {
    const a = visa({ openingDate: '2026-09-20', card: { monthlyFeeCents: 0, statementDay: 5, dueDay: 28, limitCents: 200000, aprBps: 2099 } });
    const txs = [
      tx({ accountId: 'visa', amountCents: 10000, date: '2026-10-01' }),
      tx({ type: 'transfer', accountId: 'chq', toAccountId: 'visa', amountCents: 20000, date: '2026-10-15' }),
      tx({ accountId: 'visa', amountCents: 14000, date: '2026-10-19' }),
    ];
    const r = analyseCard(a, txs, '2026-10-19')!;
    expect(r.owingCents).toBe(44000);
    expect(r.cycle).toMatchObject({ start: '2026-10-06', closes: '2026-11-05', days: 31, dayOf: 14, daysLeft: 17, chargesCents: 14000, paymentsCents: 20000 });
    // The Oct 5 statement: 500 owing, 200 paid since
    expect(r.payment).toMatchObject({ dueDate: '2026-10-28', daysToDue: 9, leftToPayCents: 30000, past: false });
    expect(r.use).toBeCloseTo(0.22);
    expect(r.availableCents).toBe(156000);
    expect(r.outlook.projectedChargesCents).toBe(17000); // $10 a day for 17 more days
    expect(r.outlook.projectedStatementCents).toBe(61000);
    expect(r.outlook.interestIfCarriedCents).toBe(Math.round((61000 * 2099) / 10000 / 12));
    expect(r.missing).toEqual({ limit: false, apr: false, statements: 2 });
  });
  it('asks for the statements from before the card was in Tameru', () => {
    expect(statementsToAsk(visa(), '2026-11-03')).toEqual(['2026-10-05', '2026-09-05', '2026-08-05']);
    const later = visa({ openingDate: '2026-09-20' });
    expect(statementsToAsk(later, '2026-11-03')).toEqual(['2026-09-05', '2026-08-05', '2026-07-05']);
    expect(analyseCard(visa(), [], '2026-11-03')!.missing).toEqual({ limit: false, apr: true, statements: 3 });
  });
});
