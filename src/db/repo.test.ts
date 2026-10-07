import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { validateBackup } from '../domain/backup';
import { exportAll, importAll } from './backup';
import { db } from './db';
import {
  addTransaction,
  completeOnboarding,
  deleteTransaction,
  getSettings,
  listAccounts,
  listCategories,
  listRules,
  listTransactions,
  restoreTransaction,
  saveRule,
  setSetting,
  updateTransaction,
} from './repo';
import { loadSampleData } from './sample';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

async function onboard() {
  await completeOnboarding({
    currency: 'CAD',
    accountName: 'Chequing',
    startingBalanceCents: 50000,
  });
  const [account] = await listAccounts();
  return account!;
}

const expense = (accountId: string, over: object = {}) => ({
  date: '2026-10-07',
  amountCents: -450,
  accountId,
  categoryId: null,
  merchant: "Joe's Coffee",
  rawDescriptor: 'joes coffee',
  note: '',
  needsReview: true,
  ...over,
});

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('onboarding', () => {
  it('starts un-onboarded with defaults', async () => {
    expect(await getSettings()).toEqual({
      currency: 'CAD',
      onboardedAt: null,
      defaultAccountId: null,
    });
  });

  it('creates the account, default categories and settings', async () => {
    const account = await onboard();
    expect(account).toMatchObject({
      name: 'Chequing',
      startingBalanceCents: 50000,
      deletedAt: null,
    });
    expect(account.id).toMatch(UUID);
    expect((await listCategories()).map((c) => c.name)).toEqual([
      'Groceries',
      'Dining out',
      'Transport',
      'Fun',
      'Health',
    ]);
    const settings = await getSettings();
    expect(settings.defaultAccountId).toBe(account.id);
    expect(settings.onboardedAt).not.toBeNull();
  });

  it('updates a setting in place', async () => {
    await setSetting('currency', 'USD');
    await setSetting('currency', 'EUR');
    expect((await getSettings()).currency).toBe('EUR');
    expect(await db.settings.count()).toBe(1);
  });
});

describe('transactions', () => {
  it('adds, edits, soft-deletes and restores', async () => {
    const account = await onboard();
    const tx = await addTransaction(expense(account.id));
    expect(tx.id).toMatch(UUID);
    expect(tx.createdAt).toBe(tx.updatedAt);

    await updateTransaction(tx.id, { amountCents: -500, needsReview: false });
    expect((await listTransactions())[0]).toMatchObject({ amountCents: -500, needsReview: false });

    await deleteTransaction(tx.id);
    expect(await listTransactions()).toEqual([]);
    expect((await db.transactions.get(tx.id))?.deletedAt).not.toBeNull();

    await restoreTransaction(tx.id);
    expect(await listTransactions()).toHaveLength(1);
  });

  it('lists newest first', async () => {
    const account = await onboard();
    await addTransaction(expense(account.id, { date: '2026-10-01', merchant: 'Old' }));
    await addTransaction(expense(account.id, { date: '2026-10-07', merchant: 'New' }));
    await addTransaction(expense(account.id, { date: '2026-10-04', merchant: 'Mid' }));
    expect((await listTransactions()).map((t) => t.merchant)).toEqual(['New', 'Mid', 'Old']);
    expect((await listTransactions(2)).map((t) => t.merchant)).toEqual(['New', 'Mid']);
  });
});

describe('merchant rules', () => {
  it('upserts by pattern', async () => {
    await saveRule({ pattern: 'joes coffee', cleanName: "Joe's Coffee", categoryId: 'a' });
    await saveRule({ pattern: 'joes coffee', cleanName: "Joe's Coffee", categoryId: 'b' });
    const rules = await listRules();
    expect(rules).toHaveLength(1);
    expect(rules[0]?.categoryId).toBe('b');
  });
});

describe('backup', () => {
  it('round-trips every table through JSON, including soft-deleted rows', async () => {
    await loadSampleData();
    const account = (await listAccounts())[0]!;
    const doomed = await addTransaction(expense(account.id));
    await deleteTransaction(doomed.id);

    const before = await exportAll();
    const parsed = validateBackup(JSON.parse(JSON.stringify(before)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.counts.transactions).toBeGreaterThan(20);
    expect(parsed.counts.transactions).toBe(before.data.transactions.length - 1);

    await db.delete();
    await db.open();
    expect(await listTransactions()).toEqual([]);

    await importAll(parsed.backup);
    const after = await exportAll();
    expect(after.data).toEqual(before.data);
    expect((await getSettings()).onboardedAt).not.toBeNull();
  });

  it('leaves existing data untouched when an import fails', async () => {
    const account = await onboard();
    await addTransaction(expense(account.id));
    const backup = await exportAll();
    const broken = structuredClone(backup);
    broken.data.settings.push({ ...broken.data.settings[0]!, id: 'dupe-key' });

    await expect(importAll(broken)).rejects.toThrow();
    expect(await listTransactions()).toHaveLength(1);
    expect(await listAccounts()).toHaveLength(1);
  });
});
