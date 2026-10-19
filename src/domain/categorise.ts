// Category suggestion chain and rule learning.

import { bestMatch } from './merchant';
import type { Cents, Id, MerchantRule, Transaction } from './types';

export type SuggestionSource = 'rule' | 'fuzzy' | 'pattern' | 'last' | 'none';

export interface CategoryQuery {
  merchantKey?: string;
  amountCents: Cents;
  hour: number; // local hour of day, 0–23
}

const hourOf = (t: Transaction): number | undefined => (t.enteredAt ? new Date(t.enteredAt).getHours() : undefined);

const manual = (t: Transaction) =>
  (t.type === 'expense' || t.type === 'refund') && !t.originKey && t.status !== 'skipped' && !!t.categoryId && !t.needsReview;

function mostCommon(ids: Id[]): Id | undefined {
  const n = new Map<Id, number>();
  for (const id of ids) n.set(id, (n.get(id) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

/**
 * 1. exact merchant rule  2. fuzzy merchant match  3. most-used category for a
 * similar amount (±25%) at a similar time of day (±2h)  4. last-used category.
 */
export function suggestCategory(
  q: CategoryQuery,
  rules: readonly MerchantRule[],
  history: readonly Transaction[],
): { categoryId?: Id; source: SuggestionSource } {
  const past = history.filter(manual);
  if (q.merchantKey) {
    const exact = rules.find((r) => r.merchantKey === q.merchantKey);
    if (exact) return { categoryId: exact.categoryId, source: 'rule' };
    const fuzzy = bestMatch(q.merchantKey, rules, (r) => r.merchantKey);
    if (fuzzy) return { categoryId: fuzzy.item.categoryId, source: 'fuzzy' };
    const fromHistory = bestMatch(q.merchantKey, past.filter((t) => t.merchantKey), (t) => t.merchantKey!);
    if (fromHistory) return { categoryId: fromHistory.item.categoryId, source: 'fuzzy' };
  }
  const similar = past.filter((t) => {
    const h = hourOf(t);
    if (h === undefined) return false;
    const dh = Math.min(Math.abs(h - q.hour), 24 - Math.abs(h - q.hour));
    return Math.abs(t.amountCents - q.amountCents) <= q.amountCents * 0.25 && dh <= 2;
  });
  if (similar.length >= 2) {
    const id = mostCommon(similar.map((t) => t.categoryId!));
    if (id) return { categoryId: id, source: 'pattern' };
  }
  const last = [...past].sort((a, b) => (b.enteredAt ?? b.createdAt).localeCompare(a.enteredAt ?? a.createdAt))[0];
  if (last) return { categoryId: last.categoryId, source: 'last' };
  return { source: 'none' };
}

export const RULE_SWITCH_AFTER = 2;

export type RuleState = Pick<MerchantRule, 'merchantKey' | 'categoryId' | 'confirmations' | 'pendingCount'> & { pendingCategoryId?: Id };

/**
 * Update a merchant rule after the user chooses `chosen` for that merchant.
 * A first choice creates the rule. A different category needs two consistent
 * corrections in a row before it becomes the default.
 */
export function learn(rule: RuleState | undefined, merchantKey: string, chosen: Id): RuleState {
  if (!rule) return { merchantKey, categoryId: chosen, confirmations: 1, pendingCount: 0 };
  if (chosen === rule.categoryId) return { merchantKey, categoryId: chosen, confirmations: rule.confirmations + 1, pendingCount: 0 };
  const pendingCount = rule.pendingCategoryId === chosen ? rule.pendingCount + 1 : 1;
  if (pendingCount >= RULE_SWITCH_AFTER) return { merchantKey, categoryId: chosen, confirmations: pendingCount, pendingCount: 0 };
  return { merchantKey, categoryId: rule.categoryId, confirmations: rule.confirmations, pendingCategoryId: chosen, pendingCount };
}
