// Dexie implementation of the repository interfaces.

import type { Table } from 'dexie';
import { DEFAULT_SETTINGS } from '../../domain/defaults';
import type { Settings, Transaction } from '../../domain/types';
import { TABLE_NAMES, TameruDB, type BackupTables } from '../db';
import type { Repo, Repos } from './types';

function tableRepo<T extends { id: string }>(table: Table<T, string>): Repo<T> {
  return {
    get: (id) => table.get(id),
    all: () => table.toArray(),
    put: async (row) => {
      await table.put(row);
    },
    bulkPut: async (rows) => {
      await table.bulkPut(rows);
    },
    delete: (id) => table.delete(id),
  };
}

export function createDexieRepos(db: TameruDB): Repos {
  const allTables = () => TABLE_NAMES.map((n) => db.table(n));

  return {
    accounts: tableRepo(db.accounts),
    categories: tableRepo(db.categories),
    recurring: tableRepo(db.recurring),
    transactions: {
      ...tableRepo(db.transactions),
      inRange: (from, to) => db.transactions.where('date').between(from, to, true, true).toArray(),
      byRecurring: (id) => db.transactions.where('recurringId').equals(id).toArray(),
      insertGenerated: (rows: Transaction[]) =>
        db.transaction('rw', db.transactions, async () => {
          const keys = rows.map((r) => r.originKey).filter((k): k is string => !!k);
          const existing = new Set(
            (await db.transactions.where('originKey').anyOf(keys).toArray()).map((t) => t.originKey),
          );
          const fresh = rows.filter((r) => r.originKey && !existing.has(r.originKey));
          // De-duplicate within the batch too.
          const seen = new Set<string>();
          const unique = fresh.filter((r) => !seen.has(r.originKey!) && !!seen.add(r.originKey!));
          await db.transactions.bulkAdd(unique);
          return unique.length;
        }),
    },
    plans: tableRepo(db.plans),
    allocations: tableRepo(db.allocations),
    budgetMoves: tableRepo(db.budgetMoves),
    segments: tableRepo(db.segments),
    goals: tableRepo(db.goals),
    merchantRules: {
      ...tableRepo(db.merchantRules),
      byKey: (key) => db.merchantRules.where('merchantKey').equals(key).first(),
    },
    events: tableRepo(db.events),
    snapshots: tableRepo(db.snapshots),
    quickActions: tableRepo(db.quickActions),
    settings: {
      get: async () => ({ ...DEFAULT_SETTINGS, ...(await db.settings.get('settings')) }),
      update: (patch) =>
        db.transaction('rw', db.settings, async () => {
          const next: Settings = { ...DEFAULT_SETTINGS, ...(await db.settings.get('settings')), ...patch, id: 'settings' };
          await db.settings.put(next);
          return next;
        }),
    },
    atomic: (fn) => db.transaction('rw', allTables(), fn),
    dumpAll: () =>
      db.transaction('r', allTables(), async () => {
        const out = {} as Record<string, unknown[]>;
        for (const n of TABLE_NAMES) out[n] = await db.table(n).toArray();
        return out as unknown as BackupTables;
      }),
    replaceAll: (tables) =>
      db.transaction('rw', allTables(), async () => {
        for (const n of TABLE_NAMES) {
          await db.table(n).clear();
          await db.table(n).bulkAdd((tables[n] ?? []) as never[]);
        }
      }),
    wipe: () =>
      db.transaction('rw', allTables(), async () => {
        for (const t of allTables()) await t.clear();
      }),
  };
}
