// Ranked ways to cover an overspent category. The user picks one with one action.

import { dailyBurn, type CategoryBudget } from './budgets';
import type { Category, Cents, Id } from './types';

export type CoverOption =
  | { kind: 'category'; fromCategoryId: Id; amountCents: Cents; coversAll: boolean; slackCents: Cents }
  | { kind: 'fund'; fromCategoryId: Id; amountCents: Cents; coversAll: boolean }
  | { kind: 'next_period'; amountCents: Cents; coversAll: true }
  | { kind: 'leave'; amountCents: 0; coversAll: false };

/**
 * 1. Other flexible categories, ranked by slack: what's left after their expected
 *    spending for the rest of the period (remaining − daily burn × days left).
 * 2. Buffer / fund categories with money left.
 * 3. Next period's allocation (always possible).
 * Leaving it as-is is always offered last, so nothing stays "over" unless chosen.
 */
export function coverOptions(
  overCategoryId: Id,
  budgets: ReadonlyMap<Id, CategoryBudget>,
  categories: readonly Category[],
  daysElapsed: number,
  daysLeft: number,
): CoverOption[] {
  const over = budgets.get(overCategoryId)?.overCents ?? 0;
  if (over <= 0) return [];
  const flexible: Extract<CoverOption, { kind: 'category' }>[] = [];
  const funds: Extract<CoverOption, { kind: 'fund' }>[] = [];
  for (const c of categories) {
    if (c.id === overCategoryId || c.archived || c.group === 'system') continue;
    const b = budgets.get(c.id);
    if (!b || b.remainingCents <= 0) continue;
    if (c.isBuffer || c.behaviour === 'fund') {
      const amountCents = Math.min(over, b.remainingCents);
      funds.push({ kind: 'fund', fromCategoryId: c.id, amountCents, coversAll: amountCents === over });
    } else {
      // Reset categories lose unspent money at period end anyway; rollover ones keep it,
      // so a reset category's slack is the better first source at equal slack.
      const slackCents = Math.floor(b.remainingCents - dailyBurn(b, daysElapsed) * daysLeft);
      if (slackCents <= 0) continue;
      const amountCents = Math.min(over, slackCents);
      flexible.push({ kind: 'category', fromCategoryId: c.id, amountCents, coversAll: amountCents === over, slackCents });
    }
  }
  const byBehaviour = (id: Id) => (categories.find((c) => c.id === id)?.behaviour === 'reset' ? 0 : 1);
  flexible.sort((a, b) => b.slackCents - a.slackCents || byBehaviour(a.fromCategoryId) - byBehaviour(b.fromCategoryId));
  funds.sort((a, b) => b.amountCents - a.amountCents);
  return [...flexible, ...funds, { kind: 'next_period', amountCents: over, coversAll: true }, { kind: 'leave', amountCents: 0, coversAll: false }];
}
