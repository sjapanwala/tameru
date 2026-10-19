// Realistic sample data: a student with part-time biweekly pay, rent, phone,
// subscriptions, a credit card with a fee, savings with interest, and a goal.
// Includes 12 weeks of history so averages, rollover and detection have something to work with.

import { addDays, dayOfWeek, eachDay, parts } from '../domain/dates';
import { categoryId } from '../domain/defaults';
import { merchantKey } from '../domain/merchant';
import { periodFor } from '../domain/period';
import type { Id, Transaction } from '../domain/types';
import { createAccount } from '../services/accounts';
import { runAutomations } from '../services/automation';
import { stamp, type AppContext } from '../services/context';
import { createGoal } from '../services/goals';
import { getPlan, savePlan } from '../services/plan';
import { saveQuick } from '../services/quick';
import { createRecurring } from '../services/recurring';

/** Small deterministic PRNG so seeded data is the same every time. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const SEED_HISTORY_DAYS = 84;

export async function seedSampleData(ctx: AppContext, seed = 42): Promise<void> {
  const rand = mulberry32(seed);
  const between = (lo: number, hi: number) => Math.round(lo + rand() * (hi - lo));
  const today = ctx.clock.today();
  const opening = addDays(today, -SEED_HISTORY_DAYS);

  // Card faces use the bundled art in cards/card-art.
  const chq = await createAccount(ctx, {
    name: 'Chequing',
    type: 'chequing',
    openingBalanceCents: 85000,
    openingDate: opening,
    face: { artId: 'td/debit-us', institutionId: 'td', last4: '0937' },
  });
  const sav = await createAccount(ctx, {
    name: 'High-interest savings',
    type: 'savings',
    openingBalanceCents: 120000,
    openingDate: opening,
    interest: { rateBps: 300, kind: 'apy', compounding: 'monthly' },
  });
  const card = await createAccount(ctx, {
    name: 'Student Visa',
    type: 'credit_card',
    openingBalanceCents: -15000,
    openingDate: opening,
    card: { monthlyFeeCents: 499, statementDay: 5, dueDay: 28 },
    face: { artId: 'bmo/mcgill-student-mastercard', institutionId: 'bmo', last4: '4821' },
  });
  await createAccount(ctx, { name: 'TFSA', type: 'investing', openingBalanceCents: 50000, openingDate: opening });

  // First Friday on or after opening for the pay cycle.
  let payday = opening;
  while (dayOfWeek(payday) !== 5) payday = addDays(payday, 1);
  const firstOn = (day: number) => {
    let d = opening;
    while (Number(d.slice(8)) !== day) d = addDays(d, 1);
    return d;
  };

  const pay = await createRecurring(ctx, {
    name: 'Bookstore pay',
    kind: 'income',
    range: { minCents: 78000, maxCents: 92000 },
    freq: 'biweekly',
    nextDate: payday,
    accountIds: [chq.id],
  });
  await createRecurring(ctx, { name: 'Rent', kind: 'bill', amountCents: 85000, freq: 'monthly', nextDate: firstOn(1), accountIds: [chq.id], merchant: 'Rent' });
  await createRecurring(ctx, { name: 'Phone', kind: 'bill', amountCents: 4500, freq: 'monthly', nextDate: firstOn(12), accountIds: [card.id, chq.id], merchant: 'Fido' });
  await createRecurring(ctx, { name: 'Spotify', kind: 'subscription', amountCents: 699, freq: 'monthly', nextDate: firstOn(20), accountIds: [card.id], merchant: 'Spotify' });
  await createRecurring(ctx, { name: 'Netflix', kind: 'subscription', amountCents: 1649, freq: 'monthly', nextDate: firstOn(3), accountIds: [card.id], merchant: 'Netflix' });

  const goal = await createGoal(ctx, {
    name: 'Emergency fund',
    targetCents: 300000,
    targetDate: addDays(today, 300),
    accountId: sav.id,
    startingProgressCents: 120000,
  });

  // Discretionary history (manual entries).
  const hist: Transaction[] = [];
  const add = (date: string, amountCents: number, cat: string, merchant: string, accountId: Id, hour = 12) =>
    hist.push(
      stamp(ctx, {
        type: 'expense' as const,
        amountCents,
        date,
        accountId,
        categoryId: categoryId(cat),
        merchant,
        merchantKey: merchantKey(merchant),
        status: 'posted' as const,
        needsReview: false,
        enteredAt: `${date}T${String(hour + 4).padStart(2, '0')}:15:00.000Z`,
      }),
    );
  for (const d of eachDay(opening, addDays(today, -1))) {
    const dow = dayOfWeek(d);
    const dom = parts(d).day;
    if (dow === 1 || dow === 4) add(d, between(2500, 7000), 'groceries', rand() < 0.6 ? 'NO FRILLS #3121' : 'Loblaws 1022', chq.id, 18);
    if (dow >= 1 && dow <= 5 && rand() < 0.55) add(d, between(210, 640), 'eating_out', 'TIM HORTONS #4412', card.id, 8);
    if ((dow === 5 || dow === 6) && rand() < 0.6) add(d, between(1400, 3800), 'eating_out', rand() < 0.5 ? 'SQ *PIZZA PIZZA' : 'Burrito Boyz', card.id, 20);
    if (dow === 1) add(d, 2000, 'transport', 'PRESTO', chq.id, 7);
    if (rand() < 0.08) add(d, between(1500, 6000), 'fun', rand() < 0.5 ? 'Amazon.ca' : 'Indigo', card.id, 21);
    if (rand() < 0.05) add(d, between(800, 2500), 'personal', 'Shoppers Drug Mart', card.id, 17);
    if (dom === 9) add(d, 399, 'fun', 'APPLE.COM/BILL', card.id, 3); // an untracked subscription to detect
    if (dom === 28)
      hist.push(stamp(ctx, { type: 'transfer' as const, amountCents: 30000, date: d, accountId: chq.id, toAccountId: card.id, note: 'Card payment', status: 'posted' as const, needsReview: false }));
    if (dom === 2)
      hist.push(stamp(ctx, { type: 'transfer' as const, amountCents: 5000, date: d, accountId: chq.id, toAccountId: sav.id, goalId: goal.id, status: 'posted' as const, needsReview: false }));
  }
  await ctx.repos.transactions.bulkPut(hist);

  // Past recurring occurrences happened: generate and confirm them.
  await runAutomations(ctx);
  const pending = (await ctx.repos.transactions.all()).filter((t) => t.status === 'pending' && t.date < today);
  await ctx.repos.transactions.bulkPut(pending.map((t) => stamp(ctx, { ...t, status: 'posted' as const })));

  const plan = await getPlan(ctx);
  await savePlan(
    ctx,
    {
      ...plan,
      period: { kind: 'monthly', startDay: 1 },
      startDate: periodFor({ kind: 'monthly', startDay: 1 }, opening).start,
      templateAllocations: {
        [categoryId('bills')]: 85000 + 4500 + 699 + 1649 + 499,
        [categoryId('groceries')]: 42000,
        [categoryId('transport')]: 9000,
        [categoryId('eating_out')]: 15000,
        [categoryId('fun')]: 6000,
        [categoryId('personal')]: 3000,
        [categoryId('irregular')]: 4000,
      },
      goalContributions: { [goal.id]: 10000 },
    },
    { seeded: true, payRecurringId: pay.id },
  );
  // Two quick adds: one with a fixed card, one that asks each time.
  await saveQuick(ctx, { slot: 0, icon: 'coffee', label: 'Coffee', amountCents: 245, categoryId: categoryId('eating_out'), merchant: 'Tim Hortons', accountId: card.id });
  await saveQuick(ctx, { slot: 1, icon: 'bus', label: 'Transit', amountCents: 335, categoryId: categoryId('transport'), merchant: 'Presto', accountId: 'ask' });

  await ctx.repos.settings.update({ onboardedAt: ctx.clock.now().toISOString(), lastOpenedDate: today, userName: 'Alex Chen' });
}
