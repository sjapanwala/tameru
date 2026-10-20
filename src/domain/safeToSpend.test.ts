import { describe, expect, it } from 'vitest';
import { account, recurring, tx } from '../../tests/factories';
import { safeToSpend, type SafeToSpendInput } from './safeToSpend';
import type { Goal } from './types';

const chq = account({ id: 'chq', openingBalanceCents: 100000, openingDate: '2026-01-01' });
const cash = account({ id: 'cash', type: 'cash', openingBalanceCents: 5000, openingDate: '2026-01-01' });
const sav = account({ id: 'sav', type: 'savings', openingBalanceCents: 500000, openingDate: '2026-01-01' });
const card = account({ id: 'card', type: 'credit_card', openingBalanceCents: -20000, openingDate: '2026-01-01' });
const goal: Goal = { id: 'g', createdAt: '', updatedAt: '', name: 'Trip', targetCents: 100000, startingProgressCents: 0, archived: false, accountId: 'sav' };

const base = (p: Partial<SafeToSpendInput> = {}): SafeToSpendInput => ({
  today: '2026-01-11',
  period: { start: '2026-01-01', end: '2026-01-31' },
  accounts: [chq, cash, sav, card],
  transactions: [],
  recurring: [],
  goals: [],
  goalContributions: {},
  subtractCardBalances: true,
  bufferCents: 5000,
  ...p,
});

describe('safeToSpend', () => {
  it('holds back what is still planned in categories', () => {
    const r = safeToSpend(
      base({
        categoriesLeft: [
          { categoryId: 'food', name: 'Groceries', remainingCents: 30000 },
          { categoryId: 'fun', name: 'Fun', remainingCents: -2000 }, // overspent: already out of the balance
        ],
      }),
    );
    expect(r.breakdown.plannedCents).toBe(30000);
    expect(r.breakdown.plannedLines).toEqual([{ categoryId: 'food', label: 'Groceries', amountCents: 30000 }]);
    expect(r.safeCents).toBe(85000 - 5000 - 30000);
  });
  it("doesn't count a category's upcoming bills twice", () => {
    const rent = recurring({ id: 'rent', schedule: { freq: 'monthly', day: 31 }, amount: { fixedCents: 95000 }, defaultAccountId: 'chq', categoryId: 'housing' });
    const r = safeToSpend(base({ recurring: [rent], categoriesLeft: [{ categoryId: 'housing', name: 'Housing', remainingCents: 100000 }] }));
    expect(r.breakdown.billsCents).toBe(95000);
    expect(r.breakdown.plannedCents).toBe(5000);
    expect(r.safeCents).toBe(85000 - 95000 - 5000 - 5000);
  });
  it('spendable = chequing + cash − card owing; savings excluded', () => {
    const r = safeToSpend(base());
    expect(r.breakdown.spendableCents).toBe(100000 + 5000 - 20000);
    expect(r.safeCents).toBe(85000 - 5000);
    expect(r.daysLeft).toBe(21);
    expect(r.dailyCents).toBe(Math.floor(80000 / 21));
  });
  it('card balances are optional', () => {
    expect(safeToSpend(base({ subtractCardBalances: false })).breakdown.spendableCents).toBe(105000);
  });
  it('adds expected income and subtracts bills to period end, conservatively', () => {
    const pay = recurring({ id: 'pay', name: 'Pay', kind: 'income', amount: { minCents: 70000, maxCents: 90000 }, schedule: { freq: 'biweekly', anchor: '2026-01-02' }, defaultAccountId: 'chq' });
    const rent = recurring({ id: 'rent', schedule: { freq: 'monthly', day: 31 }, amount: { fixedCents: 95000 }, defaultAccountId: 'chq' });
    const phone = recurring({ id: 'phone', name: 'Phone', schedule: { freq: 'monthly', day: 5 }, amount: { fixedCents: 4500 }, defaultAccountId: 'card' });
    const toSavings = recurring({ id: 'auto', name: 'Auto save', kind: 'income', schedule: { freq: 'monthly', day: 20 }, amount: { fixedCents: 1 }, defaultAccountId: 'sav' });
    const r = safeToSpend(base({ recurring: [pay, rent, phone, toSavings] }));
    expect(r.breakdown.incomeLines.map((l) => [l.date, l.amountCents])).toEqual([['2026-01-16', 70000], ['2026-01-30', 70000]]);
    expect(r.breakdown.billLines.map((l) => [l.label, l.date])).toEqual([['Rent', '2026-01-31']]); // phone on the 5th already passed
    expect(r.safeCents).toBe(85000 + 140000 - 95000 - 5000);
  });
  it('counts pending generated transactions once, and skips recorded occurrences', () => {
    const rent = recurring({ id: 'rent', schedule: { freq: 'monthly', day: 11 }, amount: { fixedCents: 95000 }, defaultAccountId: 'chq' });
    const pending = tx({ id: 'p', accountId: 'chq', amountCents: 95000, date: '2026-01-11', status: 'pending', originKey: 'rec:rent:2026-01-11', recurringId: 'rent' });
    const r = safeToSpend(base({ recurring: [rent], transactions: [pending] }));
    expect(r.breakdown.billsCents).toBe(95000);
    expect(r.breakdown.billLines[0]!.label).toBe('Rent');
    const posted = { ...pending, status: 'posted' as const };
    const r2 = safeToSpend(base({ recurring: [rent], transactions: [posted] }));
    expect(r2.breakdown.billsCents).toBe(0);
    expect(r2.breakdown.spendableCents).toBe(85000 - 95000);
  });
  it('subtracts remaining goal contributions only', () => {
    const contributed = tx({ type: 'transfer', accountId: 'chq', toAccountId: 'sav', amountCents: 3000, date: '2026-01-05', goalId: 'g' });
    const r = safeToSpend(base({ goals: [goal], goalContributions: { g: 10000 }, transactions: [contributed] }));
    expect(r.breakdown.goalLines[0]).toMatchObject({ plannedCents: 10000, contributedCents: 3000, remainingCents: 7000 });
    expect(r.breakdown.spendableCents).toBe(82000);
    expect(r.safeCents).toBe(82000 - 7000 - 5000);
  });
  it('a transfer to savings lowers spendable but is not spending', () => {
    const t = tx({ type: 'transfer', accountId: 'chq', toAccountId: 'sav', amountCents: 10000, date: '2026-01-05' });
    expect(safeToSpend(base({ transactions: [t] })).breakdown.spendableCents).toBe(75000);
  });
  it('is honest when negative and offers one recovery', () => {
    const rent = recurring({ id: 'rent', schedule: { freq: 'monthly', day: 28 }, amount: { fixedCents: 120000 }, defaultAccountId: 'chq' });
    const r = safeToSpend(base({ recurring: [rent] }));
    expect(r.safeCents).toBe(85000 - 120000 - 5000);
    expect(r.dailyCents).toBe(0);
    expect(r.shortfallCents).toBe(40000);
    expect(r.recovery).toEqual({ kind: 'move_bill', recurringId: 'rent', date: '2026-01-28', amountCents: 120000 });
    // A goal contribution that covers the gap is the gentlest fix.
    const withGoal = safeToSpend(base({ goals: [goal], goalContributions: { g: 100000 } }));
    expect(withGoal.safeCents).toBe(85000 - 100000 - 5000);
    expect(withGoal.recovery).toEqual({ kind: 'pause_goal', goalId: 'g', amountCents: 20000 });
    const small = safeToSpend(base({ bufferCents: 200000 }));
    expect(small.recovery).toEqual({ kind: 'ease_category', amountCents: 115000 });
  });
});

describe('removed accounts', () => {
  it('stop counting toward safe-to-spend, including their bills', () => {
    const gone = account({ id: 'old', openingBalanceCents: 50000, openingDate: '2026-01-01', archived: true });
    const bill = recurring({ id: 'b', schedule: { freq: 'monthly', day: 20 }, amount: { fixedCents: 9999 }, defaultAccountId: 'old' });
    const r = safeToSpend(base({ accounts: [chq, cash, sav, card, gone], recurring: [bill] }));
    expect(r.breakdown.spendableCents).toBe(85000);
    expect(r.breakdown.billsCents).toBe(0);
  });
});
