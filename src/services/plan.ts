// Plan, periods and category budgets.

import { budgetHistory, type CategoryBudget } from '../domain/budgets';
import { isBudgetCategory } from '../domain/defaults';
import { daysElapsed, daysLeft, periodFor, periodsBetween, type Period } from '../domain/period';
import { coverOptions, type CoverOption } from '../domain/reabsorb';
import type { BudgetBehaviour, Category, Cents, EventType, Id, Plan, Schedule } from '../domain/types';
import { nowIso, stamp, type AppContext } from './context';

export async function logEvent(ctx: AppContext, type: EventType, payload: Record<string, unknown>): Promise<void> {
  await ctx.repos.events.put({ id: ctx.newId(), at: nowIso(ctx), date: ctx.clock.today(), type, payload });
}

/** The active plan; created with defaults (calendar months, nothing allocated) on first use. */
export async function getPlan(ctx: AppContext): Promise<Plan> {
  const existing = (await ctx.repos.plans.all())[0];
  if (existing) return existing;
  const period = periodFor({ kind: 'monthly', startDay: 1 }, ctx.clock.today());
  const plan: Plan = stamp(ctx, { period: { kind: 'monthly', startDay: 1 } as const, startDate: period.start, templateAllocations: {}, goalContributions: {} });
  await ctx.repos.plans.put(plan);
  return plan;
}

export async function savePlan(ctx: AppContext, plan: Plan, change: Record<string, unknown>): Promise<Plan> {
  const next = stamp(ctx, plan);
  await ctx.repos.plans.put(next);
  await logEvent(ctx, 'plan_changed', change);
  return next;
}

async function paySchedule(ctx: AppContext, plan: Plan): Promise<Schedule | undefined> {
  if (plan.period.kind !== 'payday') return undefined;
  return (await ctx.repos.recurring.get(plan.period.recurringId))?.schedule;
}

export async function periodContext(ctx: AppContext, date = ctx.clock.today()) {
  const plan = await getPlan(ctx);
  const schedule = await paySchedule(ctx, plan);
  return { plan, schedule, period: periodFor(plan.period, date, schedule) };
}

export const currentPeriod = async (ctx: AppContext): Promise<Period> => (await periodContext(ctx)).period;

export interface BudgetRow {
  category: Category;
  budget: CategoryBudget;
}

/** Category budgets for the period containing `date` (default today), remaining first. */
export async function budgetsFor(ctx: AppContext, date = ctx.clock.today()) {
  const { plan, schedule, period } = await periodContext(ctx, date);
  const [categories, allocations, moves, segments, transactions] = await Promise.all([
    ctx.repos.categories.all(),
    ctx.repos.allocations.all(),
    ctx.repos.budgetMoves.all(),
    ctx.repos.segments.all(),
    ctx.repos.transactions.all(),
  ]);
  const cats = categories.filter(isBudgetCategory).sort((a, b) => a.sortOrder - b.sortOrder);
  const overrides = new Map(allocations.map((a) => [`${a.periodStart}|${a.categoryId}`, a.amountCents]));
  const periods = periodsBetween(plan.period, plan.startDate < period.start ? plan.startDate : period.start, period.start, schedule);
  const history = budgetHistory({
    categories: cats,
    periods,
    allocationFor: (cid, start) => overrides.get(`${start}|${cid}`) ?? plan.templateAllocations[cid] ?? 0,
    moves,
    segments,
    transactions,
  });
  const budgets = history.get(period.start)!;
  const today = ctx.clock.today();
  const elapsed = daysElapsed(period, today);
  const left = daysLeft(period, today);
  const rows: BudgetRow[] = cats.map((category) => ({ category, budget: budgets.get(category.id)! }));
  const overs = rows
    .filter((r) => r.budget.overCents > 0)
    .map((r) => ({ categoryId: r.category.id, overCents: r.budget.overCents, options: coverOptions(r.category.id, budgets, cats, elapsed, left) }));
  return { plan, period, rows, overs, history };
}

export async function setAllocation(ctx: AppContext, categoryId: Id, amountCents: Cents, scope: 'plan' | 'thisPeriod' = 'plan'): Promise<void> {
  const plan = await getPlan(ctx);
  if (scope === 'plan') {
    const from = plan.templateAllocations[categoryId] ?? 0;
    await savePlan(ctx, { ...plan, templateAllocations: { ...plan.templateAllocations, [categoryId]: amountCents } }, { categoryId, from, to: amountCents });
    return;
  }
  const period = await currentPeriod(ctx);
  const existing = (await ctx.repos.allocations.all()).find((a) => a.periodStart === period.start && a.categoryId === categoryId);
  await ctx.repos.allocations.put(stamp(ctx, { ...(existing ?? {}), periodStart: period.start, categoryId, amountCents }));
  await logEvent(ctx, 'plan_changed', { categoryId, periodStart: period.start, to: amountCents });
}

/** Apply the cover option the user picked. 'leave' records the choice and changes nothing. */
export async function applyCover(ctx: AppContext, overCategoryId: Id, option: CoverOption): Promise<void> {
  if (option.kind === 'leave' || option.amountCents <= 0) return;
  const period = await currentPeriod(ctx);
  await ctx.repos.budgetMoves.put(
    stamp(ctx, {
      periodStart: period.start,
      fromCategoryId: option.kind === 'next_period' ? ('next_period' as const) : option.fromCategoryId,
      toCategoryId: overCategoryId,
      amountCents: option.amountCents,
    }),
  );
}

export async function addCategory(ctx: AppContext, name: string, behaviour: BudgetBehaviour = 'reset', group: Category['group'] = 'lifestyle'): Promise<Category> {
  const cats = await ctx.repos.categories.all();
  const cat: Category = stamp(ctx, { name: name.trim(), group, behaviour, isBuffer: false, sortOrder: Math.max(0, ...cats.map((c) => c.sortOrder)) + 1, archived: false });
  await ctx.repos.categories.put(cat);
  return cat;
}

export async function updateCategory(ctx: AppContext, id: Id, patch: Partial<Pick<Category, 'name' | 'behaviour' | 'isBuffer' | 'archived' | 'group'>>): Promise<void> {
  const cur = await ctx.repos.categories.get(id);
  if (!cur) return;
  await ctx.repos.categories.put(stamp(ctx, { ...cur, ...patch }));
}

export async function setPeriodConfig(ctx: AppContext, period: Plan['period']): Promise<void> {
  const plan = await getPlan(ctx);
  // Restart tracking from the new period so earlier periods aren't re-cut.
  const schedule = period.kind === 'payday' ? (await ctx.repos.recurring.get(period.recurringId))?.schedule : undefined;
  const start = periodFor(period, ctx.clock.today(), schedule).start;
  await savePlan(ctx, { ...plan, period, startDate: start }, { period, startDate: start });
}
