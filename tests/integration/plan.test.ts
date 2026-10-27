import { describe, expect, it } from 'vitest';
import { testApp } from '../helpers';
import { categoryId } from '../../src/domain/defaults';
import { seedSampleData } from '../../src/data/seed';
import { createAccount } from '../../src/services/accounts';
import { contribute, createGoal, listGoals, removeGoal, setGoalContribution } from '../../src/services/goals';
import { getHome } from '../../src/services/home';
import { applyCover, budgetsFor, CategoryInUseError, planPeriods, removeCategory, setAllocation } from '../../src/services/plan';
import { archiveRecurring, createRecurring } from '../../src/services/recurring';
import { addTransaction } from '../../src/services/transactions';
import { suggestedCategories } from '../../src/domain/defaults';
import type { App } from '../../src/services/app';

/** A fresh app with a few of the user's own categories (installs start with only Bills and the fund). */
async function appWithCategories(today: string): Promise<App> {
  const app = await testApp(today);
  await app.repos.categories.bulkPut(suggestedCategories(['groceries', 'eating_out', 'transport', 'fun', 'personal'], '2026-01-01T00:00:00Z'));
  return app;
}

describe('plan services', () => {
  it('lists past periods for the calendar, marking which have data', async () => {
    const app = await appWithCategories('2026-10-20');
    const chq = await createAccount(app, { name: 'Chq', type: 'chequing', openingBalanceCents: 200000 });
    await addTransaction(app, { amountCents: 1500, accountId: chq.id, categoryId: categoryId('groceries'), date: '2026-07-10' });
    await app.repos.snapshots.put({ id: 's1', periodStart: '2026-08-01', periodEnd: '2026-08-31', perCategory: {}, createdAt: '', updatedAt: '' } as never);
    const { kind, periods } = await planPeriods(app);
    expect(kind).toBe('monthly');
    expect(periods.map((p) => [p.start, p.hasData, p.current])).toEqual([
      ['2026-07-01', true, false], // a transaction
      ['2026-08-01', true, false], // a closed-period snapshot
      ['2026-09-01', false, false], // nothing recorded
      ['2026-10-01', true, true], // the current period always opens
    ]);
  });

  it('shows remaining, offers covers for an over, and applies one in one action', async () => {
    const app = await appWithCategories('2026-10-20');
    const chq = await createAccount(app, { name: 'Chq', type: 'chequing', openingBalanceCents: 200000 });
    await setAllocation(app, categoryId('eating_out'), 10000);
    await setAllocation(app, categoryId('fun'), 20000);
    await addTransaction(app, { amountCents: 13000, accountId: chq.id, categoryId: categoryId('eating_out') });
    let b = await budgetsFor(app);
    const over = b.overs.find((o) => o.categoryId === categoryId('eating_out'))!;
    expect(over.overCents).toBe(3000);
    expect(over.options[0]).toMatchObject({ kind: 'category', fromCategoryId: categoryId('fun'), amountCents: 3000 });
    await applyCover(app, over.categoryId, over.options[0]!);
    b = await budgetsFor(app);
    expect(b.overs).toEqual([]);
    expect(b.rows.find((r) => r.category.id === categoryId('fun'))!.budget.remainingCents).toBe(17000);
    expect((await app.repos.events.all()).filter((e) => e.type === 'plan_changed')).toHaveLength(2);
  });

  it('leaving an over as is, or covering part of it, dismisses the prompt until it grows', async () => {
    const app = await appWithCategories('2026-10-20');
    const chq = await createAccount(app, { name: 'Chq', type: 'chequing', openingBalanceCents: 200000 });
    await setAllocation(app, categoryId('eating_out'), 10000);
    await addTransaction(app, { amountCents: 13000, accountId: chq.id, categoryId: categoryId('eating_out') });
    let over = (await budgetsFor(app)).overs[0]!;
    await applyCover(app, over.categoryId, over.options.find((o) => o.kind === 'leave')!);
    expect((await budgetsFor(app)).overs).toEqual([]);
    await addTransaction(app, { amountCents: 500, accountId: chq.id, categoryId: categoryId('eating_out') });
    over = (await budgetsFor(app)).overs[0]!;
    expect(over.overCents).toBe(3500); // went further over: asks again
    await setAllocation(app, categoryId('fun'), 1000);
    over = (await budgetsFor(app)).overs[0]!;
    const partial = over.options.find((o) => o.kind === 'category' && !o.coversAll);
    expect(partial).toBeDefined();
    await applyCover(app, over.categoryId, partial!);
    expect((await budgetsFor(app)).overs).toEqual([]);
  });

  it('goal contributions count, transfers to a goal account are auto-tagged, milestones are acknowledged', async () => {
    const app = await appWithCategories('2026-10-20');
    const chq = await createAccount(app, { name: 'Chq', type: 'chequing', openingBalanceCents: 200000 });
    const tfsa = await createAccount(app, { name: 'TFSA', type: 'investing' });
    const goal = await createGoal(app, { name: 'Trip', targetCents: 40000, accountId: tfsa.id });
    const r = await contribute(app, goal.id, chq.id, 10000);
    expect(r.milestone).toBe(25);
    await addTransaction(app, { type: 'transfer', amountCents: 5000, accountId: chq.id, toAccountId: tfsa.id });
    const g = (await listGoals(app))[0]!;
    expect(g.progress.progressCents).toBe(15000);
  });

  it('the seeded student has a sensible home screen', async () => {
    const app = await testApp('2026-10-18');
    await seedSampleData(app);
    const home = await getHome(app);
    expect(Number.isSafeInteger(home.sts.safeCents)).toBe(true);
    expect(home.rows).toHaveLength(7);
    expect(home.sts.breakdown.goalLines).toHaveLength(1);
    expect(home.upcoming.every((u) => u.date > '2026-10-18' && u.date <= '2026-10-25')).toBe(true);
    const accounts = await app.repos.accounts.all();
    expect(accounts.map((a) => a.type).sort()).toEqual(['chequing', 'credit_card', 'investing', 'savings']);
    const interest = (await app.repos.transactions.all()).filter((t) => t.originKey?.startsWith('int:'));
    expect(interest.length).toBeGreaterThanOrEqual(2);
  });

  it('Bills can be removed only once no recurring bills use it, and a new bill brings it back', async () => {
    const app = await appWithCategories('2026-10-20');
    const chq = await createAccount(app, { name: 'Chq', type: 'chequing', openingBalanceCents: 100000 });
    const rent = await createRecurring(app, { name: 'Rent', kind: 'bill', amountCents: 90000, freq: 'monthly', nextDate: '2026-11-01', accountIds: [chq.id] });
    await expect(removeCategory(app, categoryId('bills'))).rejects.toBeInstanceOf(CategoryInUseError);
    await archiveRecurring(app, rent.id);
    await setAllocation(app, categoryId('bills'), 90000);
    await removeCategory(app, categoryId('bills'));
    let bills = (await app.repos.categories.get(categoryId('bills')))!;
    expect(bills.archived).toBe(true);
    expect((await budgetsFor(app)).rows.some((r) => r.category.id === bills.id)).toBe(false);
    expect((await budgetsFor(app)).plan.templateAllocations[bills.id]).toBe(0);
    await createRecurring(app, { name: 'Phone', kind: 'bill', amountCents: 4500, freq: 'monthly', nextDate: '2026-11-05', accountIds: [chq.id] });
    bills = (await app.repos.categories.get(categoryId('bills')))!;
    expect(bills.archived).toBe(false);
  });

  it('any category used by a recurring item is protected the same way', async () => {
    const app = await appWithCategories('2026-10-20');
    const chq = await createAccount(app, { name: 'Chq', type: 'chequing' });
    await createRecurring(app, { name: 'Gym', kind: 'subscription', amountCents: 5000, freq: 'monthly', nextDate: '2026-11-01', accountIds: [chq.id], categoryId: categoryId('personal') });
    await expect(removeCategory(app, categoryId('personal'))).rejects.toMatchObject({ count: 1 });
    await removeCategory(app, categoryId('fun'));
    expect((await app.repos.categories.get(categoryId('fun')))!.archived).toBe(true);
  });

  it('removing a goal drops it and its contribution, keeping money already moved', async () => {
    const app = await appWithCategories('2026-10-20');
    const chq = await createAccount(app, { name: 'Chq', type: 'chequing', openingBalanceCents: 200000 });
    const tfsa = await createAccount(app, { name: 'TFSA', type: 'investing' });
    const goal = await createGoal(app, { name: 'Trip', targetCents: 40000, accountId: tfsa.id });
    await setGoalContribution(app, goal.id, 10000);
    await contribute(app, goal.id, chq.id, 5000);
    await removeGoal(app, goal.id);
    expect(await listGoals(app)).toEqual([]);
    expect((await budgetsFor(app)).plan.goalContributions[goal.id]).toBeUndefined();
    expect((await getHome(app)).sts.breakdown.goalLines).toEqual([]);
    expect((await app.repos.transactions.all()).filter((t) => t.goalId === goal.id)).toHaveLength(1); // the transfer stays
  });
});
