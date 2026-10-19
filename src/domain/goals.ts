// Goal progress and gentle milestone acknowledgements.

import { diffDays } from './dates';
import type { Cents, Goal, LocalDate, Transaction } from './types';

export interface GoalProgress {
  progressCents: Cents;
  remainingCents: Cents; // left to save
  fraction: number; // 0..1
  milestone: 0 | 25 | 50 | 75 | 100; // highest reached
  daysToTarget?: number;
}

const MILESTONES = [100, 75, 50, 25] as const;

/** Progress = starting amount + goal-tagged transfers (investing contributions included). */
export function goalProgress(goal: Goal, txs: readonly Transaction[], asOf: LocalDate): GoalProgress {
  const contributed = txs
    .filter((t) => t.goalId === goal.id && t.type === 'transfer' && t.status === 'posted' && t.date <= asOf)
    .reduce((s, t) => s + t.amountCents, 0);
  const progressCents = goal.startingProgressCents + contributed;
  const fraction = goal.targetCents > 0 ? Math.min(1, Math.max(0, progressCents / goal.targetCents)) : 0;
  return {
    progressCents,
    remainingCents: Math.max(0, goal.targetCents - progressCents),
    fraction,
    milestone: MILESTONES.find((m) => fraction * 100 >= m) ?? 0,
    ...(goal.targetDate ? { daysToTarget: diffDays(asOf, goal.targetDate) } : {}),
  };
}

/** The milestone newly crossed by a contribution, if any (for a small acknowledgement). */
export function crossedMilestone(before: GoalProgress, after: GoalProgress): GoalProgress['milestone'] | null {
  return after.milestone > before.milestone ? after.milestone : null;
}
