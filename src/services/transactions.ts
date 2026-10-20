// Transaction orchestration: validate → categorise → save.

import { merchantKey } from '../domain/merchant';
import { validateTransaction, type TxError } from '../domain/ledger';
import type { Cents, Id, LocalDate, Split, Transaction, TransactionType } from '../domain/types';
import { stamp, type AppContext } from './context';
import { learnFromChoice, suggestFor } from './categorise';

export interface TxInput {
  amountCents: Cents;
  type?: TransactionType;
  date?: LocalDate;
  accountId?: Id;
  toAccountId?: Id;
  categoryId?: Id;
  splits?: Split[];
  merchant?: string;
  note?: string;
  goalId?: Id;
}

export class TxValidationError extends Error {
  constructor(public readonly errors: TxError[]) {
    super(errors.join(', '));
  }
}

export async function addTransaction(ctx: AppContext, input: TxInput): Promise<Transaction> {
  const type = input.type ?? 'expense';
  const merchant = input.merchant?.trim() || undefined;
  const key = merchant ? merchantKey(merchant) : undefined;
  let { accountId, categoryId, goalId } = input;
  // A transfer into an account linked to exactly one goal counts toward that goal.
  if (type === 'transfer' && !goalId && input.toAccountId) {
    const linked = (await ctx.repos.goals.all()).filter((g) => !g.archived && g.accountId === input.toAccountId);
    if (linked.length === 1) goalId = linked[0]!.id;
  }
  let needsReview = false;
  if (type !== 'transfer' && (!accountId || (!categoryId && !input.splits?.length))) {
    const s = await suggestFor(ctx, { amountCents: input.amountCents, merchant, type });
    accountId ??= s.accountId;
    if (!categoryId && !input.splits?.length) {
      categoryId = s.categoryId;
      needsReview = s.source !== 'rule';
    }
  }
  const tx: Transaction = stamp(ctx, {
    type,
    amountCents: input.amountCents,
    date: input.date ?? ctx.clock.today(),
    accountId: accountId ?? '',
    ...(input.toAccountId ? { toAccountId: input.toAccountId } : {}),
    ...(type !== 'transfer' && categoryId && !input.splits?.length ? { categoryId } : {}),
    ...(input.splits?.length ? { splits: input.splits } : {}),
    ...(merchant ? { merchant, merchantKey: key } : {}),
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    ...(goalId ? { goalId } : {}),
    status: 'posted' as const,
    needsReview,
    enteredAt: ctx.clock.now().toISOString(),
  });
  const errors = validateTransaction(tx, await ctx.repos.accounts.all());
  if (errors.length) throw new TxValidationError(errors);
  await ctx.repos.transactions.put(tx);
  // The user explicitly chose this category (rather than accepting a suggestion): learn from it.
  if (input.categoryId && key) await learnFromChoice(ctx, key, input.categoryId);
  return tx;
}

export async function updateTransaction(ctx: AppContext, id: Id, patch: Partial<TxInput & { status: Transaction['status'] }>): Promise<Transaction> {
  const cur = await ctx.repos.transactions.get(id);
  if (!cur) throw new Error('transaction not found');
  const merchant = patch.merchant !== undefined ? patch.merchant.trim() || undefined : cur.merchant;
  const next: Transaction = stamp(ctx, { ...cur, ...patch, id, merchant, merchantKey: merchant ? merchantKey(merchant) : undefined });
  if (patch.splits !== undefined && patch.splits.length === 0) delete next.splits;
  if (patch.splits?.length) delete next.categoryId;
  const errors = validateTransaction(next, await ctx.repos.accounts.all());
  if (errors.length) throw new TxValidationError(errors);
  await ctx.repos.transactions.put(next);
  return next;
}

/** Change category; this is a correction the categoriser learns from. */
export async function recategorise(ctx: AppContext, id: Id, categoryId: Id): Promise<Transaction> {
  const cur = await ctx.repos.transactions.get(id);
  if (!cur) throw new Error('transaction not found');
  const next: Transaction = stamp(ctx, { ...cur, categoryId, needsReview: false });
  delete next.splits;
  await ctx.repos.transactions.put(next);
  if (cur.merchantKey) await learnFromChoice(ctx, cur.merchantKey, categoryId);
  return next;
}

export async function confirmTransaction(ctx: AppContext, id: Id): Promise<void> {
  const cur = await ctx.repos.transactions.get(id);
  if (!cur) return;
  await ctx.repos.transactions.put(stamp(ctx, { ...cur, status: cur.status === 'pending' ? 'posted' : cur.status, needsReview: false }));
}

/**
 * Generated occurrences are kept as 'skipped' so they are never regenerated;
 * manual entries are removed. Returns the record as it was, for undo.
 */
export async function deleteTransaction(ctx: AppContext, id: Id): Promise<Transaction | undefined> {
  const cur = await ctx.repos.transactions.get(id);
  if (!cur) return undefined;
  if (cur.originKey) await ctx.repos.transactions.put(stamp(ctx, { ...cur, status: 'skipped' }));
  else await ctx.repos.transactions.delete(id);
  return cur;
}

/** Undo a delete: put the record back exactly as deleteTransaction returned it. */
export async function restoreTransaction(ctx: AppContext, tx: Transaction): Promise<void> {
  await ctx.repos.transactions.put(tx);
}

export function transfer(ctx: AppContext, from: Id, to: Id, amountCents: Cents, opts: { date?: LocalDate; note?: string; goalId?: Id } = {}) {
  return addTransaction(ctx, { type: 'transfer', amountCents, accountId: from, toAccountId: to, ...opts });
}

export interface DayGroup {
  date: LocalDate;
  transactions: Transaction[];
  spentCents: Cents; // expenses − refunds that day
  inCents: Cents; // income that day
}

export async function listByDay(ctx: AppContext, from: LocalDate, to: LocalDate): Promise<DayGroup[]> {
  const txs = (await ctx.repos.transactions.inRange(from, to)).filter((t) => t.status !== 'skipped');
  const days = new Map<LocalDate, DayGroup>();
  for (const t of txs) {
    const g = days.get(t.date) ?? { date: t.date, transactions: [], spentCents: 0, inCents: 0 };
    g.transactions.push(t);
    if (t.status === 'posted') {
      if (t.type === 'expense') g.spentCents += t.amountCents;
      if (t.type === 'refund') g.spentCents -= t.amountCents;
      if (t.type === 'income') g.inCents += t.amountCents;
    }
    days.set(t.date, g);
  }
  return [...days.values()].sort((a, b) => b.date.localeCompare(a.date));
}
