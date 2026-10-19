// Everything the Home screen shows, in one call.

import { safeToSpend, type SafeToSpend } from '../domain/safeToSpend';
import type { AppContext } from './context';
import { budgetsFor } from './plan';
import { upcoming } from './recurring';

export async function safeToSpendNow(ctx: AppContext): Promise<SafeToSpend> {
  const today = ctx.clock.today();
  const [{ plan, period }, accounts, transactions, recurring, goals, settings] = await Promise.all([
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
    subtractCardBalances: settings.subtractCardBalances,
    bufferCents: settings.bufferCents,
  });
}

export async function getHome(ctx: AppContext) {
  const [sts, budgets, next7, txs] = await Promise.all([safeToSpendNow(ctx), budgetsFor(ctx), upcoming(ctx, 7), ctx.repos.transactions.all()]);
  // For a negative number, name the flexible category with the most left (one concrete action).
  const easeCategory =
    sts.recovery?.kind === 'ease_category'
      ? [...budgets.rows].filter((r) => r.category.group !== 'essentials').sort((a, b) => b.budget.remainingCents - a.budget.remainingCents)[0]?.category
      : undefined;
  const recent = txs
    .filter((t) => t.status !== 'skipped' && t.date <= ctx.clock.today())
    .sort((a, b) => b.date.localeCompare(a.date) || (b.enteredAt ?? b.createdAt).localeCompare(a.enteredAt ?? a.createdAt))
    .slice(0, 5);
  return {
    sts,
    recent,
    easeCategory,
    period: budgets.period,
    rows: budgets.rows,
    overs: budgets.overs,
    upcoming: next7,
    pendingCount: txs.filter((t) => t.status === 'pending').length,
    reviewCount: txs.filter((t) => t.needsReview && t.status !== 'skipped').length,
  };
}
