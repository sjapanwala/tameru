import Dexie, { type Table } from 'dexie';
import type {
  Account,
  Budget,
  Category,
  Goal,
  MerchantRule,
  Recurring,
  Setting,
  Transaction,
} from '../domain/types';

export class TameruDB extends Dexie {
  accounts!: Table<Account, string>;
  categories!: Table<Category, string>;
  transactions!: Table<Transaction, string>;
  merchantRules!: Table<MerchantRule, string>;
  budgets!: Table<Budget, string>;
  recurring!: Table<Recurring, string>;
  goals!: Table<Goal, string>;
  settings!: Table<Setting, string>;

  constructor(name = 'tameru') {
    super(name);
    // Only indexed fields are listed. To change the schema, add a new
    // version() block below; never edit a released one.
    this.version(1).stores({
      accounts: 'id, updatedAt',
      categories: 'id, updatedAt',
      transactions: 'id, date, categoryId, accountId, updatedAt',
      merchantRules: 'id, pattern, updatedAt',
      budgets: 'id, categoryId, updatedAt',
      recurring: 'id, kind, updatedAt',
      goals: 'id, updatedAt',
      settings: 'id, &key, updatedAt',
    });
  }
}

export const db = new TameruDB();
