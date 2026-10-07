import type { Table } from 'dexie';
import { sortNewestFirst } from '../domain/activity';
import { DEFAULT_CATEGORIES, DEFAULT_SETTINGS } from '../domain/defaults';
import type { RuleSuggestion } from '../domain/merchant';
import { signedAmount } from '../domain/recurring';
import type {
  Account,
  AppSettings,
  BaseRecord,
  Budget,
  Category,
  CsvMapping,
  Goal,
  ImportProfile,
  ISODate,
  MerchantRule,
  NewRecord,
  Recurring,
  Transaction,
} from '../domain/types';
import { db } from './db';

// ---- generic record helpers -------------------------------------------

export function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // randomUUID needs a secure context; fall back for plain-http dev on a LAN.
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const hex = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const nowISO = () => new Date().toISOString();

export function stamp<T extends BaseRecord>(fields: NewRecord<T>): T {
  const now = nowISO();
  return { ...fields, id: newId(), createdAt: now, updatedAt: now, deletedAt: null } as T;
}

async function create<T extends BaseRecord>(
  table: Table<T, string>,
  fields: NewRecord<T>,
): Promise<T> {
  const record = stamp<T>(fields);
  await table.add(record);
  return record;
}

async function patch<T extends BaseRecord>(
  table: Table<T, string>,
  id: string,
  changes: Partial<T>,
): Promise<void> {
  // Dexie's UpdateSpec type is too deep for a generic T; the shape is checked by callers.
  await table.update(id, { ...changes, updatedAt: nowISO() } as never);
}

const softDelete = <T extends BaseRecord>(table: Table<T, string>, id: string) =>
  patch(table, id, { deletedAt: nowISO() } as Partial<T>);

const restore = <T extends BaseRecord>(table: Table<T, string>, id: string) =>
  patch(table, id, { deletedAt: null } as Partial<T>);

const live = <T extends BaseRecord>(rows: T[]) => rows.filter((row) => row.deletedAt === null);

// ---- settings ----------------------------------------------------------

export async function getSettings(): Promise<AppSettings> {
  const settings: AppSettings = { ...DEFAULT_SETTINGS };
  for (const row of live(await db.settings.toArray())) {
    if (row.key in settings) Object.assign(settings, { [row.key]: row.value });
  }
  return settings;
}

export async function setSetting<K extends keyof AppSettings>(
  key: K,
  value: AppSettings[K],
): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    const existing = await db.settings.where('key').equals(key).first();
    if (existing) await patch(db.settings, existing.id, { value, deletedAt: null });
    else await create(db.settings, { key, value });
  });
}

// ---- accounts & categories ---------------------------------------------

export async function listAccounts(): Promise<Account[]> {
  return live(await db.accounts.toArray()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function listCategories(): Promise<Category[]> {
  return live(await db.categories.toArray()).sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
  );
}

/** Create a category, or return the live one that already has this name. */
export async function addCategory(name: string): Promise<Category> {
  const clean = name.replace(/\s+/g, ' ').trim();
  return db.transaction('rw', db.categories, async () => {
    const existing = await listCategories();
    const match = existing.find((c) => c.name.toLowerCase() === clean.toLowerCase());
    if (match) return match;
    const sortOrder = Math.max(-1, ...existing.map((c) => c.sortOrder)) + 1;
    return create<Category>(db.categories, { name: clean, sortOrder });
  });
}

/** Create or update an account; returns its id. */
export async function saveAccount(
  id: string | null,
  fields: NewRecord<Account> | Partial<NewRecord<Account>>,
): Promise<string> {
  if (id) {
    await patch<Account>(db.accounts, id, fields);
    return id;
  }
  return (await create<Account>(db.accounts, fields as NewRecord<Account>)).id;
}

export const deleteAccount = (id: string) => softDelete(db.accounts, id);

async function ensureDefaultCategories(): Promise<void> {
  if ((await listCategories()).length > 0) return;
  await db.categories.bulkAdd(
    DEFAULT_CATEGORIES.map((name, sortOrder) => stamp<Category>({ name, sortOrder })),
  );
}

/**
 * The last step of onboarding: make sure the basics exist, pick the account
 * new transactions default to, and mark setup as finished.
 */
export async function finishOnboarding(): Promise<void> {
  await db.transaction('rw', db.accounts, db.categories, db.settings, async () => {
    let accounts = await listAccounts();
    if (!accounts.some((account) => account.type === 'chequing' || account.type === 'cash')) {
      // Skipped the accounts chapter: transactions still need somewhere to live.
      await saveAccount(null, { name: 'Everyday', type: 'chequing', startingBalanceCents: 0 });
      accounts = await listAccounts();
    }
    const everyday =
      accounts.find((a) => a.type === 'chequing') ?? accounts.find((a) => a.type === 'cash');
    await ensureDefaultCategories();
    await setSetting('defaultAccountId', everyday?.id ?? null);
    await setSetting('onboardedAt', nowISO());
  });
}

export interface OnboardingInput {
  currency: string;
  accountName: string;
  startingBalanceCents: number;
}

/** First-run setup: currency, one account, default categories. */
export async function completeOnboarding(input: OnboardingInput): Promise<void> {
  await db.transaction('rw', db.accounts, db.categories, db.settings, async () => {
    const account = await create(db.accounts, {
      name: input.accountName.trim() || 'Chequing',
      type: 'chequing',
      startingBalanceCents: input.startingBalanceCents,
    });
    if ((await listCategories()).length === 0) {
      await db.categories.bulkAdd(
        DEFAULT_CATEGORIES.map((name, sortOrder) => stamp<Category>({ name, sortOrder })),
      );
    }
    await setSetting('currency', input.currency);
    await setSetting('defaultAccountId', account.id);
    await setSetting('onboardedAt', nowISO());
  });
}

// ---- transactions ------------------------------------------------------

/** Live transactions, newest first. `limit` caps how many rows are read. */
export async function listTransactions(limit?: number): Promise<Transaction[]> {
  let query = db.transactions
    .orderBy('date')
    .reverse()
    .filter((tx) => tx.deletedAt === null);
  if (limit !== undefined) query = query.limit(limit);
  return sortNewestFirst(await query.toArray());
}

export const addTransaction = (fields: NewRecord<Transaction>) => create(db.transactions, fields);

export const updateTransaction = (id: string, changes: Partial<NewRecord<Transaction>>) =>
  patch<Transaction>(db.transactions, id, changes);

export const deleteTransaction = (id: string) => softDelete(db.transactions, id);

export const restoreTransaction = (id: string) => restore(db.transactions, id);

// ---- merchant rules ----------------------------------------------------

export async function listRules(): Promise<MerchantRule[]> {
  return live(await db.merchantRules.toArray()).sort((a, b) =>
    a.cleanName.localeCompare(b.cleanName),
  );
}

/** Create the rule, or update the live rule that already has this pattern. */
export async function saveRule(rule: RuleSuggestion): Promise<void> {
  await db.transaction('rw', db.merchantRules, async () => {
    const existing = live(
      await db.merchantRules.where('pattern').equals(rule.pattern).toArray(),
    )[0];
    if (existing) await patch(db.merchantRules, existing.id, rule);
    else await create(db.merchantRules, rule);
  });
}

export const deleteRule = (id: string) => softDelete(db.merchantRules, id);

export const restoreRule = (id: string) => restore(db.merchantRules, id);

// ---- budgets -----------------------------------------------------------

export async function listBudgets(): Promise<Budget[]> {
  return live(await db.budgets.toArray());
}

/** Set a category's monthly budget; zero removes it. */
export async function setBudget(categoryId: string, monthlyCents: number): Promise<void> {
  await db.transaction('rw', db.budgets, async () => {
    const existing = live(await db.budgets.where('categoryId').equals(categoryId).toArray())[0];
    if (monthlyCents <= 0) {
      if (existing) await softDelete(db.budgets, existing.id);
    } else if (existing) {
      await patch<Budget>(db.budgets, existing.id, { monthlyCents });
    } else {
      await create<Budget>(db.budgets, { categoryId, monthlyCents });
    }
  });
}

// ---- recurring bills & income -------------------------------------------

export async function listRecurring(): Promise<Recurring[]> {
  return live(await db.recurring.toArray()).sort((a, b) => a.name.localeCompare(b.name));
}

/** Create or update; returns the record's id. */
export async function saveRecurring(
  id: string | null,
  fields: NewRecord<Recurring> | Partial<NewRecord<Recurring>>,
): Promise<string> {
  if (id) {
    await patch<Recurring>(db.recurring, id, fields);
    return id;
  }
  return (await create<Recurring>(db.recurring, fields as NewRecord<Recurring>)).id;
}

/**
 * Create or update the live item with this origin key. Saving twice (going
 * back in onboarding, re-opening a bill chip) never makes a second record.
 */
export async function upsertRecurring(
  origin: string,
  fields: Omit<NewRecord<Recurring>, 'origin'>,
): Promise<string> {
  return db.transaction('rw', db.recurring, async () => {
    const existing = live(await db.recurring.toArray()).find((item) => item.origin === origin);
    return saveRecurring(existing?.id ?? null, { ...fields, origin });
  });
}

export async function removeRecurringByOrigin(origin: string): Promise<void> {
  await db.transaction('rw', db.recurring, async () => {
    for (const item of live(await db.recurring.toArray())) {
      if (item.origin === origin) await softDelete(db.recurring, item.id);
    }
  });
}

export const deleteRecurring = (id: string) => softDelete(db.recurring, id);

export const restoreRecurring = (id: string) => restore(db.recurring, id);

/**
 * Record one occurrence of a recurring item as a transaction (bill paid or
 * income received). The link back to the occurrence keeps it out of
 * "variable spend" and out of the forecast. `actualCents` is what really
 * arrived or was paid, when that differs from the planned amount.
 */
export function recordOccurrence(
  item: Recurring,
  occurrenceDate: ISODate,
  paidOn: ISODate,
  accountId: string,
  actualCents: number = item.amountCents,
): Promise<Transaction> {
  return addTransaction({
    date: paidOn,
    amountCents: signedAmount({ kind: item.kind, amountCents: actualCents }),
    accountId,
    categoryId: item.categoryId,
    merchant: item.name,
    rawDescriptor: item.name,
    note: '',
    needsReview: false,
    recurringId: item.id,
    recurringDate: occurrenceDate,
  });
}

// ---- goals ---------------------------------------------------------------

export async function listGoals(): Promise<Goal[]> {
  return live(await db.goals.toArray()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * Create or update a goal; returns its id. When the target, date or monthly
 * amount changes, the previous numbers are kept in `revisions`.
 */
export async function saveGoal(
  id: string | null,
  fields: NewRecord<Goal> | Partial<NewRecord<Goal>>,
): Promise<string> {
  if (!id) return (await create<Goal>(db.goals, fields as NewRecord<Goal>)).id;
  await db.transaction('rw', db.goals, async () => {
    const before = await db.goals.get(id);
    if (!before) return;
    const changed = (['targetCents', 'monthlyContributionCents', 'targetDate'] as const).some(
      (key) => fields[key] !== undefined && fields[key] !== before[key],
    );
    const revisions = changed
      ? [
          ...(before.revisions ?? []),
          {
            at: nowISO(),
            targetCents: before.targetCents,
            monthlyContributionCents: before.monthlyContributionCents,
            targetDate: before.targetDate,
          },
        ]
      : before.revisions;
    await patch<Goal>(db.goals, id, { ...fields, revisions });
  });
  return id;
}

export const deleteGoal = (id: string) => softDelete(db.goals, id);

export const restoreGoal = (id: string) => restore(db.goals, id);

// ---- CSV import ----------------------------------------------------------

/** Add many transactions at once; all or nothing. Returns their ids. */
export async function addTransactions(rows: NewRecord<Transaction>[]): Promise<string[]> {
  const records = rows.map((fields) => stamp<Transaction>(fields));
  await db.transactions.bulkAdd(records);
  return records.map((record) => record.id);
}

/** Undo for a CSV import. */
export async function deleteTransactions(ids: string[]): Promise<void> {
  await db.transaction('rw', db.transactions, async () => {
    for (const id of ids) await softDelete(db.transactions, id);
  });
}

export async function findImportProfile(signature: string): Promise<ImportProfile | undefined> {
  return live(await db.importProfiles.where('signature').equals(signature).toArray())[0];
}

/** Remember how a bank's file layout maps to transactions. */
export async function saveImportProfile(
  signature: string,
  name: string,
  mapping: CsvMapping,
): Promise<void> {
  await db.transaction('rw', db.importProfiles, async () => {
    const existing = await findImportProfile(signature);
    if (existing) await patch<ImportProfile>(db.importProfiles, existing.id, { name, mapping });
    else await create<ImportProfile>(db.importProfiles, { signature, name, mapping });
  });
}
