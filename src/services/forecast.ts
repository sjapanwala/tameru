// Forecast and end-of-period outlook from current data.

import { isBudgetCategory } from '../domain/defaults';
import { estimateDiscretionary, forecast, periodOutlook } from '../domain/forecast';
import { periodLength } from '../domain/period';
import type { Id } from '../domain/types';
import type { AppContext } from './context';
import { periodContext } from './plan';

export async function discretionaryEstimate(ctx: AppContext) {
  const [{ plan, period }, txs, accounts, cats, settings] = await Promise.all([
    periodContext(ctx),
    ctx.repos.transactions.all(),
    ctx.repos.accounts.all(),
    ctx.repos.categories.all(),
    ctx.repos.settings.get(),
  ]);
  const flexible: Record<Id, number> = {};
  for (const c of cats) if (isBudgetCategory(c) && c.id !== 'cat_bills' && !c.isBuffer) flexible[c.id] = plan.templateAllocations[c.id] ?? 0;
  const spending = accounts.find((a) => a.type === 'chequing' && !a.archived) ?? accounts.find((a) => !a.archived && a.type !== 'investing');
  return estimateDiscretionary({
    today: ctx.clock.today(),
    transactions: txs,
    planFlexible: { perCategory: flexible, periodDays: periodLength(period) },
    ...(settings.habitWeeklyCents ? { habitsWeekly: settings.habitWeeklyCents } : {}),
    ...(spending ? { fallbackAccountId: spending.id } : {}),
  });
}

export async function getForecast(ctx: AppContext, horizonDays: 30 | 60 | 90 = 30) {
  const [accounts, transactions, recurring, estimate, { period }] = await Promise.all([
    ctx.repos.accounts.all(),
    ctx.repos.transactions.all(),
    ctx.repos.recurring.all(),
    discretionaryEstimate(ctx),
    periodContext(ctx),
  ]);
  const today = ctx.clock.today();
  return {
    estimate,
    accounts: accounts.filter((a) => !a.archived),
    forecast: forecast({ today, horizonDays, accounts, transactions, recurring, estimate }),
    outlook: periodOutlook(period, today, transactions, recurring, estimate),
    period,
  };
}
