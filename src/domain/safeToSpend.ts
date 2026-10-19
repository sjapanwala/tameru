// Safe-to-spend: the hero number.
//
//   safe = spendable balance now (chequing + cash, minus card balances owing if opted in)
//        + expected income until period end
//        − upcoming bills until period end
//        − remaining goal contributions this period
//        − buffer
//
// Ranges are read conservatively (income low, bills high); irregular income is left out.
// Pending generated transactions are not in balances yet, so they count as expected/upcoming.

import { balanceAsOf, cardOwing } from './ledger';
import { recurringOriginKey } from './materialise';
import { daysLeft, type Period } from './period';
import { occurrenceAmount, occurrences } from './recurrence';
import type { Account, Cents, Goal, Id, LocalDate, RecurringItem, Transaction } from './types';

export interface SafeToSpendInput {
  today: LocalDate;
  period: Period;
  accounts: readonly Account[];
  transactions: readonly Transaction[];
  recurring: readonly RecurringItem[];
  goals: readonly Goal[];
  goalContributions: Readonly<Record<Id, Cents>>; // planned per period
  subtractCardBalances: boolean;
  bufferCents: Cents;
}

export interface FlowLine {
  label: string;
  date: LocalDate;
  amountCents: Cents;
  recurringId?: Id;
  transactionId?: Id;
  accountId: Id;
}

export type Recovery =
  | { kind: 'pause_goal'; goalId: Id; amountCents: Cents }
  | { kind: 'move_bill'; recurringId: Id; date: LocalDate; amountCents: Cents }
  | { kind: 'ease_category'; amountCents: Cents }; // the UI names the category with most left

export interface SafeToSpend {
  safeCents: Cents;
  dailyCents: Cents; // per day for the rest of the period, 0 when safe ≤ 0
  daysLeft: number;
  breakdown: {
    spendableCents: Cents;
    accounts: { accountId: Id; balanceCents: Cents }[];
    cardsOwingCents: Cents;
    incomeCents: Cents;
    incomeLines: FlowLine[];
    billsCents: Cents;
    billLines: FlowLine[];
    goalsCents: Cents;
    goalLines: { goalId: Id; plannedCents: Cents; contributedCents: Cents; remainingCents: Cents }[];
    bufferCents: Cents;
  };
  shortfallCents: Cents; // max(0, −safe)
  recovery?: Recovery;
}

const SPENDABLE = new Set(['chequing', 'cash']);

export function safeToSpend(i: SafeToSpendInput): SafeToSpend {
  const accById = new Map(i.accounts.map((a) => [a.id, a]));
  const live = i.accounts.filter((a) => !a.archived);
  const spendableAccounts = live.filter((a) => SPENDABLE.has(a.type));
  const accounts = spendableAccounts.map((a) => ({ accountId: a.id, balanceCents: balanceAsOf(a, i.transactions, i.today) }));
  const cardsOwingCents = i.subtractCardBalances
    ? live.filter((a) => a.type === 'credit_card').reduce((s, a) => s + cardOwing(balanceAsOf(a, i.transactions, i.today)), 0)
    : 0;
  const spendableCents = accounts.reduce((s, a) => s + a.balanceCents, 0) - cardsOwingCents;

  // Which accounts' flows affect the number: spendable ones, plus cards when card balances are subtracted.
  const affects = (accountId: Id) => {
    const acc = accById.get(accountId);
    if (!acc || acc.archived) return false; // removed accounts no longer move the number
    return SPENDABLE.has(acc.type) || (acc.type === 'credit_card' && i.subtractCardBalances);
  };

  const keys = new Map(i.transactions.filter((t) => t.originKey).map((t) => [t.originKey!, t]));
  const incomeLines: FlowLine[] = [];
  const billLines: FlowLine[] = [];

  for (const t of i.transactions) {
    if (t.status !== 'pending' || t.date > i.period.end || !affects(t.accountId)) continue;
    const label = t.merchant ?? i.recurring.find((r) => r.id === t.recurringId)?.name ?? '';
    const line = { label, date: t.date, amountCents: t.amountCents, transactionId: t.id, accountId: t.accountId, ...(t.recurringId ? { recurringId: t.recurringId } : {}) };
    if (t.type === 'income') incomeLines.push(line);
    else if (t.type === 'expense') billLines.push(line);
  }
  for (const item of i.recurring) {
    if (item.archived || !affects(item.defaultAccountId)) continue;
    for (const date of occurrences(item, i.today, i.period.end)) {
      if (keys.has(recurringOriginKey(item.id, date))) continue; // already recorded (posted, pending or skipped)
      const line = { label: item.name, date, amountCents: occurrenceAmount(item, 'conservative'), recurringId: item.id, accountId: item.defaultAccountId };
      (item.kind === 'income' ? incomeLines : billLines).push(line);
    }
  }
  incomeLines.sort((a, b) => a.date.localeCompare(b.date));
  billLines.sort((a, b) => a.date.localeCompare(b.date));
  const incomeCents = incomeLines.reduce((s, l) => s + l.amountCents, 0);
  const billsCents = billLines.reduce((s, l) => s + l.amountCents, 0);

  const goalLines = i.goals
    .filter((g) => !g.archived && (i.goalContributions[g.id] ?? 0) > 0)
    .map((g) => {
      const plannedCents = i.goalContributions[g.id] ?? 0;
      const contributedCents = goalContributedIn(g.id, i.transactions, i.period.start, i.period.end);
      return { goalId: g.id, plannedCents, contributedCents, remainingCents: Math.max(0, plannedCents - contributedCents) };
    });
  const goalsCents = goalLines.reduce((s, g) => s + g.remainingCents, 0);

  const safeCents = spendableCents + incomeCents - billsCents - goalsCents - i.bufferCents;
  const left = daysLeft(i.period, i.today);
  const shortfallCents = Math.max(0, -safeCents);
  const result: SafeToSpend = {
    safeCents,
    dailyCents: safeCents > 0 ? Math.floor(safeCents / left) : 0,
    daysLeft: left,
    breakdown: { spendableCents, accounts, cardsOwingCents, incomeCents, incomeLines, billsCents, billLines, goalsCents, goalLines, bufferCents: i.bufferCents },
    shortfallCents,
  };
  if (shortfallCents > 0) result.recovery = chooseRecovery(shortfallCents, goalLines, billLines);
  return result;
}

/**
 * One way forward when the number is negative. Least disruptive first:
 * pause a goal contribution that covers it, then move the bill that covers it
 * (the latest such bill, so it can shift past payday), then ease off flexible spending.
 */
function chooseRecovery(short: Cents, goals: SafeToSpend['breakdown']['goalLines'], bills: FlowLine[]): Recovery {
  const goal = [...goals].sort((a, b) => b.remainingCents - a.remainingCents).find((g) => g.remainingCents >= short);
  if (goal) return { kind: 'pause_goal', goalId: goal.goalId, amountCents: short };
  const bill = [...bills].filter((b) => b.recurringId && !b.transactionId && b.amountCents >= short).sort((a, b) => b.date.localeCompare(a.date))[0];
  if (bill) return { kind: 'move_bill', recurringId: bill.recurringId!, date: bill.date, amountCents: bill.amountCents };
  return { kind: 'ease_category', amountCents: short };
}

/** Goal-tagged transfers posted within [from, to]. */
export function goalContributedIn(goalId: Id, txs: readonly Transaction[], from: LocalDate, to: LocalDate): Cents {
  return txs
    .filter((t) => t.goalId === goalId && t.type === 'transfer' && t.status === 'posted' && t.date >= from && t.date <= to)
    .reduce((s, t) => s + t.amountCents, 0);
}
