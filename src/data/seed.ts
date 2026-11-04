// Realistic sample data: Jordan Lee, a salaried renter in their thirties with an
// average Canadian budget. Biweekly payroll (about $2,086 take-home), $1,950 rent,
// hydro, internet, phone, tenant and car insurance, a gym and two streaming services.
// Day to day: groceries, takeout and coffee, gas for the car, the odd online order.
// Two everyday credit cards (a Scotiabank Momentum for most spending, an RBC ION+
// for subscriptions) with their limits, rates and past statements, paid in full each
// month except one; a chequing account, high-interest savings and a TFSA; and two
// goals, an emergency fund and a trip.
// Includes 12 weeks of history so averages, rollover and detection have something to work with.

import { addDays, dayOfWeek, eachDay, parts } from '../domain/dates';
import { categoryId, suggestedCategories } from '../domain/defaults';
import { dueFor, lastClosing, shiftClosing } from '../domain/cardAnalysis';
import { balanceAsOf } from '../domain/ledger';
import { merchantKey } from '../domain/merchant';
import { periodFor } from '../domain/period';
import type { Account, Id, Transaction } from '../domain/types';
import { createAccount, reorderAccounts, saveCardDetails } from '../services/accounts';
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
  // Their own categories (a new install has only Bills and the Irregular fund).
  await ctx.repos.categories.bulkPut(suggestedCategories(['groceries', 'eating_out', 'transport', 'fun', 'personal'], ctx.clock.now().toISOString()));

  // Card faces use the bundled art in cards/card-art.
  const chq = await createAccount(ctx, {
    name: 'Chequing',
    type: 'chequing',
    openingBalanceCents: 320000,
    openingDate: opening,
    face: { artId: 'td/debit-us', institutionId: 'td', last4: '4417' },
  });
  const sav = await createAccount(ctx, {
    name: 'High-interest savings',
    type: 'savings',
    openingBalanceCents: 650000,
    openingDate: opening,
    interest: { rateBps: 275, kind: 'apy', compounding: 'monthly' },
  });
  const visa = await createAccount(ctx, {
    name: 'Scotia Momentum',
    type: 'credit_card',
    openingBalanceCents: -114200,
    openingDate: opening,
    card: { monthlyFeeCents: 1000, statementDay: 8, dueDay: 29, limitCents: 850000 },
    face: { artId: 'scotiabank/momentum', institutionId: 'scotiabank', last4: '2290' },
  });
  const ion = await createAccount(ctx, {
    name: 'RBC ION+',
    type: 'credit_card',
    openingBalanceCents: -8600,
    openingDate: opening,
    card: { monthlyFeeCents: 400, statementDay: 15, dueDay: 6, limitCents: 250000 },
    face: { artId: 'rbc/ion-plus', institutionId: 'rbc', last4: '7731' },
  });
  const tfsa = await createAccount(ctx, { name: 'TFSA', type: 'investing', openingBalanceCents: 1420000, openingDate: opening });
  // Their order, set outright: accounts made in the same instant would otherwise tie.
  await reorderAccounts(ctx, [visa.id, ion.id, chq.id, sav.id, tfsa.id]);

  // First Friday on or after opening for the pay cycle.
  let payday = opening;
  while (dayOfWeek(payday) !== 5) payday = addDays(payday, 1);
  const firstOn = (day: number) => {
    let d = opening;
    while (Number(d.slice(8)) !== day) d = addDays(d, 1);
    return d;
  };

  const pay = await createRecurring(ctx, { name: 'Payroll', kind: 'income', amountCents: 208640, freq: 'biweekly', nextDate: payday, accountIds: [chq.id], merchant: 'Payroll' });
  const bill = (name: string, amountCents: number, day: number, accountIds: Id[], merchant = name, kind: 'bill' | 'subscription' = 'bill') =>
    createRecurring(ctx, { name, kind, amountCents, freq: 'monthly', nextDate: firstOn(day), accountIds, merchant });
  await bill('Rent', 195000, 1, [chq.id]);
  await bill('Tenant insurance', 2800, 5, [chq.id], 'Square One');
  await bill('Phone', 6500, 12, [visa.id, chq.id], 'Koodo');
  await bill('Hydro', 9500, 16, [chq.id], 'Toronto Hydro');
  await bill('Internet', 7500, 18, [visa.id, chq.id], 'Rogers');
  await bill('Car insurance', 16500, 20, [chq.id], 'Intact');
  await bill('Gym', 5499, 7, [visa.id], 'GoodLife Fitness', 'subscription');
  await bill('Netflix', 1649, 3, [ion.id], 'Netflix', 'subscription');
  await bill('Spotify', 1199, 22, [ion.id], 'Spotify', 'subscription');

  const emergency = await createGoal(ctx, { name: 'Emergency fund', targetCents: 1500000, accountId: sav.id, startingProgressCents: 650000 });
  const trip = await createGoal(ctx, { name: 'Portugal trip', targetCents: 350000, targetDate: addDays(today, 240), accountId: sav.id, startingProgressCents: 0 });

  // Day-to-day spending (manual entries).
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
        enteredAt: new Date(Date.parse(`${date}T00:15:00.000Z`) + (hour + 4) * 3_600_000).toISOString(), // local (UTC−4) hour; late evenings roll into the next UTC day
      }),
    );
  const move = (date: string, amountCents: number, from: Id, to: Id, extra: Partial<Transaction> = {}) =>
    hist.push(stamp(ctx, { type: 'transfer' as const, amountCents, date, accountId: from, toAccountId: to, status: 'posted' as const, needsReview: false, ...extra }));

  for (const d of eachDay(opening, addDays(today, -1))) {
    const dow = dayOfWeek(d);
    const dom = parts(d).day;
    if (dow === 6) add(d, between(9000, 15500), 'groceries', rand() < 0.6 ? 'NO FRILLS #3121' : 'Loblaws 1022', visa.id, 11);
    if (dow === 3 && rand() < 0.7) add(d, between(1800, 4200), 'groceries', 'Metro', visa.id, 18);
    if (dow >= 1 && dow <= 5 && rand() < 0.45) add(d, between(225, 650), 'eating_out', 'TIM HORTONS #4412', visa.id, 8);
    if (dow >= 1 && dow <= 5 && rand() < 0.2) add(d, between(1300, 1900), 'eating_out', rand() < 0.5 ? 'Freshii' : 'A&W', visa.id, 12);
    if ((dow === 5 || dow === 6) && rand() < 0.55) add(d, between(2600, 6500), 'eating_out', rand() < 0.5 ? 'UBER* EATS' : 'The Keg', visa.id, 19);
    if (dow === 2 || (dow === 6 && rand() < 0.4)) add(d, between(5200, 7400), 'transport', rand() < 0.5 ? 'PETRO-CANADA' : 'Esso', visa.id, 17);
    if (rand() < 0.04) add(d, between(1200, 2500), 'transport', 'Green P Parking', visa.id, 14);
    if (rand() < 0.09) add(d, between(1800, 8500), 'fun', rand() < 0.5 ? 'Amazon.ca' : rand() < 0.5 ? 'Cineplex' : 'Canadian Tire', visa.id, 20);
    if (rand() < 0.06) add(d, between(1200, 4800), 'personal', rand() < 0.6 ? 'Shoppers Drug Mart' : 'Great Clips', visa.id, 16);
    if (dom === 10) add(d, 399, 'fun', 'APPLE.COM/BILL', ion.id, 3); // an untracked subscription to detect
    // Savings the day after the first payday of the month, and a TFSA top-up mid-month.
    if (dom === 2) move(d, 30000, chq.id, sav.id, { goalId: emergency.id });
    if (dom === 3) move(d, 10000, chq.id, sav.id, { goalId: trip.id });
    if (dom === 15) move(d, 20000, chq.id, tfsa.id);
  }
  await ctx.repos.transactions.bulkPut(hist);

  // Past recurring occurrences happened: generate and confirm them.
  await runAutomations(ctx);
  const pending = (await ctx.repos.transactions.all()).filter((t) => t.status === 'pending' && t.date < today);
  await ctx.repos.transactions.bulkPut(pending.map((t) => stamp(ctx, { ...t, status: 'posted' as const })));

  // Card payments: each statement paid in full from chequing on its due date, except
  // one month on the Momentum where most, not all, of it went.
  for (const card of [visa, ion]) await payStatements(ctx, card, chq.id, today, card === visa ? 0 : -1);

  // Statements from before the cards were in Tameru, as if read off the bank's.
  await saveCardDetails(ctx, visa.id, {
    aprBps: 2099,
    statements: [
      { closingDate: lastClosing(opening, 8), balanceCents: 128460, minimumCents: 3854, paidCents: 128460 },
      { closingDate: shiftClosing(lastClosing(opening, 8), 8, -1), balanceCents: 161245, minimumCents: 4837, paidCents: 161245 },
      { closingDate: shiftClosing(lastClosing(opening, 8), 8, -2), balanceCents: 139870, minimumCents: 4196, paidCents: 100000 },
    ],
  });
  await saveCardDetails(ctx, ion.id, {
    aprBps: 2099,
    statements: [
      { closingDate: lastClosing(opening, 15), balanceCents: 8752, minimumCents: 1000, paidCents: 8752 },
      { closingDate: shiftClosing(lastClosing(opening, 15), 15, -1), balanceCents: 7953, minimumCents: 1000, paidCents: 7953 },
    ],
  });

  const plan = await getPlan(ctx);
  await savePlan(
    ctx,
    {
      ...plan,
      period: { kind: 'monthly', startDay: 1 },
      startDate: periodFor({ kind: 'monthly', startDay: 1 }, opening).start,
      templateAllocations: {
        [categoryId('bills')]: 195000 + 2800 + 6500 + 9500 + 7500 + 16500 + 5499 + 1649 + 1199 + 1000 + 400,
        [categoryId('groceries')]: 56000,
        [categoryId('transport')]: 30000,
        [categoryId('eating_out')]: 26000,
        [categoryId('fun')]: 15000,
        [categoryId('personal')]: 8000,
        [categoryId('irregular')]: 10000,
      },
      goalContributions: { [emergency.id]: 30000, [trip.id]: 10000 },
    },
    { seeded: true, payRecurringId: pay.id },
  );
  // Two quick adds: one with a fixed card, one that asks each time.
  await saveQuick(ctx, { slot: 0, icon: 'coffee', label: 'Coffee', amountCents: 245, categoryId: categoryId('eating_out'), merchant: 'Tim Hortons', accountId: visa.id });
  await saveQuick(ctx, { slot: 1, icon: 'fuel', label: 'Gas', amountCents: 6000, categoryId: categoryId('transport'), merchant: 'Petro-Canada', accountId: 'ask' });

  await ctx.repos.settings.update({ onboardedAt: ctx.clock.now().toISOString(), lastOpenedDate: today, userName: 'Jordan Lee' });
}

/**
 * Pay each statement that has closed since the card was added, on its due date, from
 * `from`. `partialAt` picks one statement (by index) to pay 70% of instead of all.
 */
async function payStatements(ctx: AppContext, card: Account, from: Id, today: string, partialAt: number): Promise<void> {
  const day = card.card!.statementDay;
  // The first statement to close on or after the card's first day in Tameru.
  let close = shiftClosing(lastClosing(card.openingDate, day), day, 1);
  for (let k = 0; close < today; k++, close = shiftClosing(close, day, 1)) {
    const due = dueFor(close, card.card!.dueDay);
    if (due >= today) break;
    const txs = await ctx.repos.transactions.all();
    const owing = -balanceAsOf(card, txs, close);
    if (owing <= 0) continue;
    const amount = k === partialAt ? Math.round(owing * 0.7) : owing;
    await ctx.repos.transactions.put(
      stamp(ctx, { type: 'transfer' as const, amountCents: amount, date: due, accountId: from, toAccountId: card.id, note: 'Card payment', status: 'posted' as const, needsReview: false }),
    );
  }
}
