import { addDays } from './dates';
import { occurrenceKey, occurrencesOf, signedAmount } from './recurring';
import { isVariableSpend } from './safeToSpend';
import type { ISODate, Recurring, Transaction } from './types';

export interface ForecastEvent {
  name: string;
  /** Signed: negative leaves the account. */
  amountCents: number;
  kind: 'bill' | 'income' | 'what-if';
}

export interface ForecastPoint {
  date: ISODate;
  /** Balance at the end of this day. */
  balanceCents: number;
  events: ForecastEvent[];
}

export interface Forecast {
  points: ForecastPoint[];
  lowest: ForecastPoint;
  endBalanceCents: number;
}

export interface WhatIf {
  name: string;
  date: ISODate;
  /** Signed: a purchase is negative. */
  amountCents: number;
}

export interface ForecastInput {
  today: ISODate;
  /** Horizon in days; the result has days + 1 points (today included). */
  days: number;
  /** Balance right now. */
  balanceCents: number;
  recurring: readonly Recurring[];
  /** Occurrences already recorded as transactions (see paidKeys); they're in the balance. */
  paid?: ReadonlySet<string>;
  /** Assumed everyday spending per day, applied from tomorrow. */
  dailySpendCents?: number;
  whatIf?: readonly WhatIf[];
}

/** Project the balance day by day from recurring items, typical spending and what-ifs. */
export function forecast(input: ForecastInput): Forecast {
  const { today, days, recurring, paid, dailySpendCents = 0, whatIf = [] } = input;
  const end = addDays(today, days);

  const eventsByDate = new Map<ISODate, ForecastEvent[]>();
  const add = (date: ISODate, event: ForecastEvent) => {
    const list = eventsByDate.get(date);
    if (list) list.push(event);
    else eventsByDate.set(date, [event]);
  };
  for (const { recurring: item, date } of occurrencesOf(recurring, today, end)) {
    if (paid?.has(occurrenceKey(item.id, date))) continue;
    add(date, { name: item.name, amountCents: signedAmount(item), kind: item.kind });
  }
  for (const item of whatIf) {
    if (item.date >= today && item.date <= end && item.amountCents !== 0) {
      add(item.date, { name: item.name, amountCents: item.amountCents, kind: 'what-if' });
    }
  }

  const points: ForecastPoint[] = [];
  let balanceCents = input.balanceCents;
  for (let i = 0; i <= days; i++) {
    const date = addDays(today, i);
    const events = eventsByDate.get(date) ?? [];
    for (const event of events) balanceCents += event.amountCents;
    if (i > 0) balanceCents -= dailySpendCents;
    points.push({ date, balanceCents, events });
  }

  const lowest = points.reduce((low, point) =>
    point.balanceCents < low.balanceCents ? point : low,
  );
  return { points, lowest, endBalanceCents: balanceCents };
}

/** Average variable spend per day over the `windowDays` ending today. */
export function averageDailySpend(
  transactions: readonly Pick<Transaction, 'date' | 'amountCents' | 'recurringId'>[],
  today: ISODate,
  windowDays = 30,
): number {
  const from = addDays(today, -(windowDays - 1));
  const total = transactions
    .filter((tx) => tx.date >= from && tx.date <= today && isVariableSpend(tx))
    .reduce((sum, tx) => sum - tx.amountCents, 0);
  return Math.round(total / windowDays);
}

/** Balance right now: starting balances plus every recorded transaction. */
export function currentBalance(
  accounts: readonly { startingBalanceCents: number }[],
  transactions: readonly { amountCents: number }[],
): number {
  return (
    accounts.reduce((sum, account) => sum + account.startingBalanceCents, 0) +
    transactions.reduce((sum, tx) => sum + tx.amountCents, 0)
  );
}

/** Accounts whose money is there to be spent day to day. */
export const isSpendable = (account: { type: string }) =>
  account.type === 'chequing' || account.type === 'cash';

/**
 * Balance available for everyday spending: chequing and cash only. Savings,
 * investments and card debt are tracked but don't move the forecast.
 */
export function spendableBalance(
  accounts: readonly { id: string; type: string; startingBalanceCents: number }[],
  transactions: readonly { accountId: string; amountCents: number }[],
): number {
  const spendable = accounts.filter(isSpendable);
  const ids = new Set(spendable.map((account) => account.id));
  return currentBalance(
    spendable,
    transactions.filter((tx) => ids.has(tx.accountId)),
  );
}
