// Splitting safe-to-spend across the user's cards, for Home's card stack. Each card's
// share is the part of recent spending it carried; the parts always add up to the
// whole, to the cent. Pure; all money in integer cents.

import { addDays } from './dates';
import type { Cents, Id, LocalDate, Transaction } from './types';

/** Days of spending that set each card's share. */
export const SHARE_DAYS = 30;

/** Posted spending (less refunds) on each card over the last `days` days, today included. */
export function spendingWeights(cardIds: readonly Id[], txs: readonly Transaction[], today: LocalDate, days = SHARE_DAYS): Record<Id, number> {
  const from = addDays(today, -(days - 1));
  const w: Record<Id, number> = Object.fromEntries(cardIds.map((id) => [id, 0]));
  for (const t of txs) {
    if (t.status !== 'posted' || t.date < from || t.date > today || !(t.accountId in w)) continue;
    if (t.type === 'expense') w[t.accountId]! += t.amountCents;
    else if (t.type === 'refund') w[t.accountId]! -= t.amountCents;
  }
  for (const id of cardIds) w[id] = Math.max(0, w[id]!);
  return w;
}

/**
 * Split `total` by `weights` (an even split when they're all 0). Largest remainder, so
 * the parts sum exactly to `total`; a negative total (a shortfall) splits the same way.
 */
export function splitByWeight(total: Cents, weights: Readonly<Record<Id, number>>): Record<Id, Cents> {
  const ids = Object.keys(weights);
  if (ids.length === 0) return {};
  const sum = ids.reduce((s, id) => s + weights[id]!, 0);
  const share = (id: Id) => (sum > 0 ? weights[id]! / sum : 1 / ids.length);
  const sign = total < 0 ? -1 : 1;
  const abs = Math.abs(total);
  const exact = ids.map((id) => ({ id, v: abs * share(id) }));
  const out: Record<Id, Cents> = Object.fromEntries(exact.map((e) => [e.id, Math.floor(e.v)]));
  let left = abs - exact.reduce((s, e) => s + Math.floor(e.v), 0);
  // Hand the leftover cents to the largest fractions (ties to the earlier card).
  for (const e of [...exact].sort((a, b) => b.v - Math.floor(b.v) - (a.v - Math.floor(a.v)))) {
    if (left <= 0) break;
    out[e.id]! += 1;
    left--;
  }
  for (const id of ids) out[id] = sign * out[id]! || 0;
  return out;
}

/** Spending posted today on each card, less refunds (never below 0). */
export function spentToday(cardIds: readonly Id[], txs: readonly Transaction[], today: LocalDate): Record<Id, Cents> {
  return spendingWeights(cardIds, txs, today, 1);
}
