// Background bookkeeping run on app open (and when the debug clock moves):
// materialise due recurring occurrences and post savings interest. Idempotent.

import { addDays } from '../domain/dates';
import { computeInterest, interestOriginKey } from '../domain/interest';
import { dailyBalances } from '../domain/ledger';
import { dueOccurrences } from '../domain/materialise';
import { categoryId } from '../domain/defaults';
import type { Account, Transaction } from '../domain/types';
import { stamp, type AppContext } from './context';

export async function runAutomations(ctx: AppContext): Promise<{ recurring: number; interest: number }> {
  const today = ctx.clock.today();
  const [items, accounts, txs, settings] = await Promise.all([
    ctx.repos.recurring.all(),
    ctx.repos.accounts.all(),
    ctx.repos.transactions.all(),
    ctx.repos.settings.get(),
  ]);
  const keys = new Set(txs.map((t) => t.originKey).filter((k): k is string => !!k));

  const recurringDrafts = dueOccurrences(items, accounts, keys, today, settings.autoPostRecurring);
  const recurring = await ctx.repos.transactions.insertGenerated(recurringDrafts.map((d) => stamp(ctx, d)));

  const all = recurring > 0 ? await ctx.repos.transactions.all() : txs;
  let interest = 0;
  for (const acc of accounts) {
    if (acc.type !== 'savings' || acc.archived || !acc.interest) continue;
    const drafts = interestDrafts(acc, all, today);
    interest += await ctx.repos.transactions.insertGenerated(drafts.map((d) => stamp(ctx, d)));
  }
  return { recurring, interest };
}

const isInterest = (t: Transaction) => t.originKey?.startsWith('int:') ?? false;

/** Interest for every period that ended before today. */
export function interestDrafts(acc: Account, txs: readonly Transaction[], today: string) {
  const yesterday = addDays(today, -1);
  if (!acc.interest || yesterday < acc.openingDate) return [];
  const days = dailyBalances(acc, txs.filter((t) => !isInterest(t)), acc.openingDate, yesterday);
  return computeInterest(acc.interest, days).postings.map((p) => ({
    type: 'income' as const,
    amountCents: p.cents,
    date: p.date,
    accountId: acc.id,
    categoryId: categoryId('interest'),
    status: 'posted' as const,
    needsReview: false,
    originKey: interestOriginKey(acc.id, p.date),
  }));
}

/** Interest accrued so far this period on a savings account (not yet posted). */
export function accruedInterest(acc: Account, txs: readonly Transaction[], today: string): number {
  const yesterday = addDays(today, -1);
  if (!acc.interest || yesterday < acc.openingDate) return 0;
  const days = dailyBalances(acc, txs.filter((t) => !isInterest(t)), acc.openingDate, yesterday);
  return Math.round(computeInterest(acc.interest, days).accruedCents);
}
