import { describe, expect, it } from 'vitest';
import { testApp } from '../helpers';
import { answer, initialState, skip, type OnboardingAnswers } from '../../src/domain/onboarding';
import { on } from '../../src/services/events';
import { listGoals, updateGoal } from '../../src/services/goals';
import { getHome } from '../../src/services/home';
import { finishOnboarding, loadProgress, previewPlan, saveProgress } from '../../src/services/onboarding';
import { periodContext } from '../../src/services/plan';

const answers = (p: Partial<OnboardingAnswers> = {}): OnboardingAnswers => ({
  incomes: [{ name: 'Café job', freq: 'biweekly', range: { minCents: 70000, maxCents: 85000 }, nextDate: '2026-10-23' }],
  accountTypes: ['chequing', 'savings', 'credit_card'],
  accounts: [
    { type: 'chequing', name: 'Chequing', balanceCents: 90000 },
    { type: 'savings', name: 'HISA', balanceCents: 40000, rateBps: 350, rateKind: 'apy' },
    { type: 'credit_card', name: 'Visa', balanceCents: 12000, monthlyFeeCents: 499, dueDay: 25 },
  ],
  bills: [
    { name: 'Rent', amountCents: 80000, day: 1, kind: 'bill' },
    { name: 'Phone', amountCents: 4500, day: 31, kind: 'bill', payFrom: ['credit_card', 'chequing'] },
  ],
  habitsWeekly: { groceries: 5000, eating_out: 2000 },
  goals: [{ name: 'Laptop', targetCents: 150000, targetDate: '2027-06-01' }],
  periodAlignment: 'month',
  ...p,
});

describe('onboarding end to end', () => {
  it('saves progress so quitting resumes on the same question', async () => {
    const app = await testApp('2026-10-18');
    const s = skip(answer(initialState(), { step: 'welcome' }));
    await saveProgress(app, s);
    expect(await loadProgress(app)).toEqual(s);
  });

  it('creates everything from answers and fires the completion hook', async () => {
    const app = await testApp('2026-10-18');
    const fired: unknown[] = [];
    const off = on('onboardingComplete', (p) => fired.push(p));
    const a = answers();
    const plan = previewPlan(a, '2026-10-18');
    await finishOnboarding(app, a, plan);
    off();
    expect(fired).toEqual([{ accounts: 3, goals: 1 }]);
    const accounts = await app.repos.accounts.all();
    expect(accounts.find((x) => x.type === 'credit_card')!.openingBalanceCents).toBe(-12000);
    const rec = await app.repos.recurring.all();
    expect(rec.map((r) => r.name).sort()).toEqual(['Café job', 'Phone', 'Rent', 'Visa fee']);
    const phone = rec.find((r) => r.name === 'Phone')!;
    expect(phone.schedule).toEqual({ freq: 'monthly', day: 31 });
    expect(phone.defaultAccountId).toBe(accounts.find((x) => x.type === 'credit_card')!.id);
    const goals = await listGoals(app);
    expect(goals[0]!.perPeriodCents).toBe(plan.goalContributions.new_goal_0);
    const s = await app.repos.settings.get();
    expect(s.onboardedAt).toBeDefined();
    expect(s.onboarding).toBeUndefined();
    expect((await app.repos.events.all()).some((e) => e.type === 'onboarding_complete')).toBe(true);
    const home = await getHome(app);
    expect(home.rows.find((r) => r.category.id === 'cat_bills')!.budget.remainingCents).toBe(80000 + 4500);
  });

  it('payday alignment scales the plan to the pay period', async () => {
    const app = await testApp('2026-10-18');
    const a = answers({ periodAlignment: 'payday' });
    const monthly = previewPlan({ ...a, periodAlignment: 'month' }, '2026-10-18');
    const biweekly = previewPlan(a, '2026-10-18');
    // average biweekly period = 365 / 26 days
    expect(biweekly.allocations.cat_groceries).toBe(Math.round((monthly.allocations.cat_groceries! * 12) / 26));
    await finishOnboarding(app, a, biweekly);
    const { period } = await periodContext(app);
    expect(period).toEqual({ start: '2026-10-09', end: '2026-10-22' });
  });

  it('editing a goal re-sizes only that goal’s contribution', async () => {
    const app = await testApp('2026-10-18');
    const a = answers({ goals: [{ name: 'Laptop', targetCents: 150000, targetDate: '2027-06-01' }, { name: 'Trip', targetCents: 60000, targetDate: '2027-04-01' }] });
    await finishOnboarding(app, a, previewPlan(a, '2026-10-18'));
    const before = await periodContext(app);
    const [laptop, trip] = (await listGoals(app)).map((g) => g.goal);
    await updateGoal(app, laptop!.id, { targetDate: '2027-12-01' });
    const after = await periodContext(app);
    expect(after.plan.templateAllocations).toEqual(before.plan.templateAllocations);
    expect(after.plan.goalContributions[trip!.id]).toBe(before.plan.goalContributions[trip!.id]);
    expect(after.plan.goalContributions[laptop!.id]).not.toBe(before.plan.goalContributions[laptop!.id]);
  });
});
