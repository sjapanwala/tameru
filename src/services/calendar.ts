// What to put on the user's calendar: recurring bills, subscriptions and paydays, plus
// credit card payment due dates. The UI words them and builds the .ics file.

import { nextMonthlyDate } from '../domain/dates';
import { nextOccurrence, occurrenceAmount } from '../domain/recurrence';
import type { Cents, Id, LocalDate, Schedule } from '../domain/types';
import type { AppContext } from './context';

export interface CalendarItem {
  kind: 'bill' | 'subscription' | 'income' | 'card';
  id: Id;
  name: string;
  amountCents?: Cents; // typical amount (cards: none)
  start: LocalDate; // next occurrence
  repeat: Schedule;
  until?: LocalDate;
}

/** Everything calendar-worthy, or just one recurring item / card when `onlyId` is given. */
export async function calendarItems(ctx: AppContext, onlyId?: Id): Promise<CalendarItem[]> {
  const today = ctx.clock.today();
  const [recurring, accounts] = await Promise.all([ctx.repos.recurring.all(), ctx.repos.accounts.all()]);
  const items: CalendarItem[] = [];
  for (const r of recurring) {
    if (r.archived || r.system || r.schedule.freq === 'irregular' || (onlyId && r.id !== onlyId)) continue;
    const start = nextOccurrence(r, today);
    if (!start) continue;
    items.push({ kind: r.kind, id: r.id, name: r.name, amountCents: occurrenceAmount(r), start, repeat: r.schedule, ...(r.endDate ? { until: r.endDate } : {}) });
  }
  for (const a of accounts) {
    if (a.archived || a.type !== 'credit_card' || !a.card || (onlyId && a.id !== onlyId)) continue;
    items.push({ kind: 'card', id: a.id, name: a.name, start: nextMonthlyDate(a.card.dueDay, today), repeat: { freq: 'monthly', day: a.card.dueDay } });
  }
  return items.sort((x, y) => x.start.localeCompare(y.start));
}
