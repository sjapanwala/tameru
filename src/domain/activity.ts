import { merchantKey } from './merchant';
import type { ISODate, Transaction } from './types';

type Tx = Pick<
  Transaction,
  | 'date'
  | 'createdAt'
  | 'amountCents'
  | 'categoryId'
  | 'merchant'
  | 'rawDescriptor'
  | 'note'
  | 'needsReview'
>;

/** Newest day first; within a day, most recently entered first. */
export function sortNewestFirst<T extends Pick<Transaction, 'date' | 'createdAt'>>(
  txs: readonly T[],
): T[] {
  return [...txs].sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
  );
}

export interface ActivityFilter {
  query: string;
  needsReviewOnly: boolean;
  /** Limit to money out or money in. */
  kind?: 'expense' | 'income';
}

/**
 * Filter by the needs-review flag and a free-text query. Every word of the
 * query must appear somewhere in the merchant, raw descriptor, note, category
 * name or amount ("12.50").
 */
export function filterTransactions<T extends Tx>(
  txs: readonly T[],
  filter: ActivityFilter,
  categoryNames: ReadonlyMap<string, string>,
  decimals = 2,
): T[] {
  const words = filter.query.toLowerCase().split(/\s+/).filter(Boolean);
  return txs.filter((tx) => {
    if (filter.needsReviewOnly && !tx.needsReview) return false;
    if (filter.kind === 'expense' && tx.amountCents >= 0) return false;
    if (filter.kind === 'income' && tx.amountCents <= 0) return false;
    if (words.length === 0) return true;
    const haystack = [
      tx.merchant,
      tx.rawDescriptor,
      tx.note,
      tx.categoryId ? (categoryNames.get(tx.categoryId) ?? '') : 'uncategorised',
      (Math.abs(tx.amountCents) / 10 ** decimals).toFixed(decimals),
    ]
      .join('\n')
      .toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

export interface DayGroup<T> {
  date: ISODate;
  /** Net of the day's transactions (signed). */
  totalCents: number;
  items: T[];
}

/** Group transactions by date, preserving input order. */
export function groupByDay<T extends Pick<Transaction, 'date' | 'amountCents'>>(
  txs: readonly T[],
): DayGroup<T>[] {
  const groups: DayGroup<T>[] = [];
  const byDate = new Map<ISODate, DayGroup<T>>();
  for (const tx of txs) {
    let group = byDate.get(tx.date);
    if (!group) {
      group = { date: tx.date, totalCents: 0, items: [] };
      byDate.set(tx.date, group);
      groups.push(group);
    }
    group.items.push(tx);
    group.totalCents += tx.amountCents;
  }
  return groups;
}

export interface RecentMerchant {
  name: string;
  /** Category of the most recent transaction with this merchant. */
  categoryId: string | null;
}

/** Distinct merchants, most recently used first. */
export function recentMerchants(txs: readonly Tx[], limit = 8): RecentMerchant[] {
  const seen = new Set<string>();
  const result: RecentMerchant[] = [];
  for (const tx of sortNewestFirst(txs)) {
    const key = merchantKey(tx.merchant);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push({ name: tx.merchant, categoryId: tx.categoryId });
    if (result.length >= limit) break;
  }
  return result;
}

/** Money in, money out and the net for the month `prefix` ("2026-10"). */
export function monthTotals(
  txs: readonly Pick<Transaction, 'date' | 'amountCents'>[],
  prefix: string,
): { inCents: number; outCents: number; netCents: number } {
  let inCents = 0;
  let outCents = 0;
  for (const tx of txs) {
    if (!tx.date.startsWith(prefix)) continue;
    if (tx.amountCents > 0) inCents += tx.amountCents;
    else outCents -= tx.amountCents;
  }
  return { inCents, outCents, netCents: inCents - outCents };
}

/**
 * The categories used most for spending, most-used first, padded out with
 * the remaining categories in their own order.
 */
export function topCategories<C extends { id: string }>(
  txs: readonly Pick<Transaction, 'amountCents' | 'categoryId'>[],
  categories: readonly C[],
  limit = 3,
): C[] {
  const counts = new Map<string, number>();
  for (const tx of txs) {
    if (tx.amountCents < 0 && tx.categoryId) {
      counts.set(tx.categoryId, (counts.get(tx.categoryId) ?? 0) + 1);
    }
  }
  return categories
    .map((category, index) => ({ category, index, count: counts.get(category.id) ?? 0 }))
    .sort((a, b) => b.count - a.count || a.index - b.index)
    .slice(0, limit)
    .map((entry) => entry.category);
}
