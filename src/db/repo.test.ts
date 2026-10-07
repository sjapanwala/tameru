import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { validateBackup } from '../domain/backup';
import { exportAll, importAll } from './backup';
import { db } from './db';
import {
  addTransaction,
  addTransactions,
  finishOnboarding,
  listGoals,
  removeRecurringByOrigin,
  saveAccount,
  saveGoal,
  upsertRecurring,
  completeOnboarding,
  deleteTransactions,
  findImportProfile,
  listBudgets,
  listRecurring,
  recordOccurrence,
  saveImportProfile,
  saveRecurring,
  setBudget,
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
        expect(await getSettings()).toMatchObject({
      currency: 'CAD',
      onboardedAt: null,
      defaultAccountId: null,
      userName: '',
      onboarding: null,
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

describe('plan data', () => {
  it('upserts and removes a budget', async () => {
    await setBudget('cat', 5000);
    await setBudget('cat', 7500);
    expect((await listBudgets()).map((b) => b.monthlyCents)).toEqual([7500]);
    await setBudget('cat', 0);
    expect(await listBudgets()).toEqual([]);
  });

  it('records a bill occurrence as a linked expense', async () => {
    const account = await onboard();
    await saveRecurring(null, {
      name: 'Rent',
      amountCents: 150000,
      kind: 'bill',
      categoryId: null,
      schedule: { freq: 'monthly', anchorDate: '2026-10-01' },
    });
    const [rent] = await listRecurring();
    const tx = await recordOccurrence(rent!, '2026-10-01', '2026-10-02', account.id);
    expect(tx).toMatchObject({
      date: '2026-10-02',
      amountCents: -150000,
      merchant: 'Rent',
      recurringId: rent!.id,
      recurringDate: '2026-10-01',
    });
  });

  it('bulk-adds and bulk-undoes imported transactions', async () => {
    const account = await onboard();
    const ids = await addTransactions([
      expense(account.id),
      expense(account.id, { amountCents: -1 }),
    ]);
    expect(await listTransactions()).toHaveLength(2);
    await deleteTransactions(ids);
    expect(await listTransactions()).toEqual([]);
  });

  it('remembers one import profile per file layout', async () => {
    const mapping = {
      hasHeader: true,
      dateColumn: 0,
      dateFormat: 'MDY' as const,
      descriptionColumn: 1,
      amountColumn: 2,
      debitColumn: -1,
      creditColumn: -1,
      invertAmount: false,
    };
    await saveImportProfile('h:a|b|c', 'My bank', mapping);
    await saveImportProfile('h:a|b|c', 'My bank (card)', { ...mapping, invertAmount: true });
    expect(await db.importProfiles.count()).toBe(1);
    expect(await findImportProfile('h:a|b|c')).toMatchObject({
      name: 'My bank (card)',
      mapping: { invertAmount: true },
    });
  });
});

describe('onboarding writes', () => {
  const rent = {
    name: 'Rent',
    amountCents: 150000,
    kind: 'bill' as const,
    categoryId: null,
    schedule: { freq: 'monthly' as const, anchorDate: '2026-10-01' },
  };

  it('upserts recurring items by origin, so going back never duplicates', async () => {
    const first = await upsertRecurring('bill:rent', rent);
    const second = await upsertRecurring('bill:rent', { ...rent, amountCents: 160000 });
    expect(second).toBe(first);
    const items = await listRecurring();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ amountCents: 160000, origin: 'bill:rent' });

    await removeRecurringByOrigin('bill:rent');
    expect(await listRecurring()).toEqual([]);
    // Re-adding after removal makes a fresh record rather than reviving the old one.
    expect(await upsertRecurring('bill:rent', rent)).not.toBe(first);
    expect(await listRecurring()).toHaveLength(1);
  });

  it('updates an account in place', async () => {
    const id = await saveAccount(null, { name: 'Chequing', type: 'chequing', startingBalanceCents: 0 });
    expect(await saveAccount(id, { startingBalanceCents: 125000, color: '#a5482c' })).toBe(id);
    expect(await listAccounts()).toHaveLength(1);
    expect((await listAccounts())[0]).toMatchObject({ name: 'Chequing', startingBalanceCents: 125000 });
  });

  it('keeps earlier versions of a goal when its numbers change', async () => {
    const goal = { name: 'Trip', targetCents: 300000, savedCents: 0, monthlyContributionCents: 25000, targetDate: '2027-06-01' };
    const id = await saveGoal(null, goal);
    await saveGoal(id, { name: 'Japan trip' }); // a rename isn't a revision
    await saveGoal(id, { targetCents: 400000, monthlyContributionCents: 30000 });
    const [saved] = await listGoals();
    expect(saved).toMatchObject({ name: 'Japan trip', targetCents: 400000 });
    expect(saved?.revisions).toHaveLength(1);
    expect(saved?.revisions?.[0]).toMatchObject({ targetCents: 300000, monthlyContributionCents: 25000, targetDate: '2027-06-01' });
  });

  it('finishes onboarding with an everyday account and categories even if every chapter was skipped', async () => {
    await finishOnboarding();
    const settings = await getSettings();
    expect(settings.onboardedAt).not.toBeNull();
    const [account] = await listAccounts();
    expect(settings.defaultAccountId).toBe(account?.id);
    expect(await listCategories()).toHaveLength(5);
  });

  it('defaults new transactions to chequing over savings', async () => {
    await saveAccount(null, { name: 'Rainy day', type: 'savings', startingBalanceCents: 500000 });
    const chequing = await saveAccount(null, { name: 'Daily', type: 'chequing', startingBalanceCents: 90000 });
    await finishOnboarding();
    expect((await getSettings()).defaultAccountId).toBe(chequing);
    expect(await listAccounts()).toHaveLength(2);
  });

  it('remembers where onboarding got to', async () => {
    await setSetting('onboarding', { v: 1, stage: 'setup', step: 'payday.date' });
    expect((await getSettings()).onboarding).toMatchObject({ step: 'payday.date' });
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
