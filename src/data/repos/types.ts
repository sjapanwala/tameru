// Storage-agnostic repository interfaces. Services depend on these, never on Dexie.

import type {
  Account,
  Allocation,
  BudgetMove,
  Category,
  EventLogEntry,
  Goal,
  LocalDate,
  MerchantRule,
  PeriodSegment,
  PeriodSnapshot,
  Plan,
  QuickAction,
  RecurringItem,
  Settings,
  Transaction,
} from '../../domain/types';
import type { BackupTables } from '../db';

export interface Repo<T extends { id: string }> {
  get(id: string): Promise<T | undefined>;
  all(): Promise<T[]>;
  put(row: T): Promise<void>;
  bulkPut(rows: T[]): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface TransactionRepo extends Repo<Transaction> {
  inRange(from: LocalDate, to: LocalDate): Promise<Transaction[]>;
  byRecurring(recurringId: string): Promise<Transaction[]>;
  /** Insert generated transactions, skipping any whose originKey already exists. Returns how many were inserted. */
  insertGenerated(rows: Transaction[]): Promise<number>;
}

export interface SettingsRepo {
  get(): Promise<Settings>;
  update(patch: Partial<Omit<Settings, 'id'>>): Promise<Settings>;
}

export interface Repos {
  accounts: Repo<Account>;
  categories: Repo<Category>;
  recurring: Repo<RecurringItem>;
  transactions: TransactionRepo;
  plans: Repo<Plan>;
  allocations: Repo<Allocation>;
  budgetMoves: Repo<BudgetMove>;
  segments: Repo<PeriodSegment>;
  goals: Repo<Goal>;
  merchantRules: Repo<MerchantRule> & { byKey(key: string): Promise<MerchantRule | undefined> };
  events: Repo<EventLogEntry>;
  snapshots: Repo<PeriodSnapshot>;
  quickActions: Repo<QuickAction>;
  settings: SettingsRepo;
  /** Run fn atomically across all tables. */
  atomic<T>(fn: () => Promise<T>): Promise<T>;
  dumpAll(): Promise<BackupTables>;
  replaceAll(tables: BackupTables): Promise<void>;
  wipe(): Promise<void>;
}
