// Quick transactions: save presets, and log one with a single tap.

import { slots, validateQuick, type QuickError } from '../domain/quick';
import type { Id, QuickAction, Transaction } from '../domain/types';
import { stamp, type AppContext } from './context';
import { addTransaction, deleteTransaction } from './transactions';

export class QuickValidationError extends Error {
  constructor(public readonly errors: QuickError[]) {
    super(errors.join(', '));
  }
}

export async function quickSlots(ctx: AppContext) {
  return slots(await ctx.repos.quickActions.all());
}

export type QuickInput = Omit<QuickAction, 'id' | 'createdAt' | 'updatedAt'>;

/** Create or replace the preset in a slot. */
export async function saveQuick(ctx: AppContext, input: QuickInput): Promise<QuickAction> {
  const errs = validateQuick(input, await ctx.repos.accounts.all());
  if (errs.length) throw new QuickValidationError(errs);
  const existing = (await ctx.repos.quickActions.all()).find((q) => q.slot === input.slot);
  const q: QuickAction = stamp(ctx, {
    ...(existing ? { id: existing.id, createdAt: existing.createdAt } : {}),
    ...input,
    type: input.type ?? 'expense',
    ...(input.type === 'income' ? { categoryId: undefined } : {}),
    label: input.label.trim(),
    ...(input.merchant?.trim() ? { merchant: input.merchant.trim() } : { merchant: undefined }),
  });
  await ctx.repos.quickActions.put(q);
  return q;
}

export async function clearQuick(ctx: AppContext, slot: number): Promise<void> {
  const existing = (await ctx.repos.quickActions.all()).find((q) => q.slot === slot);
  if (existing) await ctx.repos.quickActions.delete(existing.id);
}

/** Log the preset now. `accountId` is required when the preset asks each time. */
export async function logQuick(ctx: AppContext, quickId: Id, accountId?: Id): Promise<Transaction> {
  const q = await ctx.repos.quickActions.get(quickId);
  if (!q) throw new Error('quick action not found');
  // "Ask each time" must never silently fall back to a suggested account.
  if (q.accountId === 'ask' && !accountId) throw new Error('choose an account for this quick action');
  return addTransaction(ctx, {
    amountCents: q.amountCents,
    type: q.type ?? 'expense',
    accountId: q.accountId === 'ask' ? accountId : q.accountId,
    // Income files under the Income category on its own; a spending category would be wrong.
    ...(q.type !== 'income' && q.categoryId ? { categoryId: q.categoryId } : {}),
    merchant: q.merchant ?? q.label,
  });
}

/** Undo a quick log (from the toast). */
export const undoQuick = (ctx: AppContext, txId: Id) => deleteTransaction(ctx, txId);
