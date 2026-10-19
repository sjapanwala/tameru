// Recurring items: bills, subscriptions, income. Card fees are system-owned recurring items.

import { categoryId } from '../domain/defaults';
import { nextOccurrence, occurrenceAmount, occurrences, scheduleFrom } from '../domain/recurrence';
import type { Account, Cents, Frequency, Id, LocalDate, RecurringItem, RecurringKind, Schedule } from '../domain/types';
import { addDays } from '../domain/dates';
import { stamp, type AppContext } from './context';

export interface NewRecurring {
  name: string;
  kind: RecurringKind;
  amountCents?: Cents; // fixed
  range?: { minCents: Cents; maxCents: Cents }; // estimated
  freq: Frequency;
  nextDate: LocalDate;
  semimonthlyDays?: [number, number];
  schedule?: Schedule; // overrides freq/nextDate-derived schedule (e.g. "the 31st")
  categoryId?: Id;
  accountIds: Id[];
  defaultAccountId?: Id;
  autoPost?: boolean | null;
  irregularMonthlyCents?: Cents;
  merchant?: string;
  endDate?: LocalDate;
}

export async function createRecurring(ctx: AppContext, input: NewRecurring): Promise<RecurringItem> {
  const item: RecurringItem = stamp(ctx, {
    name: input.name.trim() || (input.kind === 'income' ? 'Income' : 'Bill'),
    kind: input.kind,
    amount: input.range ? { ...input.range } : { fixedCents: input.amountCents ?? 0 },
    schedule: input.schedule ?? scheduleFrom(input.freq, input.nextDate, input.semimonthlyDays),
    startDate: input.nextDate,
    ...(input.endDate ? { endDate: input.endDate } : {}),
    categoryId: input.categoryId ?? (input.kind === 'income' ? categoryId('income') : categoryId('bills')),
    accountIds: input.accountIds,
    defaultAccountId: input.defaultAccountId ?? input.accountIds[0] ?? '',
    autoPost: input.autoPost ?? null,
    ...(input.irregularMonthlyCents !== undefined ? { irregularMonthlyCents: input.irregularMonthlyCents } : {}),
    ...(input.merchant ? { merchant: input.merchant } : {}),
    archived: false,
  });
  await ctx.repos.recurring.put(item);
  return item;
}

export async function updateRecurring(ctx: AppContext, id: Id, patch: Partial<Omit<RecurringItem, 'id'>>): Promise<RecurringItem> {
  const cur = await ctx.repos.recurring.get(id);
  if (!cur) throw new Error('recurring item not found');
  const next: RecurringItem = stamp(ctx, { ...cur, ...patch, id });
  await ctx.repos.recurring.put(next);
  return next;
}

/** Stopping an item keeps the transactions it already generated. */
export const archiveRecurring = (ctx: AppContext, id: Id) => updateRecurring(ctx, id, { archived: true });

/** Keep a card's monthly-fee recurring item in step with the card's settings. */
export async function syncCardFee(ctx: AppContext, account: Account): Promise<void> {
  const existing = (await ctx.repos.recurring.all()).find((r) => r.system?.kind === 'card_fee' && r.system.accountId === account.id);
  const fee = account.type === 'credit_card' && !account.archived ? (account.card?.monthlyFeeCents ?? 0) : 0;
  if (fee <= 0) {
    if (existing && !existing.archived) await ctx.repos.recurring.put(stamp(ctx, { ...existing, archived: true }));
    return;
  }
  const day = account.card?.statementDay ?? 1;
  const fields = {
    name: `${account.name} fee`,
    amount: { fixedCents: fee },
    schedule: { freq: 'monthly' as const, day },
    archived: false,
  };
  if (existing) {
    await ctx.repos.recurring.put(stamp(ctx, { ...existing, ...fields }));
    return;
  }
  // First fee on the next statement day on or after the card was added.
  const start = nextOccurrence({ schedule: fields.schedule, startDate: account.openingDate }, account.openingDate) ?? account.openingDate;
  await ctx.repos.recurring.put(
    stamp(ctx, {
      ...fields,
      kind: 'bill' as const,
      startDate: start,
      categoryId: categoryId('fees'),
      accountIds: [account.id],
      defaultAccountId: account.id,
      autoPost: true, // the bank always charges it
      system: { kind: 'card_fee' as const, accountId: account.id },
    }),
  );
}

export interface UpcomingItem {
  item: RecurringItem;
  date: LocalDate;
  amountCents: Cents;
}

/** Occurrences in (today, today + days], soonest first. */
export async function upcoming(ctx: AppContext, days: number, kinds: RecurringKind[] = ['bill', 'subscription']): Promise<UpcomingItem[]> {
  const today = ctx.clock.today();
  const items = (await ctx.repos.recurring.all()).filter((r) => !r.archived && kinds.includes(r.kind));
  return items
    .flatMap((item) => occurrences(item, addDays(today, 1), addDays(today, days)).map((date) => ({ item, date, amountCents: occurrenceAmount(item) })))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function listRecurring(ctx: AppContext) {
  const today = ctx.clock.today();
  const items = (await ctx.repos.recurring.all()).filter((r) => !r.archived);
  return items.map((item) => ({ item, next: nextOccurrence(item, today), amountCents: occurrenceAmount(item) }));
}

/** Pending generated transactions waiting for the user to confirm. */
export async function pendingRecurring(ctx: AppContext) {
  return (await ctx.repos.transactions.all()).filter((t) => t.status === 'pending').sort((a, b) => a.date.localeCompare(b.date));
}
