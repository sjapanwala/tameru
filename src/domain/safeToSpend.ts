import { addDays, daysLeftInMonth, monthRange } from './dates';
import { occurrenceKey, occurrencesOf, recordedAmounts } from './recurring';
import type { Budget, Category, Goal, ISODate, Recurring, Transaction } from './types';

type Tx = Pick<
  Transaction,
  'date' | 'amountCents' | 'categoryId' | 'recurringId' | 'recurringDate'
>;

/** Spending that isn't the payment of a recurring bill. */
export const isVariableSpend = (tx: Pick<Tx, 'amountCents' | 'recurringId'>) =>
  tx.amountCents < 0 && !tx.recurringId;

export interface SafeToSpend {
  /**
   * Recurring income across the whole month: what actually arrived for
   * paydays already received, the planned amount for the rest.
   */
  incomeCents: number;
  /** Recurring bills across the whole month, paid or not. */
  billsCents: number;
  /** Monthly goal contributions. */
  goalsCents: number;
  /** Variable spend so far this month. */
  spentCents: number;
  /** income − bills − goals − spent. Negative when overspent. */
  remainingCents: number;
  /** Days left in the month, counting today. */
  daysLeft: number;
  /** remaining ÷ daysLeft, never below zero. */
  perDayCents: number;
  /** False until at least one recurring income exists; the number means little without it. */
  hasIncome: boolean;
}

/**
 * safeToSpendToday =
 *   (income this month, received or still expected − reserved bills − goal contributions − variable spend so far)
 *   ÷ days left in month
 */
export function safeToSpend(input: {
  today: ISODate;
  recurring: readonly Recurring[];
  goals: readonly Goal[];
  transactions: readonly Tx[];
}): SafeToSpend {
  const { start, end } = monthRange(input.today);
  let incomeCents = 0;
  let billsCents = 0;
  const received = recordedAmounts(input.transactions);
  for (const { recurring, date } of occurrencesOf(input.recurring, start, end)) {
    if (recurring.kind === 'income') {
      // A payday that has landed counts for what it really was.
      incomeCents += received.get(occurrenceKey(recurring.id, date)) ?? recurring.amountCents;
    } else {
      billsCents += recurring.amountCents;
    }
  }
  const goalsCents = input.goals.reduce((sum, goal) => sum + goal.monthlyContributionCents, 0);
  const spentCents = input.transactions
    .filter((tx) => tx.date >= start && tx.date <= end && isVariableSpend(tx))
    .reduce((sum, tx) => sum - tx.amountCents, 0);

  const remainingCents = incomeCents - billsCents - goalsCents - spentCents;
  const daysLeft = daysLeftInMonth(input.today);
  return {
    incomeCents,
    billsCents,
    goalsCents,
    spentCents,
    remainingCents,
    daysLeft,
    perDayCents: Math.max(0, Math.floor(remainingCents / daysLeft)),
    hasIncome: input.recurring.some((item) => item.kind === 'income'),
  };
}

export interface BudgetProgress {
  categoryId: string;
  name: string;
  budgetCents: number;
  spentCents: number;
  /** Negative when over budget. */
  leftCents: number;
  /** 0–1, capped, for drawing the bar. */
  fraction: number;
  over: boolean;
}

/** This month's spend against each budgeted category, in category order. */
export function budgetProgress(input: {
  today: ISODate;
  budgets: readonly Budget[];
  categories: readonly Category[];
  transactions: readonly Tx[];
}): BudgetProgress[] {
  const { start, end } = monthRange(input.today);
  const spent = new Map<string, number>();
  for (const tx of input.transactions) {
    if (tx.amountCents >= 0 || !tx.categoryId || tx.date < start || tx.date > end) continue;
    spent.set(tx.categoryId, (spent.get(tx.categoryId) ?? 0) - tx.amountCents);
  }
  const result: BudgetProgress[] = [];
  for (const category of input.categories) {
    const budget = input.budgets.find((b) => b.categoryId === category.id);
    if (!budget || budget.monthlyCents <= 0) continue;
    const spentCents = spent.get(category.id) ?? 0;
    result.push({
      categoryId: category.id,
      name: category.name,
      budgetCents: budget.monthlyCents,
      spentCents,
      leftCents: budget.monthlyCents - spentCents,
      fraction: Math.min(1, spentCents / budget.monthlyCents),
      over: spentCents > budget.monthlyCents,
    });
  }
  return result;
}

/** Variable spend for each day of the month containing `today` (index 0 = the 1st). */
export function dailySpend(transactions: readonly Tx[], today: ISODate): number[] {
  const { start, end } = monthRange(today);
  const days = new Array<number>(Number(end.slice(8))).fill(0);
  for (const tx of transactions) {
    if (tx.date < start || tx.date > end || !isVariableSpend(tx)) continue;
    days[Number(tx.date.slice(8)) - 1]! -= tx.amountCents;
  }
  return days;
}

export interface MonthComparison {
  /** First day of the previous month. */
  previousMonth: ISODate;
  /**
   * Variable spend so far this month minus last month's through the same
   * day. Positive means spending is running ahead of last month.
   */
  diffCents: number;
  /** False when there was nothing recorded last month to compare against. */
  hasPrevious: boolean;
}

export function compareToLastMonth(transactions: readonly Tx[], today: ISODate): MonthComparison {
  const { start } = monthRange(today);
  const previous = monthRange(addDays(start, -1));
  // Same day number, capped at the shorter month's end (Mar 31 -> Feb 28).
  const cutoffDay = today.slice(8) < previous.end.slice(8) ? today.slice(8) : previous.end.slice(8);
  const cutoff = `${previous.start.slice(0, 8)}${cutoffDay}`;
  let current = 0;
  let before = 0;
  let hasPrevious = false;
  for (const tx of transactions) {
    if (tx.date >= previous.start && tx.date <= previous.end) hasPrevious = true;
    if (!isVariableSpend(tx)) continue;
    if (tx.date >= start && tx.date <= today) current -= tx.amountCents;
    else if (tx.date >= previous.start && tx.date <= cutoff) before -= tx.amountCents;
  }
  return { previousMonth: previous.start, diffCents: current - before, hasPrevious };
}
