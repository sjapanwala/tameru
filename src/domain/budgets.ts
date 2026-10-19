// Category budgets per period with reset / rollover / fund behaviour.
// Every value leads with what's left (remaining), not what's spent.

import { spendingByCategory } from './ledger';
import type { Period } from './period';
import type { BudgetBehaviour, BudgetMove, Category, Cents, Id, LocalDate, PeriodSegment, Transaction } from './types';

export interface CategoryBudget {
  categoryId: Id;
  behaviour: BudgetBehaviour;
  remainingCents: Cents; // availableCents − spentCents; negative means over
  availableCents: Cents; // allocated + carried + moves
  allocatedCents: Cents; // this period's allocation, after any borrowing from it
  carriedInCents: Cents; // from the previous period (rollover/fund only)
  movedInCents: Cents;
  movedOutCents: Cents;
  borrowedAheadCents: Cents; // taken from this period's allocation by last period's cover
  spentCents: Cents;
  overCents: Cents; // max(0, −remaining), for the "$30 over" message
}

export interface BudgetInput {
  categories: readonly Category[];
  periods: readonly Period[]; // chronological, ending with the period of interest
  allocationFor: (categoryId: Id, periodStart: LocalDate) => Cents;
  moves: readonly BudgetMove[];
  segments: readonly PeriodSegment[];
  transactions: readonly Transaction[];
}

/**
 * Budgets for every period in order. Rollover and fund categories carry their
 * remaining (positive or negative) into the next period; reset categories start fresh.
 * A fresh-start segment restarts the period: carry-in is cleared and only spending
 * from the segment start counts.
 */
export function budgetHistory(input: BudgetInput): Map<LocalDate, Map<Id, CategoryBudget>> {
  const out = new Map<LocalDate, Map<Id, CategoryBudget>>();
  let prev: Map<Id, CategoryBudget> | undefined;
  let borrowedForNext = new Map<Id, Cents>();
  for (const p of input.periods) {
    const segment = input.segments.filter((s) => s.periodStart === p.start).sort((a, b) => b.segmentStart.localeCompare(a.segmentStart))[0];
    const from = segment?.segmentStart ?? p.start;
    const spent = spendingByCategory(input.transactions, from, p.end, { includePending: true });
    const moves = input.moves.filter((m) => m.periodStart === p.start);
    const cur = new Map<Id, CategoryBudget>();
    const nextBorrow = new Map<Id, Cents>();
    for (const m of moves) if (m.fromCategoryId === 'next_period') nextBorrow.set(m.toCategoryId, (nextBorrow.get(m.toCategoryId) ?? 0) + m.amountCents);

    for (const c of input.categories) {
      const borrowedAheadCents = borrowedForNext.get(c.id) ?? 0;
      const allocatedCents = input.allocationFor(c.id, p.start) - borrowedAheadCents;
      const carriedInCents = segment || c.behaviour === 'reset' ? 0 : (prev?.get(c.id)?.remainingCents ?? 0);
      const movedInCents = moves.filter((m) => m.toCategoryId === c.id).reduce((a, m) => a + m.amountCents, 0);
      const movedOutCents = moves.filter((m) => m.fromCategoryId === c.id).reduce((a, m) => a + m.amountCents, 0);
      const availableCents = allocatedCents + carriedInCents + movedInCents - movedOutCents;
      const spentCents = spent[c.id] ?? 0;
      const remainingCents = availableCents - spentCents;
      cur.set(c.id, {
        categoryId: c.id,
        behaviour: c.behaviour,
        remainingCents,
        availableCents,
        allocatedCents,
        carriedInCents,
        movedInCents,
        movedOutCents,
        borrowedAheadCents,
        spentCents,
        overCents: Math.max(0, -remainingCents),
      });
    }
    out.set(p.start, cur);
    prev = cur;
    borrowedForNext = nextBorrow;
  }
  return out;
}

/** Average daily spend so far this period. */
export const dailyBurn = (b: CategoryBudget, daysElapsed: number): number => Math.max(0, b.spentCents) / Math.max(1, daysElapsed);
