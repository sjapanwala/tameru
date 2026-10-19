// Balances and spending, derived from transactions. Nothing here is stored.
//
// Balances are asset-signed: a credit card with $200 owing has balance −20000.
// An account's opening balance is its balance at the start of openingDate;
// transactions dated before openingDate are history only and do not move the balance.

import { eachDay } from './dates';
import type { Account, Cents, Id, LocalDate, Transaction } from './types';

export interface BalanceOptions {
  includePending?: boolean;
}

const counts = (tx: Transaction, o: BalanceOptions) =>
  tx.status === 'posted' || (o.includePending === true && tx.status === 'pending');

/** How a transaction moves one account's balance. */
export function accountEffect(tx: Transaction, accountId: Id): Cents {
  switch (tx.type) {
    case 'expense':
      return tx.accountId === accountId ? -tx.amountCents : 0;
    case 'income':
    case 'refund':
      return tx.accountId === accountId ? tx.amountCents : 0;
    case 'transfer':
      return (tx.toAccountId === accountId ? tx.amountCents : 0) - (tx.accountId === accountId ? tx.amountCents : 0);
  }
}

const touches = (tx: Transaction, id: Id) => tx.accountId === id || tx.toAccountId === id;

export function balanceAsOf(account: Account, txs: readonly Transaction[], date: LocalDate, o: BalanceOptions = {}): Cents {
  let bal = account.openingBalanceCents;
  for (const tx of txs) {
    if (tx.date < account.openingDate || tx.date > date || !counts(tx, o) || !touches(tx, account.id)) continue;
    bal += accountEffect(tx, account.id);
  }
  return bal;
}

/** End-of-day balance for every day in [from, to]. */
export function dailyBalances(
  account: Account,
  txs: readonly Transaction[],
  from: LocalDate,
  to: LocalDate,
  o: BalanceOptions = {},
): { date: LocalDate; balanceCents: Cents }[] {
  const byDay = new Map<LocalDate, Cents>();
  let start = account.openingBalanceCents;
  for (const tx of txs) {
    if (tx.date < account.openingDate || !counts(tx, o) || !touches(tx, account.id)) continue;
    const eff = accountEffect(tx, account.id);
    if (tx.date < from) start += eff;
    else if (tx.date <= to) byDay.set(tx.date, (byDay.get(tx.date) ?? 0) + eff);
  }
  let bal = start;
  return eachDay(from, to).map((date) => {
    if (date >= account.openingDate) bal += byDay.get(date) ?? 0;
    return { date, balanceCents: date < account.openingDate ? 0 : bal };
  });
}

/** Amount owing on a card (positive), 0 if in credit. */
export const cardOwing = (balanceCents: Cents): Cents => Math.max(0, -balanceCents);

/**
 * Investing accounts track net contributions only: opening contributions
 * plus transfers in minus transfers out. No market value.
 */
export function netContributed(account: Account, txs: readonly Transaction[], asOf: LocalDate): Cents {
  let n = account.openingBalanceCents;
  for (const tx of txs) {
    if (tx.type !== 'transfer' || tx.status !== 'posted' || tx.date > asOf || tx.date < account.openingDate) continue;
    if (tx.toAccountId === account.id) n += tx.amountCents;
    if (tx.accountId === account.id) n -= tx.amountCents;
  }
  return n;
}

/**
 * Spending lines for one transaction: expenses are positive, refunds negative.
 * Transfers and income are never spending.
 */
export function spendingLines(tx: Transaction): { categoryId: Id; cents: Cents }[] {
  if (tx.type !== 'expense' && tx.type !== 'refund') return [];
  const sign = tx.type === 'expense' ? 1 : -1;
  if (tx.splits && tx.splits.length > 0) return tx.splits.map((s) => ({ categoryId: s.categoryId, cents: sign * s.amountCents }));
  return tx.categoryId ? [{ categoryId: tx.categoryId, cents: sign * tx.amountCents }] : [];
}

/**
 * Spending per category in [from, to]. Posted only by default; budgets include
 * pending (a generated bill awaiting confirmation is already committed).
 */
export function spendingByCategory(txs: readonly Transaction[], from: LocalDate, to: LocalDate, o: BalanceOptions = {}): Record<Id, Cents> {
  const out: Record<Id, Cents> = {};
  for (const tx of txs) {
    if (!counts(tx, o) || tx.date < from || tx.date > to) continue;
    for (const l of spendingLines(tx)) out[l.categoryId] = (out[l.categoryId] ?? 0) + l.cents;
  }
  return out;
}

export function totalSpending(txs: readonly Transaction[], from: LocalDate, to: LocalDate): Cents {
  return Object.values(spendingByCategory(txs, from, to)).reduce((a, b) => a + b, 0);
}

export type TxError =
  | 'amount_invalid'
  | 'account_missing'
  | 'transfer_needs_to'
  | 'transfer_same'
  | 'split_mismatch'
  | 'investing_transfer_only'
  | 'date_invalid';

/** Validate a transaction against the user's accounts. Returns every problem found. */
export function validateTransaction(
  tx: Pick<Transaction, 'type' | 'amountCents' | 'date' | 'accountId' | 'toAccountId' | 'splits'>,
  accounts: readonly Account[],
): TxError[] {
  const errs: TxError[] = [];
  if (!Number.isSafeInteger(tx.amountCents) || tx.amountCents <= 0) errs.push('amount_invalid');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tx.date)) errs.push('date_invalid');
  const from = accounts.find((a) => a.id === tx.accountId);
  if (!from) errs.push('account_missing');
  if (tx.type === 'transfer') {
    if (!tx.toAccountId || !accounts.some((a) => a.id === tx.toAccountId)) errs.push('transfer_needs_to');
    else if (tx.toAccountId === tx.accountId) errs.push('transfer_same');
  } else if (from?.type === 'investing') {
    errs.push('investing_transfer_only');
  }
  if (tx.splits && tx.splits.length > 0) {
    const total = tx.splits.reduce((a, s) => a + s.amountCents, 0);
    if (total !== tx.amountCents || tx.splits.some((s) => !Number.isSafeInteger(s.amountCents) || s.amountCents <= 0))
      errs.push('split_mismatch');
  }
  return errs;
}
