// Plain object factories for domain tests.
import type { Account, Category, RecurringItem, Transaction } from '../src/domain/types';

let n = 0;
const base = () => ({ id: `f${++n}`, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' });

export const account = (p: Partial<Account> = {}): Account => ({
  ...base(), name: 'Chequing', type: 'chequing', currency: 'CAD', openingBalanceCents: 0, openingDate: '2026-01-01', archived: false, ...p,
});

export const tx = (p: Partial<Transaction> = {}): Transaction => ({
  ...base(), type: 'expense', amountCents: 1000, date: '2026-01-10', accountId: 'acc', status: 'posted', needsReview: false, ...p,
});

export const recurring = (p: Partial<RecurringItem> = {}): RecurringItem => ({
  ...base(), name: 'Rent', kind: 'bill', amount: { fixedCents: 100000 }, schedule: { freq: 'monthly', day: 1 },
  startDate: '2026-01-01', categoryId: 'cat_bills', accountIds: ['acc'], defaultAccountId: 'acc', autoPost: null, archived: false, ...p,
});

export const category = (p: Partial<Category> = {}): Category => ({
  ...base(), name: 'Groceries', group: 'essentials', behaviour: 'reset', isBuffer: false, sortOrder: 0, archived: false, ...p,
});
