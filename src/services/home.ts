// Everything the Home screen shows, in one call.

import { spendingWeights, spentToday, splitByWeight } from '../domain/cardSplit';
import { safeToSpend, type SafeToSpend } from '../domain/safeToSpend';
import type { Account, Cents, Id } from '../domain/types';
import type { AppContext } from './context';
import { hasNewAttention } from './attention';
import { budgetsFor } from './plan';
import { upcoming } from './recurring';

export async function safeToSpendNow(ctx: AppContext): Promise<SafeToSpend> {
  const today = ctx.clock.today();
  const [{ plan, period, rows }, accounts, transactions, recurring, goals, settings] = await Promise.all([
    budgetsFor(ctx),
    ctx.repos.accounts.all(),
    ctx.repos.transactions.all(),
    ctx.repos.recurring.all(),
    ctx.repos.goals.all(),
    ctx.repos.settings.get(),
  ]);
  return safeToSpend({
    today,
    period,
    accounts,
    transactions,
    recurring,
    goals,
    goalContributions: plan.goalContributions,
    categoriesLeft: rows.map((r) => ({ categoryId: r.category.id, name: r.category.name, remainingCents: r.budget.remainingCents })),
    subtractCardBalances: settings.subtractCardBalances,
    bufferCents: settings.bufferCents,
  });
}

/** The cards in Home's stack: open credit cards and chequing (debit) accounts. */
export const isCard = (a: Account) => !a.archived && (a.type === 'credit_card' || a.type === 'chequing');

export interface CardShare {
  safeTodayCents: Cents;
  leftCents: Cents; // its share of what's left for the period
  spentTodayCents: Cents;
}

export async function getHome(ctx: AppContext) {
  const today = ctx.clock.today();
  const [sts, budgets, next7, txs, accounts, attention] = await Promise.all([
    safeToSpendNow(ctx),
    budgetsFor(ctx),
    upcoming(ctx, 7),
    ctx.repos.transactions.all(),
    ctx.repos.accounts.all(),
    hasNewAttention(ctx),
  ]);
  // For a negative number, name the flexible category with the most left (one concrete action).
  const easeCategory =
    sts.recovery?.kind === 'ease_category'
      ? [...budgets.rows].filter((r) => r.category.group !== 'essentials').sort((a, b) => b.budget.remainingCents - a.budget.remainingCents)[0]?.category
      : undefined;
  // Newest first; Home filters it by the card on top of the stack.
  const recent = txs
    .filter((t) => t.status !== 'skipped' && t.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date) || (b.enteredAt ?? b.createdAt).localeCompare(a.enteredAt ?? a.createdAt))
    .slice(0, 200);
  // Today's share (the daily figure, or the shortfall once the period is over), and the
  // period's, split across the cards by where the last 30 days' spending went.
  const safeTodayCents = sts.safeCents < 0 ? sts.safeCents : sts.dailyCents;
  const cardIds = accounts.filter((a) => isCard(a)).map((a) => a.id);
  const weights = spendingWeights(cardIds, txs, today);
  const todayBy = splitByWeight(safeTodayCents, weights);
  const leftBy = splitByWeight(sts.safeCents, weights);
  const spentBy = spentToday(cardIds, txs, today);
  const perCard: Record<Id, CardShare> = Object.fromEntries(
    cardIds.map((id) => [id, { safeTodayCents: todayBy[id]!, leftCents: leftBy[id]!, spentTodayCents: spentBy[id]! }]),
  );
  // Spending posted today, less refunds: what today's share of safe-to-spend has gone on.
  const spentTodayCents = txs
    .filter((t) => t.status === 'posted' && t.date === today && (t.type === 'expense' || t.type === 'refund'))
    .reduce((s, t) => s + (t.type === 'expense' ? t.amountCents : -t.amountCents), 0);
  return {
    sts,
    recent,
    safeTodayCents,
    perCard,
    spentTodayCents: Math.max(0, spentTodayCents),
    easeCategory,
    period: budgets.period,
    rows: budgets.rows,
    overs: budgets.overs,
    upcoming: next7,
    pendingCount: txs.filter((t) => t.status === 'pending').length,
    attention, // something new since Upcoming was last opened: lights the bell
    reviewCount: txs.filter((t) => t.needsReview && t.status !== 'skipped').length,
  };
}
