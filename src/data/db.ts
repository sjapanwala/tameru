// IndexedDB schema (via Dexie) with a versioned migration registry.
// To change the schema: append a new entry to MIGRATIONS. Never edit an old one.

import Dexie, { type Table, type Transaction as DexieTx } from 'dexie';
import type {
  Account,
  Allocation,
  BudgetMove,
  Category,
  EventLogEntry,
  Goal,
  MerchantRule,
  PeriodSegment,
  PeriodSnapshot,
  Plan,
  QuickAction,
  RecurringItem,
  Settings,
  Transaction,
} from '../domain/types';

export interface Migration {
  version: number;
  stores: Record<string, string | null>;
  upgrade?: (tx: DexieTx) => Promise<void>;
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    stores: {
      accounts: 'id',
      categories: 'id',
      recurring: 'id',
      // originKey is unique: generated transactions (recurring, interest) can never be inserted twice.
      transactions: 'id, date, accountId, toAccountId, categoryId, recurringId, &originKey, merchantKey',
      plans: 'id',
      allocations: 'id, periodStart, [periodStart+categoryId]',
      budgetMoves: 'id, periodStart',
      segments: 'id, periodStart',
      goals: 'id',
      merchantRules: 'id, &merchantKey',
      events: 'id, at, type',
      snapshots: 'id, &periodStart',
      settings: 'id',
    },
  },
  {
    // v2: one-tap quick transaction presets on Home.
    version: 2,
    stores: { quickActions: 'id, slot' },
  },
];

export const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]!.version;

export class TameruDB extends Dexie {
  accounts!: Table<Account, string>;
  categories!: Table<Category, string>;
  recurring!: Table<RecurringItem, string>;
  transactions!: Table<Transaction, string>;
  plans!: Table<Plan, string>;
  allocations!: Table<Allocation, string>;
  budgetMoves!: Table<BudgetMove, string>;
  segments!: Table<PeriodSegment, string>;
  goals!: Table<Goal, string>;
  merchantRules!: Table<MerchantRule, string>;
  events!: Table<EventLogEntry, string>;
  snapshots!: Table<PeriodSnapshot, string>;
  settings!: Table<Settings, string>;
  quickActions!: Table<QuickAction, string>;

  constructor(name = 'tameru') {
    super(name);
    for (const m of MIGRATIONS) {
      const v = this.version(m.version).stores(m.stores);
      if (m.upgrade) v.upgrade(m.upgrade);
    }
  }
}

/** Every table that exists after all migrations (a later migration can add tables, or delete them with null). */
const finalStores = MIGRATIONS.reduce<Record<string, string | null>>((all, m) => ({ ...all, ...m.stores }), {});
export const TABLE_NAMES = Object.keys(finalStores).filter((n) => finalStores[n] !== null) as (keyof BackupTables)[];

/** Every table's rows, used by export/import. */
export interface BackupTables {
  accounts: Account[];
  categories: Category[];
  recurring: RecurringItem[];
  transactions: Transaction[];
  plans: Plan[];
  allocations: Allocation[];
  budgetMoves: BudgetMove[];
  segments: PeriodSegment[];
  goals: Goal[];
  merchantRules: MerchantRule[];
  events: EventLogEntry[];
  snapshots: PeriodSnapshot[];
  settings: Settings[];
  quickActions: QuickAction[];
}
