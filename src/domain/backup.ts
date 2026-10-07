import type {
  Account,
  Budget,
  Category,
  Goal,
  MerchantRule,
  Recurring,
  Setting,
  Transaction,
} from './types';

export const BACKUP_APP_ID = 'tameru';
export const BACKUP_FORMAT_VERSION = 1;

export const TABLE_NAMES = [
  'accounts',
  'categories',
  'transactions',
  'merchantRules',
  'budgets',
  'recurring',
  'goals',
  'settings',
] as const;

export type TableName = (typeof TABLE_NAMES)[number];

export interface BackupData {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  merchantRules: MerchantRule[];
  budgets: Budget[];
  recurring: Recurring[];
  goals: Goal[];
  settings: Setting[];
}

export interface Backup {
  app: typeof BACKUP_APP_ID;
  formatVersion: number;
  exportedAt: string;
  data: BackupData;
}

export type BackupValidation =
  { ok: true; backup: Backup; counts: Record<TableName, number> } | { ok: false; error: string };

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function hasBaseFields(row: unknown): boolean {
  return (
    isObject(row) &&
    typeof row.id === 'string' &&
    row.id !== '' &&
    typeof row.createdAt === 'string' &&
    typeof row.updatedAt === 'string' &&
    (row.deletedAt === null || typeof row.deletedAt === 'string')
  );
}

/** Check that parsed JSON is a Tameru backup this version can read. */
export function validateBackup(json: unknown): BackupValidation {
  if (!isObject(json) || json.app !== BACKUP_APP_ID) {
    return { ok: false, error: 'This file is not a Tameru backup.' };
  }
  if (typeof json.formatVersion !== 'number' || json.formatVersion < 1) {
    return { ok: false, error: 'This backup is missing its format version.' };
  }
  if (json.formatVersion > BACKUP_FORMAT_VERSION) {
    return {
      ok: false,
      error: 'This backup was made by a newer version of Tameru. Update the app and try again.',
    };
  }
  if (!isObject(json.data)) {
    return { ok: false, error: 'This backup has no data section.' };
  }

  const data = {} as Record<TableName, unknown[]>;
  const counts = {} as Record<TableName, number>;
  for (const table of TABLE_NAMES) {
    const rows = json.data[table] ?? [];
    if (!Array.isArray(rows) || !rows.every(hasBaseFields)) {
      return { ok: false, error: `The "${table}" section of this backup is damaged.` };
    }
    const ids = new Set(rows.map((row: { id: string }) => row.id));
    if (ids.size !== rows.length) {
      return { ok: false, error: `The "${table}" section of this backup has duplicate records.` };
    }
    data[table] = rows;
    counts[table] = rows.filter(
      (row: { deletedAt: string | null }) => row.deletedAt === null,
    ).length;
  }

  for (const tx of data.transactions as Record<string, unknown>[]) {
    if (!Number.isSafeInteger(tx.amountCents) || typeof tx.date !== 'string') {
      return {
        ok: false,
        error: 'This backup contains a transaction with an invalid amount or date.',
      };
    }
  }

  return {
    ok: true,
    backup: {
      app: BACKUP_APP_ID,
      formatVersion: json.formatVersion,
      exportedAt: typeof json.exportedAt === 'string' ? json.exportedAt : '',
      data: data as unknown as BackupData,
    },
    counts,
  };
}

export function backupFileName(date: string): string {
  return `tameru-backup-${date}.json`;
}
