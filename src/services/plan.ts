// Plan, periods and category budgets.

import { budgetHistory, type CategoryBudget } from '../domain/budgets';
import { isBudgetCategory, nextCategoryColor, suggestionFor } from '../domain/defaults';
import { daysElapsed, daysLeft, periodFor, periodLength, periodsBetween, type Period } from '../domain/period';
import { billsByCategory, monthlyEquivalent } from '../domain/recurrence';
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

const MONTH_DAYS = 365 / 12;

/**
 * Income expected in a period of the current length, counting varying pay at its low
 * end (as the plan generator does). The Plan dial's 100%.
 */
export async function plannedIncome(ctx: AppContext): Promise<Cents> {
  const [{ period }, monthly] = await Promise.all([periodContext(ctx), monthlyIncome(ctx)]);
  const days = periodLength(period);
  return Math.abs(days - MONTH_DAYS) < 3 ? monthly : Math.round((monthly * days) / MONTH_DAYS);
}

/** Income in an average month, varying pay at its low end. What a bill's percentage is of. */
export async function monthlyIncome(ctx: AppContext): Promise<Cents> {
  const recurring = await ctx.repos.recurring.all();
  return recurring.filter((r) => !r.archived && r.kind === 'income').reduce((s, r) => s + monthlyEquivalent(r, 'conservative'), 0);
}

export const currentPeriod =async (ctx: AppContext): Promise<Period> => (await periodContext(ctx)).period;

/** A budget period the Plan's calendar can show: past ones with something recorded can be opened. */
export interface PlanPeriod extends Period {
  hasData: boolean; // a closed-period snapshot or any transaction in it (the current period always)
  current: boolean;
}

/** Every period from the first one with data (or the plan's start) up to the current one. */
export async function planPeriods(ctx: AppContext): Promise<{ kind: Plan['period']['kind']; periods: PlanPeriod[] }> {
  const { plan, schedule, period } = await periodContext(ctx);
  const [transactions, snapshots] = await Promise.all([ctx.repos.transactions.all(), ctx.repos.snapshots.all()]);
  const dates = transactions.filter((t) => t.status === 'posted').map((t) => t.date).sort();
  const closed = new Set(snapshots.map((x) => x.periodStart));
  const from = dates[0] && dates[0] < plan.startDate ? dates[0] : plan.startDate;
  let i = 0; // dates are sorted, and so are the periods: walk both once
  const periods = periodsBetween(plan.period, from < period.start ? from : period.start, period.start, schedule).map((p) => {
    while (i < dates.length && dates[i]! < p.start) i++;
    const current = p.start === period.start;
    return { ...p, current, hasData: current || closed.has(p.start) || (i < dates.length && dates[i]! <= p.end) };
  });
  return { kind: plan.period.kind, periods };
}

export interface BudgetRow {
  category: Category;
  budget: CategoryBudget;
}

/** Category budgets for the period containing `date` (default today), remaining first. */
export async function budgetsFor(ctx: AppContext, date = ctx.clock.today()) {
  const { plan, schedule, period } = await periodContext(ctx, date);
  const [categories, allocations, moves, segments, transactions, recurring] = await Promise.all([
    ctx.repos.categories.all(),
    ctx.repos.allocations.all(),
    ctx.repos.budgetMoves.all(),
    ctx.repos.segments.all(),
    ctx.repos.transactions.all(),
    ctx.repos.recurring.all(),
  ]);
  const cats = categories.filter(isBudgetCategory).sort((a, b) => a.sortOrder - b.sortOrder);
  const overrides = new Map(allocations.map((a) => [`${a.periodStart}|${a.categoryId}`, a.amountCents]));
  const periods = periodsBetween(plan.period, plan.startDate < period.start ? plan.startDate : period.start, period.start, schedule);
  // A category's plan always covers the bills and subscriptions due in it that period
  // (after a fresh start, only those still to come, as spending counts from there too).
  const restartOf = (start: string) => segments.filter((g) => g.periodStart === start).reduce<string | undefined>((m, g) => (!m || g.segmentStart > m ? g.segmentStart : m), undefined);
  const due = new Map(periods.map((p) => [p.start, billsByCategory(recurring, restartOf(p.start) ?? p.start, p.end)]));
  const history = budgetHistory({
    categories: cats,
    periods,
    allocationFor: (cid, start) => Math.max(overrides.get(`${start}|${cid}`) ?? plan.templateAllocations[cid] ?? 0, due.get(start)?.[cid] ?? 0),
    moves,
    segments,
    transactions,
  });
  const budgets = history.get(period.start)!;
  const today = ctx.clock.today();
  const elapsed = daysElapsed(period, today);
  const left = daysLeft(period, today);
  const rows: BudgetRow[] = cats.map((category) => ({ category, budget: budgets.get(category.id)! }));
  const handled = (await ctx.repos.settings.get()).coversHandled ?? {};
  const overs = rows
    .filter((r) => r.budget.overCents > (handled[`${period.start}|${r.category.id}`] ?? 0))
    .map((r) => ({ categoryId: r.category.id, overCents: r.budget.overCents, options: coverOptions(r.category.id, budgets, cats, elapsed, left) }));
  return { plan, period, rows, overs, history, due: due.get(period.start) ?? {} };
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

/**
 * Apply the cover option the user picked. Whatever is still over afterwards (all of it
 * for 'leave', the rest for a partial cover) is marked handled so the prompt goes away.
 */
export async function applyCover(ctx: AppContext, overCategoryId: Id, option: CoverOption): Promise<void> {
  const { period, rows } = await budgetsFor(ctx);
  const over = rows.find((r) => r.category.id === overCategoryId)?.budget.overCents ?? 0;
  const moved = option.kind === 'leave' ? 0 : Math.max(0, option.amountCents);
  const settings = await ctx.repos.settings.get();
  // Only the current period's entries matter; older ones are dropped as we go.
  const kept = Object.fromEntries(Object.entries(settings.coversHandled ?? {}).filter(([k]) => k.startsWith(`${period.start}|`)));
  await ctx.repos.settings.update({ coversHandled: { ...kept, [`${period.start}|${overCategoryId}`]: Math.max(0, over - moved) } });
  if (option.kind === 'leave' || moved <= 0) return;
  await ctx.repos.budgetMoves.put(
    stamp(ctx, {
      periodStart: period.start,
      fromCategoryId: option.kind === 'next_period' ? ('next_period' as const) : option.fromCategoryId,
      toCategoryId: overCategoryId,
      amountCents: option.amountCents,
    }),
  );
}

/** A new budget category. A suggested name brings its usual group and behaviour; the colour is the next free one unless given. */
export async function addCategory(ctx: AppContext, name: string, opts: { behaviour?: BudgetBehaviour; group?: Category['group']; color?: string } = {}): Promise<Category> {
  const cats = await ctx.repos.categories.all();
  const s = suggestionFor(name);
  const cat: Category = stamp(ctx, {
    name: name.trim(),
    group: opts.group ?? s?.group ?? 'lifestyle',
    behaviour: opts.behaviour ?? s?.behaviour ?? 'reset',
    isBuffer: false,
    sortOrder: Math.max(0, ...cats.map((c) => c.sortOrder)) + 1,
    archived: false,
    color: opts.color ?? nextCategoryColor(cats.filter(isBudgetCategory).map((c) => c.color)),
  });
  await ctx.repos.categories.put(cat);
  return cat;
}

export async function updateCategory(ctx: AppContext, id: Id, patch: Partial<Pick<Category, 'name' | 'behaviour' | 'isBuffer' | 'archived' | 'group' | 'color'>>): Promise<void> {
  const cur = await ctx.repos.categories.get(id);
  if (!cur) return;
  await ctx.repos.categories.put(stamp(ctx, { ...cur, ...patch }));
}

/** Active recurring items (bills, subscriptions) filed under a category; while any exist it can't be removed. */
export async function recurringUsing(ctx: AppContext, categoryId: Id): Promise<number> {
  return (await ctx.repos.recurring.all()).filter((r) => !r.archived && r.kind !== 'income' && r.categoryId === categoryId).length;
}

export class CategoryInUseError extends Error {
  constructor(readonly count: number) {
    super(`category used by ${count} recurring item(s)`);
  }
}

/** Remove (archive) a category and clear its allocation. Refused while recurring items still use it. */
export async function removeCategory(ctx: AppContext, id: Id): Promise<void> {
  const using = await recurringUsing(ctx, id);
  if (using > 0) throw new CategoryInUseError(using);
  await setAllocation(ctx, id, 0);
  await updateCategory(ctx, id, { archived: true });
}

export async function setPeriodConfig(ctx: AppContext, period: Plan['period']): Promise<void> {
  const plan = await getPlan(ctx);
  // Restart tracking from the new period so earlier periods aren't re-cut.
  const schedule = period.kind === 'payday' ? (await ctx.repos.recurring.get(period.recurringId))?.schedule : undefined;
  const start = periodFor(period, ctx.clock.today(), schedule).start;
  await savePlan(ctx, { ...plan, period, startDate: start }, { period, startDate: start });
}
