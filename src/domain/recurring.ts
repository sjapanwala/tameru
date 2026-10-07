import { addDays, daysBetween, daysInMonth } from './dates';
import type { ISODate, Recurring, Schedule } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Dates a schedule falls on within [from, to], inclusive. Occurrences start
 * at the anchor date and repeat forward; nothing happens before the anchor.
 * Monthly and yearly items on a day the month lacks (the 31st, Feb 29) fall
 * on that month's last day.
 */
export function occurrencesBetween(schedule: Schedule, from: ISODate, to: ISODate): ISODate[] {
  const { freq, anchorDate } = schedule;
  const start = from > anchorDate ? from : anchorDate;
  if (start > to) return [];
  const result: ISODate[] = [];

  if (freq === 'weekly' || freq === 'biweekly') {
    const step = freq === 'weekly' ? 7 : 14;
    const skipped = Math.ceil(daysBetween(anchorDate, start) / step);
    for (let date = addDays(anchorDate, skipped * step); date <= to; date = addDays(date, step)) {
      result.push(date);
    }
    return result;
  }

  const [, anchorMonth = 1, anchorDay = 1] = anchorDate.split('-').map(Number);
  const [startYear = 1970, startMonth = 1] = start.split('-').map(Number);
  const [endYear = 1970, endMonth = 1] = to.split('-').map(Number);
  for (let y = startYear, m = startMonth; y < endYear || (y === endYear && m <= endMonth);) {
    if (freq === 'monthly' || m === anchorMonth) {
      const date = `${y}-${pad(m)}-${pad(Math.min(anchorDay, daysInMonth(y, m)))}`;
      if (date >= start && date <= to) result.push(date);
    }
    if (++m > 12) {
      m = 1;
      y++;
    }
  }
  return result;
}

export interface Occurrence {
  recurring: Recurring;
  date: ISODate;
}

/** Key for "this occurrence has a transaction recorded against it". */
export const occurrenceKey = (recurringId: string, date: ISODate) => `${recurringId}:${date}`;

/** Keys of occurrences that already have a transaction. */
export function paidKeys(
  transactions: readonly { recurringId?: string | null; recurringDate?: ISODate | null }[],
): Set<string> {
  const keys = new Set<string>();
  for (const tx of transactions) {
    if (tx.recurringId && tx.recurringDate)
      keys.add(occurrenceKey(tx.recurringId, tx.recurringDate));
  }
  return keys;
}

/** All occurrences of the given items in [from, to], soonest first. */
export function occurrencesOf(
  recurring: readonly Recurring[],
  from: ISODate,
  to: ISODate,
): Occurrence[] {
  return recurring
    .flatMap((item) =>
      occurrencesBetween(item.schedule, from, to).map((date) => ({ recurring: item, date })),
    )
    .sort(
      (a, b) => a.date.localeCompare(b.date) || a.recurring.name.localeCompare(b.recurring.name),
    );
}

/** Signed effect on the balance: bills negative, income positive. */
export const signedAmount = (item: Pick<Recurring, 'kind' | 'amountCents'>) =>
  item.kind === 'bill' ? -item.amountCents : item.amountCents;

export const FREQUENCY_LABELS: Record<Schedule['freq'], string> = {
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  monthly: 'Monthly',
  yearly: 'Yearly',
};
