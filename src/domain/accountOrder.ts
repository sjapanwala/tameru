// The order accounts appear in: the user's own once they've rearranged, otherwise
// cards first (as in a wallet), then chequing, savings, cash, investing.

import type { Account, Id } from './types';

const TYPE_RANK: Record<Account['type'], number> = { credit_card: 0, chequing: 1, savings: 2, cash: 3, investing: 4 };

export function sortAccounts<T extends Pick<Account, 'type' | 'createdAt' | 'sortOrder'>>(accounts: readonly T[]): T[] {
  return [...accounts].sort(
    (a, b) =>
      (a.sortOrder ?? Infinity) - (b.sortOrder ?? Infinity) ||
      TYPE_RANK[a.type] - TYPE_RANK[b.type] ||
      a.createdAt.localeCompare(b.createdAt),
  );
}

/**
 * New sortOrder for every account after the user rearranges some of them
 * (e.g. just the cards in the wallet): those keep the positions the subset
 * occupied, in the new order; everything else stays where it was.
 */
export function reorderSubset(all: readonly Pick<Account, 'id' | 'type' | 'createdAt' | 'sortOrder'>[], subset: readonly Id[]): Map<Id, number> {
  const sorted = sortAccounts(all).map((a) => a.id);
  const inSubset = new Set(subset);
  const queue = subset.filter((id) => sorted.includes(id));
  const result = sorted.map((id) => (inSubset.has(id) ? queue.shift()! : id));
  return new Map(result.map((id, i) => [id, i]));
}

/** Move one account by `delta` places within a list; returns the new id order. */
export function moveInList(ids: readonly Id[], id: Id, delta: number): Id[] {
  const from = ids.indexOf(id);
  if (from < 0) return [...ids];
  const to = Math.max(0, Math.min(ids.length - 1, from + delta));
  const out = [...ids];
  out.splice(from, 1);
  out.splice(to, 0, id);
  return out;
}
