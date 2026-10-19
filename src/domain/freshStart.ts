// Fresh start: after time away or a big backlog, restart the current period from
// today's real numbers without deleting any history.

import { diffDays } from './dates';
import { spendingLines } from './ledger';
import { daysLeft, periodLength, type Period } from './period';
import { allocate } from './money';
import type { Cents, Id, LocalDate, Settings, Transaction } from './types';

export interface FreshStartOffer {
  reason: 'away' | 'backlog';
  daysAway: number;
  backlog: number;
}

export function freshStartOffer(
  settings: Pick<Settings, 'freshStartDays' | 'freshStartBacklog'>,
  lastOpened: LocalDate | undefined,
  today: LocalDate,
  backlog: number,
): FreshStartOffer | null {
  const daysAway = lastOpened ? diffDays(lastOpened, today) : 0;
  if (daysAway >= settings.freshStartDays) return { reason: 'away', daysAway, backlog };
  if (backlog >= settings.freshStartBacklog) return { reason: 'backlog', daysAway, backlog };
  return null;
}

/** Transactions waiting for a look: auto-categorised entries and pending generated ones due by today. */
export const backlogOf = (txs: readonly Transaction[], today: LocalDate): Transaction[] =>
  txs.filter((t) => t.status !== 'skipped' && t.date <= today && (t.needsReview || t.status === 'pending'));

export interface BacklogSummary {
  count: number;
  spentCents: Cents;
  byCategory: Record<Id, Cents>;
  from?: LocalDate;
  to?: LocalDate;
}

/** Collapse the backlog into one summary line instead of a chore list. */
export function summariseBacklog(txs: readonly Transaction[]): BacklogSummary {
  const byCategory: Record<Id, Cents> = {};
  let spent = 0;
  let from: LocalDate | undefined;
  let to: LocalDate | undefined;
  for (const t of txs) {
    for (const l of spendingLines(t)) {
      byCategory[l.categoryId] = (byCategory[l.categoryId] ?? 0) + l.cents;
      spent += l.cents;
    }
    if (!from || t.date < from) from = t.date;
    if (!to || t.date > to) to = t.date;
  }
  return { count: txs.length, spentCents: spent, byCategory, ...(from ? { from, to } : {}) };
}

/**
 * Allocations for the rest of the period, from today's real position:
 * bills = what's still due; flexible categories prorated by days left, then
 * scaled to fit what is actually free right now (safe-to-spend before flexible spending).
 */
export function freshStartAllocations(
  template: Readonly<Record<Id, Cents>>,
  billsCategoryId: Id,
  upcomingBillsCents: Cents,
  freeCents: Cents,
  period: Period,
  today: LocalDate,
): Record<Id, Cents> {
  const share = daysLeft(period, today) / periodLength(period);
  const flexIds = Object.keys(template).filter((id) => id !== billsCategoryId);
  const prorated = flexIds.map((id) => Math.round((template[id] ?? 0) * share));
  const wanted = prorated.reduce((a, b) => a + b, 0);
  const fitted = wanted > Math.max(0, freeCents) ? allocate(Math.max(0, freeCents), prorated) : prorated;
  return { [billsCategoryId]: upcomingBillsCents, ...Object.fromEntries(flexIds.map((id, k) => [id, fitted[k]!])) };
}
