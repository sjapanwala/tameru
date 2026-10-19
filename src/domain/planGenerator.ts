// Recommended plan from onboarding answers (or current data). Works in monthly
// cents; scale for other period lengths. Every number comes with reason codes
// that copy/strings.ts turns into plain language.
//
// 1. Fixed costs first, from the bills.
// 2. Flexible categories from stated habits, nudged 5% toward goals when there are goals,
//    never cut below 85% of habit (that would be unrealistic).
// 3. Goal contributions sized from target and date, capped to what fits; a goal that
//    doesn't fit gets a realistic date and amount.
// 4. Money left over: part to goals, part to the Irregular fund, the rest unassigned.

import { addMonths, diffDays } from './dates';
import { allocate } from './money';
import type { Cents, Id, LocalDate, PlanReason } from './types';

export interface GeneratorGoal {
  id: Id;
  targetCents?: Cents; // optional: open-ended goals just take a share of what's left
  targetDate?: LocalDate;
  progressCents: Cents;
}

export interface GeneratorInput {
  today: LocalDate;
  incomeMonthlyCents: Cents; // conservative
  billsMonthlyCents: Cents;
  billCount: number;
  billsCategoryId: Id;
  fundCategoryId: Id; // Irregular
  /** Weekly habit per flexible category; undefined means the user skipped (defaults used). */
  habitsWeekly: Record<Id, Cents | undefined>;
  defaultHabitsWeekly: Record<Id, Cents>;
  goals: readonly GeneratorGoal[];
}

export interface GoalFlag {
  goalId: Id;
  code: 'date_unrealistic' | 'no_room_now';
  realisticDate?: LocalDate;
  reachableByDateCents?: Cents;
  monthlyCents: Cents;
}

export interface GeneratedPlan {
  allocations: Record<Id, Cents>;
  goalContributions: Record<Id, Cents>;
  reasons: Record<Id, PlanReason[]>;
  flags: GoalFlag[];
  summary: { incomeCents: Cents; fixedCents: Cents; flexibleCents: Cents; fundCents: Cents; goalsCents: Cents; unassignedCents: Cents };
}

export const NUDGE = 0.95;
export const FLOOR = 0.85;
const SURPLUS_WITH_GOALS = { goals: 0.5, fund: 0.3 }; // remaining 20% unassigned
const SURPLUS_NO_GOALS = { goals: 0, fund: 0.5 };
const WEEKS_PER_MONTH = 52 / 12;

/** Months from today to date, at least 1, rounded up. */
export function monthsUntil(today: LocalDate, date: LocalDate): number {
  return Math.max(1, Math.ceil(diffDays(today, date) / (365 / 12)));
}

/** What a goal needs per month to land on time (open-ended goals need nothing fixed). */
export function goalNeed(g: GeneratorGoal, today: LocalDate): { needed: Cents; reason: PlanReason } {
  if (g.targetCents === undefined) return { needed: 0, reason: { code: 'goal_open' } };
  const remaining = Math.max(0, g.targetCents - g.progressCents);
  if (remaining === 0) return { needed: 0, reason: { code: 'goal_reached' } };
  if (!g.targetDate) return { needed: Math.ceil(remaining / 12), reason: { code: 'goal_one_year', params: { remaining } } };
  const months = monthsUntil(today, g.targetDate);
  return { needed: Math.ceil(remaining / months), reason: { code: 'goal_needed', params: { remaining, months } } };
}

export function generatePlan(i: GeneratorInput): GeneratedPlan {
  const reasons: Record<Id, PlanReason[]> = {};
  const why = (id: Id, r: PlanReason) => (reasons[id] ??= []).push(r);
  const flags: GoalFlag[] = [];

  const allocations: Record<Id, Cents> = { [i.billsCategoryId]: i.billsMonthlyCents };
  why(i.billsCategoryId, { code: 'fixed_bills', params: { count: i.billCount, total: i.billsMonthlyCents } });
  const available = i.incomeMonthlyCents - i.billsMonthlyCents;

  const flexIds = Object.keys(i.habitsWeekly);
  const habit: Record<Id, Cents> = {};
  for (const id of flexIds) {
    const stated = i.habitsWeekly[id];
    const weekly = stated ?? i.defaultHabitsWeekly[id] ?? 0;
    habit[id] = Math.round(weekly * WEEKS_PER_MONTH);
    why(id, { code: stated === undefined ? 'default_habit' : 'from_habit', params: { weekly, monthly: habit[id]! } });
  }
  const hasGoals = i.goals.length > 0;
  const target = Object.fromEntries(flexIds.map((id) => [id, hasGoals ? Math.round(habit[id]! * NUDGE) : habit[id]!]));
  const floor = Object.fromEntries(flexIds.map((id) => [id, Math.round(habit[id]! * FLOOR)]));
  const sum = (r: Record<Id, Cents>) => Object.values(r).reduce((a, b) => a + b, 0);

  const needs = i.goals.map((g) => ({ g, ...goalNeed(g, i.today) }));
  for (const n of needs) why(n.g.id, n.reason);
  const totalNeeded = needs.reduce((s, n) => s + n.needed, 0);
  const goalContributions: Record<Id, Cents> = Object.fromEntries(needs.map((n) => [n.g.id, n.needed]));
  let flex: Record<Id, Cents>;

  if (available >= sum(target) + totalNeeded) {
    flex = target;
    if (hasGoals) for (const id of flexIds) if (habit[id]! > 0) why(id, { code: 'nudged_for_goals', params: { percent: Math.round((1 - NUDGE) * 100) } });
  } else if (available >= sum(floor) + totalNeeded) {
    const parts = allocate(available - totalNeeded, flexIds.map((id) => target[id]!));
    flex = Object.fromEntries(flexIds.map((id, k) => [id, parts[k]!]));
    const pct = Math.round((1 - sum(flex) / Math.max(1, sum(habit))) * 100);
    for (const id of flexIds) if (habit[id]! > 0) why(id, { code: 'trimmed_for_goals', params: { percent: pct } });
  } else {
    if (available >= sum(floor)) {
      flex = floor;
      for (const id of flexIds) if (habit[id]! > 0) why(id, { code: 'at_floor', params: { percent: Math.round(FLOOR * 100) } });
    } else {
      const parts = allocate(Math.max(0, available), flexIds.map((id) => habit[id]!));
      flex = Object.fromEntries(flexIds.map((id, k) => [id, parts[k]!]));
      for (const id of flexIds) why(id, { code: 'income_tight' });
    }
    const room = Math.max(0, available - sum(flex));
    const given = allocate(room, needs.map((n) => n.needed));
    needs.forEach((n, k) => {
      const monthly = given[k]!;
      goalContributions[n.g.id] = monthly;
      if (monthly >= n.needed) return;
      why(n.g.id, { code: 'goal_capped', params: { needed: n.needed, given: monthly } });
      flags.push(goalFlag(n.g, monthly, i.today));
    });
  }
  Object.assign(allocations, flex);

  let fund = 0;
  const surplus = available - sum(flex) - sum(goalContributions);
  if (surplus > 0) {
    const split = hasGoals ? SURPLUS_WITH_GOALS : SURPLUS_NO_GOALS;
    const toGoals = Math.floor(surplus * split.goals);
    fund = Math.floor(surplus * split.fund);
    if (toGoals > 0) {
      // Open-ended goals share equally with the rest when nothing is "needed".
      const weights = needs.map((n) => (totalNeeded > 0 ? n.needed : 1));
      allocate(toGoals, weights).forEach((c, k) => {
        if (c <= 0) return;
        const id = needs[k]!.g.id;
        goalContributions[id] = (goalContributions[id] ?? 0) + c;
        why(id, { code: 'surplus_to_goal', params: { extra: c } });
      });
    }
    why(i.fundCategoryId, { code: 'surplus_to_fund', params: { percent: Math.round(split.fund * 100) } });
  } else why(i.fundCategoryId, { code: 'fund_no_room' });
  allocations[i.fundCategoryId] = fund;

  const flexibleCents = sum(flex);
  const goalsCents = sum(goalContributions);
  return {
    allocations,
    goalContributions,
    reasons,
    flags,
    summary: {
      incomeCents: i.incomeMonthlyCents,
      fixedCents: i.billsMonthlyCents,
      flexibleCents,
      fundCents: fund,
      goalsCents,
      unassignedCents: i.incomeMonthlyCents - i.billsMonthlyCents - flexibleCents - fund - goalsCents,
    },
  };
}

function goalFlag(g: GeneratorGoal, monthly: Cents, today: LocalDate): GoalFlag {
  const remaining = Math.max(0, (g.targetCents ?? 0) - g.progressCents);
  if (monthly <= 0) return { goalId: g.id, code: 'no_room_now', monthlyCents: 0 };
  const months = Math.ceil(remaining / monthly);
  return {
    goalId: g.id,
    code: 'date_unrealistic',
    realisticDate: addMonths(today, months),
    ...(g.targetDate ? { reachableByDateCents: g.progressCents + monthly * monthsUntil(today, g.targetDate) } : {}),
    monthlyCents: monthly,
  };
}

/**
 * Re-size contributions for the goals that changed, leaving category allocations
 * and other goals' contributions as they are.
 */
export function regenerateGoals(
  i: Pick<GeneratorInput, 'today' | 'incomeMonthlyCents' | 'goals'>,
  allocations: Record<Id, Cents>,
  contributions: Record<Id, Cents>,
  changed: readonly Id[],
): { goalContributions: Record<Id, Cents>; flags: GoalFlag[]; reasons: Record<Id, PlanReason[]> } {
  const out = { ...contributions };
  const flags: GoalFlag[] = [];
  const reasons: Record<Id, PlanReason[]> = {};
  const fixed = Object.values(allocations).reduce((a, b) => a + b, 0);
  const others = Object.entries(contributions).filter(([id]) => !changed.includes(id)).reduce((a, [, c]) => a + c, 0);
  const room = Math.max(0, i.incomeMonthlyCents - fixed - others);
  const targets = i.goals.filter((g) => changed.includes(g.id));
  const needs = targets.map((g) => ({ g, ...goalNeed(g, i.today) }));
  const given = allocate(Math.min(room, needs.reduce((s, n) => s + n.needed, 0)), needs.map((n) => n.needed));
  needs.forEach((n, k) => {
    out[n.g.id] = given[k]!;
    reasons[n.g.id] = [n.reason];
    if (given[k]! < n.needed) {
      reasons[n.g.id]!.push({ code: 'goal_capped', params: { needed: n.needed, given: given[k]! } });
      flags.push(goalFlag(n.g, given[k]!, i.today));
    }
  });
  for (const id of changed) if (!targets.some((g) => g.id === id)) delete out[id]; // removed goals
  return { goalContributions: out, flags, reasons };
}

/** Scale a monthly plan to a period of `periodDays` (e.g. 14 for biweekly). */
export function scaleToPeriod(amounts: Record<Id, Cents>, periodDays: number): Record<Id, Cents> {
  const f = (periodDays * 12) / 365;
  return Object.fromEntries(Object.entries(amounts).map(([k, v]) => [k, Math.round(v * f)]));
}
