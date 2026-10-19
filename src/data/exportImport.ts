// Export/import: full JSON backup and transaction CSV.

import { makeBackup, parseBackup } from '../domain/backup';
import { csvToTransactions, transactionsToCsv } from '../domain/csv';
import { merchantKey } from '../domain/merchant';
import type { Transaction } from '../domain/types';
import type { AppContext } from '../services/context';
import { stamp } from '../services/context';
import { SCHEMA_VERSION, TABLE_NAMES, type BackupTables } from './db';

export async function exportJson(ctx: AppContext): Promise<string> {
  const tables = await ctx.repos.dumpAll();
  return JSON.stringify(makeBackup(tables, SCHEMA_VERSION, ctx.clock.now().toISOString()), null, 2);
}

/** Replaces all data with the backup. Nothing changes if the file is invalid. */
export async function importJson(ctx: AppContext, json: string): Promise<{ ok: true; records: number } | { ok: false; error: string }> {
  const parsed = parseBackup<BackupTables>(json, TABLE_NAMES);
  if (!parsed.ok) return parsed;
  await ctx.repos.replaceAll(parsed.backup.tables);
  const records = Object.values(parsed.backup.tables).reduce((n, t) => n + t.length, 0);
  return { ok: true, records };
}

export async function exportCsv(ctx: AppContext): Promise<string> {
  const [txs, accounts, cats] = await Promise.all([ctx.repos.transactions.all(), ctx.repos.accounts.all(), ctx.repos.categories.all()]);
  return transactionsToCsv(txs, accounts, cats);
}

/** Adds transactions from CSV. Imported rows without a known category are marked for review. */
export async function importCsv(ctx: AppContext, text: string, defaultAccountId?: string) {
  const [accounts, cats] = await Promise.all([ctx.repos.accounts.all(), ctx.repos.categories.all()]);
  const res = csvToTransactions(text, accounts, cats, defaultAccountId);
  const rows: Transaction[] = res.drafts.map((d) =>
    stamp(ctx, {
      ...d,
      ...(d.merchant ? { merchantKey: merchantKey(d.merchant) } : {}),
      needsReview: d.type !== 'transfer' && !d.categoryId && !d.splits,
    }),
  );
  await ctx.repos.transactions.bulkPut(rows);
  return { imported: rows.length, skipped: res.skipped };
}
