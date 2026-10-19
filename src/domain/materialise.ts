// Turn due recurring occurrences into transactions. Idempotent by originKey.

import { addDays, maxDate } from './dates';
import { occurrenceAmount, occurrences } from './recurrence';
import type { Account, Id, LocalDate, RecurringItem, Transaction } from './types';

export type TxDraft = Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>;

export const recurringOriginKey = (itemId: Id, date: LocalDate): string => `rec:${itemId}:${date}`;

/** How far back we fill in occurrences the user hasn't opened the app for. */
export const MATERIALISE_LOOKBACK_DAYS = 90;

/**
 * Drafts for every occurrence dated ≤ today that isn't recorded yet.
 * Occurrences before the deposit account's opening date are already part of its
 * opening balance, so they are never generated.
 */
export function dueOccurrences(
  items: readonly RecurringItem[],
  accounts: readonly Account[],
  existingKeys: ReadonlySet<string>,
  today: LocalDate,
  autoPostDefault: boolean,
): TxDraft[] {
  const out: TxDraft[] = [];
  const accById = new Map(accounts.map((a) => [a.id, a]));
  for (const item of items) {
    if (item.archived || item.schedule.freq === 'irregular') continue;
    const acc = accById.get(item.defaultAccountId);
    if (!acc || acc.archived) continue;
    const from = maxDate(addDays(today, -MATERIALISE_LOOKBACK_DAYS), acc.openingDate);
    for (const date of occurrences(item, from, today)) {
      const originKey = recurringOriginKey(item.id, date);
      if (existingKeys.has(originKey)) continue;
      const autoPost = item.autoPost ?? autoPostDefault;
      out.push({
        type: item.kind === 'income' ? 'income' : 'expense',
        amountCents: occurrenceAmount(item, 'expected'),
        date,
        accountId: item.defaultAccountId,
        categoryId: item.categoryId,
        ...(item.merchant ? { merchant: item.merchant } : {}),
        status: autoPost ? 'posted' : 'pending',
        needsReview: false,
        originKey,
        recurringId: item.id,
      });
    }
  }
  return out;
}
