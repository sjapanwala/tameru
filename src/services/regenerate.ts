// Re-run the plan generator against current data (Plan screen "regenerate"),
// and re-size only the affected goal contributions when a goal is edited.

import { categoryId, isBudgetCategory } from '../domain/defaults';
import { goalProgress } from '../domain/goals';
import { periodLength } from '../domain/period';
import { generatePlan, regenerateGoals, scaleToPeriod, type GeneratedPlan, type GeneratorInput } from '../domain/planGenerator';
import { DEFAULT_HABITS_WEEKLY, HABIT_KEYS } from '../domain/onboarding';
import { monthlyEquivalent } from '../domain/recurrence';
import type { Cents, Id } from '../domain/types';
import type { AppContext } from './context';
import { discretionaryEstimate } from './forecast';
import { periodContext, savePlan } from './plan';

async function inputFromData(ctx: AppContext): Promise<{ input: GeneratorInput; periodDays: number }> {
  const today = ctx.clock.today();
  const [{ period }, recurring, goals, txs, cats, settings, estimate] = await Promise.all([
    periodContext(ctx),
    ctx.repos.recurring.all(),
    ctx.repos.goals.all(),
    ctx.repos.transactions.all(),
    ctx.repos.categories.all(),
    ctx.repos.settings.get(),
    discretionaryEstimate(ctx),
  ]);
  const live = recurring.filter((r) => !r.archived);
  const bills = live.filter((r) => r.kind !== 'income');
  const flexible = cats.filter((c) => isBudgetCategory(c) && c.id !== categoryId('bills') && !c.isBuffer);
  const habitsWeekly: GeneratorInput['habitsWeekly'] = {};
  const defaults: Record<Id, Cents> = Object.fromEntries(HABIT_KEYS.map((k) => [categoryId(k), DEFAULT_HABITS_WEEKLY[k]]));
  for (const c of flexible) {
    // Real recent spending beats what was said in onboarding.
    habitsWeekly[c.id] =
      estimate.source === 'history' ? Math.round((estimate.perCategoryDaily[c.id] ?? 0) * 7) : settings.habitWeeklyCents?.[c.id];
  }
  return {
    periodDays: periodLength(period),
    input: {
      today,
      incomeMonthlyCents: live.filter((r) => r.kind === 'income').reduce((s, r) => s + monthlyEquivalent(r, 'conservative'), 0),
      billsMonthlyCents: bills.reduce((s, r) => s + monthlyEquivalent(r, 'conservative'), 0),
      billCount: bills.length,
      billsCategoryId: categoryId('bills'),
      fundCategoryId: cats.find((c) => c.isBuffer)?.id ?? categoryId('irregular'),
      habitsWeekly,
      defaultHabitsWeekly: defaults,
      goals: goals
        .filter((g) => !g.archived)
        .map((g) => ({ id: g.id, targetCents: g.targetCents || undefined, progressCents: goalProgress(g, txs, today).progressCents, ...(g.targetDate ? { targetDate: g.targetDate } : {}) })),
    },
  };
}

const MONTH_DAYS = 365 / 12;

/** A fresh recommendation for the current period length (not saved). */
export async function recommendPlan(ctx: AppContext): Promise<GeneratedPlan> {
  const { input, periodDays } = await inputFromData(ctx);
  const monthly = generatePlan(input);
  if (Math.abs(periodDays - MONTH_DAYS) < 3) return monthly;
  return { ...monthly, allocations: scaleToPeriod(monthly.allocations, periodDays), goalContributions: scaleToPeriod(monthly.goalContributions, periodDays) };
}

export async function acceptPlan(ctx: AppContext, plan: Pick<GeneratedPlan, 'allocations' | 'goalContributions' | 'reasons'>): Promise<void> {
  const { plan: cur } = await periodContext(ctx);
  await savePlan(ctx, { ...cur, templateAllocations: plan.allocations, goalContributions: plan.goalContributions, reasons: plan.reasons }, { source: 'regenerate' });
}

/** After a goal edit: re-size just these goals' contributions, keep everything else. */
export async function resizeGoals(ctx: AppContext, goalIds: Id[]) {
  const { input, periodDays } = await inputFromData(ctx);
  const { plan } = await periodContext(ctx);
  const toMonthly = Math.abs(periodDays - MONTH_DAYS) < 3 ? 1 : MONTH_DAYS / periodDays;
  const scale = (r: Record<Id, Cents>, f: number) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Math.round(v * f)]));
  const r = regenerateGoals(input, scale(plan.templateAllocations, toMonthly), scale(plan.goalContributions, toMonthly), goalIds);
  const goalContributions = scale(r.goalContributions, 1 / toMonthly);
  await savePlan(ctx, { ...plan, goalContributions, reasons: { ...plan.reasons, ...r.reasons } }, { source: 'goal_edit', goalIds });
  return { goalContributions, flags: r.flags };
}
