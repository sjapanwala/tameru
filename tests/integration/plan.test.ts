import { describe, expect, it } from 'vitest';
import { testApp } from '../helpers';
import { categoryId } from '../../src/domain/defaults';
import { seedSampleData } from '../../src/data/seed';
import { createAccount } from '../../src/services/accounts';
import { contribute, createGoal, listGoals } from '../../src/services/goals';
import { getHome } from '../../src/services/home';
import { applyCover, budgetsFor, setAllocation } from '../../src/services/plan';
import { addTransaction } from '../../src/services/transactions';

describe('plan services', () => {
  it('shows remaining, offers covers for an over, and applies one in one action', async () => {
    const app = await testApp('2026-10-20');
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
    const app = await testApp('2026-10-20');
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
    const app = await testApp('2026-10-20');
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
});
