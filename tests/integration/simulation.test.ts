// Simulated 3 months: seed, advance the clock day by day, spend randomly, and
// check the invariants that must always hold.
import { describe, expect, it } from 'vitest';
import { testApp } from '../helpers';
import { mulberry32, seedSampleData } from '../../src/data/seed';
import { addDays } from '../../src/domain/dates';
import { accountEffect, balanceAsOf, spendingByCategory } from '../../src/domain/ledger';
import { occurrences } from '../../src/domain/recurrence';
import { recurringOriginKey } from '../../src/domain/materialise';
import { listAccounts } from '../../src/services/accounts';
import { onAppOpen } from '../../src/services/appOpen';
import { getForecast } from '../../src/services/forecast';
import { doFreshStart } from '../../src/services/freshStart';
import { getHome } from '../../src/services/home';
import { addTransaction, confirmTransaction, transfer } from '../../src/services/transactions';
import { takeTodaysNotices } from '../../src/services/notifications';

const START = '2026-07-01';
const DAYS = 92;

describe('3-month simulation', () => {
  it('keeps every invariant', async () => {
    const app = await testApp(START);
    await seedSampleData(app);
    const rand = mulberry32(7);
    const accounts = await app.repos.accounts.all();
    const chq = accounts.find((a) => a.type === 'chequing')!;
    const card = accounts.find((a) => a.type === 'credit_card')!;
    const sav = accounts.find((a) => a.type === 'savings')!;
    const tfsa = accounts.find((a) => a.type === 'investing')!;
    const cats = ['cat_groceries', 'cat_eating_out', 'cat_transport', 'cat_fun', 'cat_personal', undefined];
    let freshStarts = 0;

    for (let day = 1; day <= DAYS; day++) {
      // A 12-day stretch without opening the app.
      if (day >= 40 && day < 52) {
        app.clock.advance(1);
        continue;
      }
      app.clock.advance(1);
      const today = app.clock.today();
      const open = await onAppOpen(app);
      const again = await onAppOpen(app);
      expect(again.recurringPosted + again.interestPosted, `double post on ${today}`).toBe(0);
      if (open.freshStart) {
        await doFreshStart(app, open.freshStart.daysAway);
        freshStarts++;
      }
      // Confirm what came due (the user glancing at pending items).
      for (const t of (await app.repos.transactions.all()).filter((x) => x.status === 'pending' && x.date <= today)) await confirmTransaction(app, t.id);

      const n = Math.floor(rand() * 4);
      for (let k = 0; k < n; k++) {
        const cat = cats[Math.floor(rand() * cats.length)];
        await addTransaction(app, {
          amountCents: 100 + Math.floor(rand() * 6000),
          accountId: rand() < 0.5 ? chq.id : card.id,
          ...(cat ? { categoryId: cat } : {}),
          ...(rand() < 0.5 ? { merchant: ['Loblaws', 'TIM HORTONS #4412', 'Uber', 'Indigo', 'Shoppers'][Math.floor(rand() * 5)] } : {}),
        });
      }
      if (rand() < 0.05) await addTransaction(app, { type: 'refund', amountCents: 500 + Math.floor(rand() * 1500), accountId: card.id, categoryId: 'cat_fun' });
      if (rand() < 0.07) await transfer(app, chq.id, sav.id, 2000 + Math.floor(rand() * 5000));
      if (rand() < 0.04) await transfer(app, chq.id, tfsa.id, 5000);
      if (rand() < 0.04) await transfer(app, chq.id, card.id, 20000);

      const home = await getHome(app);
      expect(Number.isSafeInteger(home.sts.safeCents)).toBe(true);
      expect(Number.isSafeInteger(home.sts.dailyCents)).toBe(true);
      for (const r of home.rows) expect(Number.isSafeInteger(r.budget.remainingCents)).toBe(true);
      await takeTodaysNotices(app);
    }

    const end = app.clock.today();
    const txs = await app.repos.transactions.all();
    const all = await app.repos.accounts.all();

    // No recurring occurrence or interest posting is ever recorded twice.
    const keys = txs.map((t) => t.originKey).filter(Boolean);
    expect(new Set(keys).size).toBe(keys.length);

    // Every due recurring occurrence since seeding exists exactly once.
    for (const item of (await app.repos.recurring.all()).filter((r) => !r.archived && r.schedule.freq !== 'irregular')) {
      const acc = all.find((a) => a.id === item.defaultAccountId)!;
      for (const d of occurrences(item, addDays(START, -80) > acc.openingDate ? addDays(START, -80) : acc.openingDate, end))
        expect(txs.filter((t) => t.originKey === recurringOriginKey(item.id, d)), `${item.name} ${d}`).toHaveLength(1);
    }

    // Money stays in integer cents everywhere.
    for (const t of txs) {
      expect(Number.isSafeInteger(t.amountCents) && t.amountCents > 0).toBe(true);
      for (const s of t.splits ?? []) expect(Number.isSafeInteger(s.amountCents)).toBe(true);
    }

    // Transfers never count as spending.
    const withoutTransfers = spendingByCategory(txs.filter((t) => t.type !== 'transfer'), '2000-01-01', end);
    expect(spendingByCategory(txs, '2000-01-01', end)).toEqual(withoutTransfers);
    expect(txs.filter((t) => t.type === 'transfer').every((t) => !t.categoryId && !t.splits)).toBe(true);

    // Balances reconcile: per account, and transfers net to zero across accounts.
    const views = await listAccounts(app, end);
    let total = 0;
    let flows = 0;
    for (const a of all) {
      const counted = txs.filter((t) => t.status === 'posted' && t.date >= a.openingDate && t.date <= end);
      const expected = a.openingBalanceCents + counted.reduce((s, t) => s + accountEffect(t, a.id), 0);
      expect(balanceAsOf(a, txs, end)).toBe(expected);
      expect(views.find((v) => v.account.id === a.id)!.balanceCents).toBe(expected);
      total += expected;
      flows += a.openingBalanceCents;
    }
    for (const t of txs.filter((x) => x.status === 'posted' && x.date <= end)) {
      if (t.type === 'income' || t.type === 'refund') flows += t.amountCents;
      if (t.type === 'expense') flows -= t.amountCents;
    }
    expect(total).toBe(flows);

    // Interest posted exactly once per month-end on savings.
    const interest = txs.filter((t) => t.originKey?.startsWith('int:') && t.accountId === sav.id).map((t) => t.date).sort();
    expect(interest).toEqual([...new Set(interest)]);
    expect(interest.filter((d) => d >= START)).toEqual(['2026-07-31', '2026-08-31', '2026-09-30']);

    // The gap produced exactly one fresh start, and history survived.
    expect(freshStarts).toBe(1);
    expect((await app.repos.events.all()).filter((e) => e.type === 'fresh_start')).toHaveLength(1);
    expect((await app.repos.snapshots.all()).map((s) => s.periodStart)).toEqual(expect.arrayContaining(['2026-07-01', '2026-08-01', '2026-09-01']));

    // Forecast works on the final state.
    const f = await getForecast(app, 90);
    expect(f.forecast.days).toHaveLength(91);
    expect(f.forecast.days.every((d) => Object.values(d.balances).every(Number.isSafeInteger))).toBe(true);
  }, 60_000);
});
