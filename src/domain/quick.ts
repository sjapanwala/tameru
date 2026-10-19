// Quick transactions: one-tap presets on Home for unscheduled everyday spending.

import type { Account, QuickAction } from './types';

export const QUICK_SLOTS = 4;

export type QuickError = 'amount_invalid' | 'label_missing' | 'account_missing' | 'slot_invalid';

export function validateQuick(q: Pick<QuickAction, 'slot' | 'label' | 'amountCents' | 'accountId' | 'merchant'>, accounts: readonly Account[]): QuickError[] {
  const errs: QuickError[] = [];
  if (!Number.isSafeInteger(q.amountCents) || q.amountCents <= 0) errs.push('amount_invalid');
  if (!q.label.trim() && !q.merchant?.trim()) errs.push('label_missing');
  if (q.accountId !== 'ask' && !accounts.some((a) => a.id === q.accountId && !a.archived && a.type !== 'investing')) errs.push('account_missing');
  if (!Number.isInteger(q.slot) || q.slot < 0 || q.slot >= QUICK_SLOTS) errs.push('slot_invalid');
  return errs;
}

/** Presets laid out by slot; empty slots are null. */
export function slots(actions: readonly QuickAction[]): (QuickAction | null)[] {
  return Array.from({ length: QUICK_SLOTS }, (_, i) => actions.find((a) => a.slot === i) ?? null);
}

/** The label shown under the button: the user's label, else the vendor. */
export const quickLabel = (q: Pick<QuickAction, 'label' | 'merchant'>): string => q.label.trim() || q.merchant?.trim() || '';
