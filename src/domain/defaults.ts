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
  color?: string;
}

/**
 * Colours handed to categories as they're created (the user can change them). Bright
 * enough to tell apart on the Plan dial, in light and dark.
 */
export const CATEGORY_COLORS = ['#ff6b5b', '#ffb547', '#4ade80', '#38bdf8', '#a78bfa', '#f472b6', '#2dd4bf', '#facc15', '#fb923c', '#818cf8'];

/** The first palette colour no category is using yet (cycling once all are taken). */
export function nextCategoryColor(used: readonly (string | undefined)[]): string {
  const taken = new Set(used.filter(Boolean).map((c) => c!.toLowerCase()));
  return CATEGORY_COLORS.find((c) => !taken.has(c)) ?? CATEGORY_COLORS[taken.size % CATEGORY_COLORS.length]!;
}

/** A category's colour; older categories without one get a palette colour by position. */
export const categoryColor = (c: Pick<Category, 'color'>, index: number): string => c.color ?? CATEGORY_COLORS[index % CATEGORY_COLORS.length]!;

/**
 * Created on first run: Bills (where recurring bills land), the Irregular fund (where
 * leftover money builds up) and hidden system categories. Everything else the user adds.
 */
export const DEFAULT_CATEGORY_SEEDS: CategorySeed[] = [
  { key: 'bills', name: 'Bills', group: 'essentials', behaviour: 'reset', color: '#94a3b8' },
  { key: 'irregular', name: 'Irregular', group: 'savings', behaviour: 'fund', isBuffer: true, color: '#d6b98c' },
  { key: 'income', name: 'Income', group: 'system', behaviour: 'reset', systemKey: 'income' },
  { key: 'interest', name: 'Interest', group: 'system', behaviour: 'reset', systemKey: 'interest' },
  { key: 'fees', name: 'Card fees', group: 'system', behaviour: 'reset', systemKey: 'fees' },
];

/** Offered as one-tap suggestions when adding a category, with a typical weekly spend. */
export const SUGGESTED_CATEGORIES: (CategorySeed & { weeklyCents: number })[] = [
  { key: 'groceries', name: 'Groceries', group: 'essentials', behaviour: 'rollover', weeklyCents: 6000 },
  { key: 'eating_out', name: 'Eating out', group: 'lifestyle', behaviour: 'reset', weeklyCents: 2500 },
  { key: 'transport', name: 'Transport', group: 'essentials', behaviour: 'rollover', weeklyCents: 2000 },
  { key: 'fun', name: 'Fun & shopping', group: 'lifestyle', behaviour: 'reset', weeklyCents: 2000 },
  { key: 'personal', name: 'Personal & health', group: 'lifestyle', behaviour: 'rollover', weeklyCents: 1000 },
  { key: 'coffee', name: 'Coffee', group: 'lifestyle', behaviour: 'reset', weeklyCents: 1500 },
  { key: 'gym', name: 'Gym', group: 'lifestyle', behaviour: 'reset', weeklyCents: 1000 },
  { key: 'pets', name: 'Pets', group: 'essentials', behaviour: 'rollover', weeklyCents: 1500 },
  { key: 'gifts', name: 'Gifts', group: 'lifestyle', behaviour: 'rollover', weeklyCents: 1000 },
];

/** Used for a category's first plan when the user didn't say what they spend. */
export const DEFAULT_WEEKLY_CENTS = 2000;

/** A suggestion's details by name (case-insensitive), if the name matches one. */
export const suggestionFor = (name: string) => SUGGESTED_CATEGORIES.find((s) => s.name.toLowerCase() === name.trim().toLowerCase());

export const defaultWeeklyFor = (name: string): number => suggestionFor(name)?.weeklyCents ?? DEFAULT_WEEKLY_CENTS;

export const categoryId = (key: string): string => `cat_${key}`;

const seedToCategory = (s: CategorySeed, sortOrder: number, nowIso: string): Category => ({
  id: categoryId(s.key),
  name: s.name,
  group: s.group,
  behaviour: s.behaviour,
  isBuffer: s.isBuffer ?? false,
  sortOrder,
  archived: false,
  ...(s.systemKey ? { systemKey: s.systemKey } : {}),
  ...(s.color ? { color: s.color } : {}),
  createdAt: nowIso,
  updatedAt: nowIso,
});

export function defaultCategories(nowIso: string): Category[] {
  return DEFAULT_CATEGORY_SEEDS.map((s, i) => seedToCategory(s, i, nowIso));
}

/** Suggested categories as records with stable ids (sample data and tests). */
export function suggestedCategories(keys: readonly string[], nowIso: string, firstSortOrder = DEFAULT_CATEGORY_SEEDS.length): Category[] {
  return keys.map((key, i) => {
    const s = SUGGESTED_CATEGORIES.find((x) => x.key === key)!;
    return seedToCategory({ ...s, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }, firstSortOrder + i, nowIso);
  });
}

/** Categories the user budgets with (not system, not archived). */
export const isBudgetCategory = (c: Category): boolean => c.group !== 'system' && !c.archived;
