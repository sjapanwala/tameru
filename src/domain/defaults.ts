// Default settings and the small default category set.

import type { Category, CategoryGroup, BudgetBehaviour, Settings } from './types';

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  autoPostRecurring: false, // generated bills/income land as pending until confirmed
  subtractCardBalances: true,
  bufferCents: 5000,
  freshStartDays: 10,
  freshStartBacklog: 15,
  defaultCurrency: 'CAD',
  dismissedDetections: [],
  notificationsEnabled: true,
  sentNoticeIds: [],
};

interface CategorySeed {
  key: string;
  name: string;
  group: CategoryGroup;
  behaviour: BudgetBehaviour;
  isBuffer?: boolean;
  systemKey?: Category['systemKey'];
}

/** Seven broad user categories plus hidden system ones. Ids are stable so tests and seeds can refer to them. */
export const DEFAULT_CATEGORY_SEEDS: CategorySeed[] = [
  { key: 'bills', name: 'Bills', group: 'essentials', behaviour: 'reset' },
  { key: 'groceries', name: 'Groceries', group: 'essentials', behaviour: 'rollover' },
  { key: 'transport', name: 'Transport', group: 'essentials', behaviour: 'rollover' },
  { key: 'eating_out', name: 'Eating out', group: 'lifestyle', behaviour: 'reset' },
  { key: 'fun', name: 'Fun & shopping', group: 'lifestyle', behaviour: 'reset' },
  { key: 'personal', name: 'Personal & health', group: 'lifestyle', behaviour: 'rollover' },
  { key: 'irregular', name: 'Irregular', group: 'savings', behaviour: 'fund', isBuffer: true },
  { key: 'income', name: 'Income', group: 'system', behaviour: 'reset', systemKey: 'income' },
  { key: 'interest', name: 'Interest', group: 'system', behaviour: 'reset', systemKey: 'interest' },
  { key: 'fees', name: 'Card fees', group: 'system', behaviour: 'reset', systemKey: 'fees' },
];

export const categoryId = (key: string): string => `cat_${key}`;

export function defaultCategories(nowIso: string): Category[] {
  return DEFAULT_CATEGORY_SEEDS.map((s, i) => ({
    id: categoryId(s.key),
    name: s.name,
    group: s.group,
    behaviour: s.behaviour,
    isBuffer: s.isBuffer ?? false,
    sortOrder: i,
    archived: false,
    ...(s.systemKey ? { systemKey: s.systemKey } : {}),
    createdAt: nowIso,
    updatedAt: nowIso,
  }));
}

/** Categories the user budgets with (not system, not archived). */
export const isBudgetCategory = (c: Category): boolean => c.group !== 'system' && !c.archived;
