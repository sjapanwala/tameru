import { describe, expect, it } from 'vitest';
import { answer, back, isFullName, currentStep, defaultNextPayday, incomeMonthlyConservative, initialState, isComplete, skip, steps, toGeneratorInput } from './onboarding';

describe('onboarding conversation', () => {
  it('requires a full name before anything else', () => {
    expect(isFullName('Saaim')).toBe(false);
    expect(isFullName('  Saaim   Japanwala ')).toBe(true);
    expect(isFullName('Saaim 2')).toBe(false);
    expect(answer(initialState(), { step: 'welcome', name: 'Saaim' }).index).toBe(0);
    expect(skip(initialState()).index).toBe(0);
    const s = answer(initialState(), { step: 'welcome', name: ' Saaim   Japanwala ' });
    expect(s.index).toBe(1);
    expect(s.answers.name).toBe('Saaim Japanwala');
  });
  it('walks one question at a time and every step after the name can be skipped', () => {
    let s = answer(initialState(), { step: 'welcome', name: 'Sam Lee' });
    let guard = 0;
    while (!isComplete(s) && guard++ < 50) s = skip(s);
    expect(isComplete(s)).toBe(true);
    expect(s.answers.accounts).toEqual([{ type: 'chequing', name: 'Chequing', balanceCents: 0 }]);
    expect(s.answers.categories).toEqual([]);
  });
  it('adds one detail question per chosen account type', () => {
    let s = answer(initialState(), { step: 'welcome', name: 'Sam Lee' });
    s = answer(s, { step: 'income', income: { name: 'Job', freq: 'biweekly', amountCents: 80000, nextDate: '2026-01-09' } });
    s = answer(s, { step: 'more_income', income: { name: 'Tutoring', freq: 'irregular', amountCents: 20000, nextDate: '2026-01-09' } });
    expect(currentStep(s)).toEqual({ id: 'more_income' }); // asks again
    s = answer(s, { step: 'more_income' });
    s = answer(s, { step: 'account_types', types: ['chequing', 'savings', 'credit_card'] });
    expect(steps(s.answers).filter((x) => x.id === 'account_detail')).toHaveLength(3);
    expect(currentStep(s)).toEqual({ id: 'account_detail', type: 'chequing' });
    s = answer(s, { step: 'account_detail', account: { type: 'chequing', name: 'Main', balanceCents: 50000 } });
    s = skip(s); // savings → defaults
    expect(s.answers.accounts.map((a) => a.type)).toEqual(['chequing', 'savings']);
    s = back(s);
    expect(currentStep(s)).toEqual({ id: 'account_detail', type: 'savings' });
    expect(s.answers.incomes).toHaveLength(2);
  });
  it('keeps at most 3 goals and drops empty bills', () => {
    const s = answer(initialState(), { step: 'goals', goals: ['a', 'b', 'c', 'd'].map((name) => ({ name })) });
    expect(s.answers.goals).toHaveLength(3);
    expect(answer(initialState(), { step: 'bills', bills: [{ name: 'x', amountCents: 0, day: 1, kind: 'bill' }] }).answers.bills).toEqual([]);
  });
  it('maps answers to generator input conservatively', () => {
    expect(incomeMonthlyConservative({ name: 'x', freq: 'biweekly', range: { minCents: 70000, maxCents: 90000 }, nextDate: '2026-01-01' })).toBe(151667);
    expect(incomeMonthlyConservative({ name: 'x', freq: 'irregular', amountCents: 40000, nextDate: '2026-01-01' })).toBe(30000);
    const g = toGeneratorInput(
      { ...initialState().answers, bills: [{ name: 'Rent', amountCents: 90000, day: 1, kind: 'bill' }], categories: [{ name: 'Groceries', color: '#4ade80', weeklyCents: 5000 }, { name: 'Climbing', color: '#a78bfa' }], goals: [{ name: 'Trip', targetCents: 50000 }] },
      '2026-01-01',
    );
    expect(g.billsMonthlyCents).toBe(90000);
    expect(g.habitsWeekly).toEqual({ new_cat_0: 5000, new_cat_1: undefined });
    expect(g.defaultHabitsWeekly).toEqual({ new_cat_0: 6000, new_cat_1: 2000 }); // a suggestion's typical week, else $20
    expect(g.goals).toEqual([{ id: 'new_goal_0', progressCents: 0, targetCents: 50000 }]);
  });
  it('defaults the next payday', () => {
    expect(defaultNextPayday('biweekly', '2026-10-18')).toBe('2026-10-23'); // next Friday
    expect(defaultNextPayday('semimonthly', '2026-10-10')).toBe('2026-10-15');
    expect(defaultNextPayday('monthly', '2026-12-10')).toBe('2027-01-01');
  });
});

describe('initials', () => {
  it('takes first and last word initials', async () => {
    const { initials } = await import('./onboarding');
    expect(initials('Saaim Japanwala')).toBe('SJ');
    expect(initials('  maria  de la cruz ')).toBe('MC');
    expect(initials('Zoë')).toBe('Z');
    expect(initials('')).toBe('');
    expect(initials(undefined)).toBe('');
    expect(initials('!!')).toBe('');
  });
});
