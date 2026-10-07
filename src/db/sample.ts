// Dev-only sample data. Loaded through a dynamic import behind
// import.meta.env.DEV so it is left out of production builds.

import { addDays, todayISO } from '../domain/dates';
import { DEFAULT_CATEGORIES } from '../domain/defaults';
import { cleanMerchant, merchantKey } from '../domain/merchant';
import type { Budget, Category, MerchantRule, Recurring, Transaction } from '../domain/types';
import { db } from './db';
import { completeOnboarding, getSettings, listAccounts, listCategories, stamp } from './repo';

interface Template {
  raw: string;
  category: string | null;
  min: number;
  max: number;
  /** Roughly once every N days. */
  every: number;
}

const TEMPLATES: Template[] = [
  { raw: 'SQ *JOES COFFEE 4412', category: 'Dining out', min: 375, max: 895, every: 2 },
  { raw: 'LOBLAWS 1042', category: 'Groceries', min: 2400, max: 13800, every: 4 },
  { raw: 'TTC PRESTO RELOAD', category: 'Transport', min: 2000, max: 2000, every: 9 },
  { raw: 'UBER *TRIP HELP.UBER.COM', category: 'Transport', min: 900, max: 3100, every: 8 },
  { raw: 'TST* PIZZERIA LIBRETTO', category: 'Dining out', min: 2800, max: 7400, every: 10 },
  { raw: 'CINEPLEX ODEON 7702', category: 'Fun', min: 1499, max: 3800, every: 14 },
  { raw: 'SHOPPERS DRUG MART 0812', category: 'Health', min: 600, max: 4200, every: 11 },
  { raw: 'NO FRILLS 3390', category: 'Groceries', min: 1500, max: 6200, every: 6 },
  // Left uncategorised so the "needs review" filter has something to show.
  { raw: 'TST* BLUE DOOR BAKERY #0921', category: null, min: 450, max: 1650, every: 13 },
  { raw: 'PAYPAL *STEAMGAMES', category: null, min: 1299, max: 7999, every: 19 },
];

// Small deterministic PRNG so the sample set is the same on every load.
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function loadSampleData(): Promise<number> {
  if (!(await getSettings()).onboardedAt) {
    await completeOnboarding({
      currency: 'CAD',
      accountName: 'Chequing',
      startingBalanceCents: 184250,
    });
  }
  const account = (await listAccounts())[0];
  if (!account) throw new Error('No account to attach sample data to');

  // Make sure the default categories exist even if the user removed some.
  let categories = await listCategories();
  const missing = DEFAULT_CATEGORIES.filter((name) => !categories.some((c) => c.name === name));
  if (missing.length > 0) {
    await db.categories.bulkAdd(
      missing.map((name, i) => stamp<Category>({ name, sortOrder: categories.length + i })),
    );
    categories = await listCategories();
  }
  const categoryId = (name: string | null) =>
    (name && categories.find((c) => c.name === name)?.id) || null;

  const rand = mulberry32(20261007);
  const today = todayISO();
  const transactions: Transaction[] = [];

  for (let daysAgo = 44; daysAgo >= 0; daysAgo--) {
    const date = addDays(today, -daysAgo);
    for (const t of TEMPLATES) {
      if (rand() > 1 / t.every) continue;
      const cents = Math.round(t.min + rand() * (t.max - t.min));
      const catId = categoryId(t.category);
      transactions.push(
        stamp<Transaction>({
          date,
          amountCents: -cents,
          accountId: account.id,
          categoryId: catId,
          merchant: cleanMerchant(t.raw),
          rawDescriptor: t.raw,
          note: '',
          needsReview: catId === null,
        }),
      );
    }
    if (daysAgo % 14 === 3) {
      transactions.push(
        stamp<Transaction>({
          date,
          amountCents: 215000,
          accountId: account.id,
          categoryId: null,
          merchant: 'Payroll',
          rawDescriptor: 'PAYROLL DEPOSIT ACME CORP',
          note: '',
          needsReview: false,
        }),
      );
    }
  }

  const existingPatterns = new Set((await db.merchantRules.toArray()).map((r) => r.pattern));
  const rules = TEMPLATES.filter((t) => t.category !== null)
    .map((t) => {
      const cleanName = cleanMerchant(t.raw);
      return stamp<MerchantRule>({
        pattern: merchantKey(cleanName),
        cleanName,
        categoryId: categoryId(t.category)!,
      });
    })
    .filter((rule) => !existingPatterns.has(rule.pattern));

  // Rows for later milestones (no UI yet), so exports exercise every table.
  const hasPlan = (await db.budgets.count()) + (await db.recurring.count()) > 0;
  const budgets: Budget[] = hasPlan
    ? []
    : [
        ['Groceries', 60000],
        ['Dining out', 25000],
        ['Transport', 15000],
        ['Fun', 12000],
      ].map(([name, monthlyCents]) =>
        stamp<Budget>({
          categoryId: categoryId(name as string)!,
          monthlyCents: monthlyCents as number,
        }),
      );
  const monthStart = `${today.slice(0, 8)}01`;
  const recurring: Recurring[] = hasPlan
    ? []
    : [
        stamp<Recurring>({
          name: 'Rent',
          amountCents: 165000,
          schedule: { freq: 'monthly', anchorDate: monthStart },
          kind: 'bill',
          categoryId: null,
        }),
        stamp<Recurring>({
          name: 'Phone',
          amountCents: 5500,
          schedule: { freq: 'monthly', anchorDate: addDays(monthStart, 14) },
          kind: 'bill',
          categoryId: null,
        }),
        stamp<Recurring>({
          name: 'Payroll',
          amountCents: 215000,
          schedule: { freq: 'biweekly', anchorDate: addDays(today, -3) },
          kind: 'income',
          categoryId: null,
        }),
      ];

  await db.transaction(
    'rw',
    db.transactions,
    db.merchantRules,
    db.budgets,
    db.recurring,
    async () => {
      await db.transactions.bulkAdd(transactions);
      await db.merchantRules.bulkAdd(rules);
      await db.budgets.bulkAdd(budgets);
      await db.recurring.bulkAdd(recurring);
    },
  );
  return transactions.length;
}
