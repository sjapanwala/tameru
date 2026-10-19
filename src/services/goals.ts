// Goals: create, edit, contribute, and progress.

import { crossedMilestone, goalProgress } from '../domain/goals';
import type { Cents, Goal, Id, LocalDate } from '../domain/types';
import { stamp, type AppContext } from './context';
import { emit } from './events';
import { getPlan, logEvent, savePlan } from './plan';
import { resizeGoals } from './regenerate';
import { transfer } from './transactions';

export interface NewGoal {
  name: string;
  targetCents: Cents;
  targetDate?: LocalDate;
  accountId?: Id;
  startingProgressCents?: Cents;
}

export async function createGoal(ctx: AppContext, input: NewGoal): Promise<Goal> {
  const goal: Goal = stamp(ctx, {
    name: input.name.trim() || 'Goal',
    targetCents: input.targetCents,
    ...(input.targetDate ? { targetDate: input.targetDate } : {}),
    ...(input.accountId ? { accountId: input.accountId } : {}),
    startingProgressCents: input.startingProgressCents ?? 0,
    archived: false,
  });
  await ctx.repos.goals.put(goal);
  await logEvent(ctx, 'goal_changed', { goalId: goal.id, created: true });
  return goal;
}

/** Create a goal and size its contribution to fit the existing plan. */
export async function addGoalToPlan(ctx: AppContext, input: NewGoal) {
  const goal = await createGoal(ctx, input);
  return { goal, ...(await resizeGoals(ctx, [goal.id])) };
}

export async function updateGoal(ctx: AppContext, id: Id, patch: Partial<Omit<Goal, 'id'>>) {
  const cur = await ctx.repos.goals.get(id);
  if (!cur) throw new Error('goal not found');
  const next: Goal = stamp(ctx, { ...cur, ...patch, id });
  await ctx.repos.goals.put(next);
  await logEvent(ctx, 'goal_changed', { goalId: id, patch });
  // Editing a goal re-runs the generator for that goal's contribution only.
  const affects = ['targetCents', 'targetDate', 'startingProgressCents', 'archived'].some((k) => k in patch);
  const resized = affects ? await resizeGoals(ctx, [id]) : undefined;
  return { goal: next, flags: resized?.flags ?? [] };
}

export async function setGoalContribution(ctx: AppContext, goalId: Id, perPeriodCents: Cents): Promise<void> {
  const plan = await getPlan(ctx);
  await savePlan(ctx, { ...plan, goalContributions: { ...plan.goalContributions, [goalId]: perPeriodCents } }, { goalId, to: perPeriodCents });
}

export async function listGoals(ctx: AppContext) {
  const [goals, txs, plan] = await Promise.all([ctx.repos.goals.all(), ctx.repos.transactions.all(), getPlan(ctx)]);
  const today = ctx.clock.today();
  return goals.filter((g) => !g.archived).map((goal) => ({ goal, progress: goalProgress(goal, txs, today), perPeriodCents: plan.goalContributions[goal.id] ?? 0 }));
}

/** Move money toward a goal. Returns a milestone if this contribution crossed one. */
export async function contribute(ctx: AppContext, goalId: Id, fromAccountId: Id, amountCents: Cents) {
  const goal = await ctx.repos.goals.get(goalId);
  if (!goal?.accountId) throw new Error('goal has no linked account');
  const today = ctx.clock.today();
  const before = goalProgress(goal, await ctx.repos.transactions.all(), today);
  await transfer(ctx, fromAccountId, goal.accountId, amountCents, { goalId });
  const after = goalProgress(goal, await ctx.repos.transactions.all(), today);
  const milestone = crossedMilestone(before, after);
  if (milestone) emit('goalMilestone', { goalId, milestone });
  return { progress: after, milestone };
}
