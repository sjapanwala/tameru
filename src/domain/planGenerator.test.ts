import { describe, expect, it } from 'vitest';
import { generatePlan, goalNeed, monthsUntil, regenerateGoals, scaleToPeriod, type GeneratorInput } from './planGenerator';

const base = (p: Partial<GeneratorInput> = {}): GeneratorInput => ({
  today: '2026-01-01',
  incomeMonthlyCents: 300000,
  billsMonthlyCents: 120000,
  billCount: 3,
  billsCategoryId: 'bills',
  fundCategoryId: 'fund',
  habitsWeekly: { groc: 12000, dine: 6000 },
  defaultHabitsWeekly: { groc: 6000, dine: 2500 },
  goals: [],
  ...p,
});
const total = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);

describe('generatePlan', () => {
  it('fixed costs first, habits for flexible, surplus split, never over-assigns', () => {
    const p = generatePlan(base());
    expect(p.allocations.bills).toBe(120000);
    expect(p.allocations.groc).toBe(52000); // 120/wk × 52/12
    expect(p.allocations.dine).toBe(26000);
    // surplus 300000 − 120000 − 78000 = 102000; no goals → half to the fund
    expect(p.allocations.fund).toBe(51000);
    expect(p.summary.unassignedCents).toBe(51000);
    expect(p.reasons.bills).toEqual([{ code: 'fixed_bills', params: { count: 3, total: 120000 } }]);
    expect(p.reasons.groc![0]!.code).toBe('from_habit');
  });
  it('uses defaults for skipped habits and says so', () => {
    const p = generatePlan(base({ habitsWeekly: { groc: undefined, dine: 6000 } }));
    expect(p.allocations.groc).toBe(26000);
    expect(p.reasons.groc![0]!.code).toBe('default_habit');
  });
  it('sizes goals from target and date, and nudges flexible 5% toward goals', () => {
    const p = generatePlan(base({ goals: [{ id: 'trip', targetCents: 120000, targetDate: '2026-07-01', progressCents: 0 }] }));
    expect(monthsUntil('2026-01-01', '2026-07-01')).toBe(6);
    expect(p.allocations.groc).toBe(49400);
    // needed 20000, then half of the surplus on top
    const surplus = 300000 - 120000 - 49400 - 24700 - 20000;
    expect(p.goalContributions.trip).toBe(20000 + Math.floor(surplus * 0.5));
    expect(p.flags).toEqual([]);
    expect(p.summary.unassignedCents).toBeGreaterThanOrEqual(0);
  });
  it('trims flexible (not below 85% of habit) to fit a goal', () => {
    // available 90000; nudged habits 74100 + goal 20000 don't fit, floor 66300 + 20000 does → flexible trimmed to 70000
    const tight = generatePlan(base({ incomeMonthlyCents: 210000, goals: [{ id: 'g', targetCents: 120000, targetDate: '2026-07-01', progressCents: 0 }] }));
    expect(tight.goalContributions.g).toBe(20000);
    expect(tight.allocations.groc! + tight.allocations.dine!).toBe(70000);
    expect(tight.reasons.groc!.some((r) => r.code === 'trimmed_for_goals')).toBe(true);
  });
  it('caps goals that do not fit and suggests a realistic date and amount', () => {
    const p = generatePlan(base({ incomeMonthlyCents: 200000, goals: [{ id: 'car', targetCents: 600000, targetDate: '2026-07-01', progressCents: 0 }] }));
    // available 80000, floor 66300 → 13700 for the goal (needs 100000)
    expect(p.allocations.groc! + p.allocations.dine!).toBe(66300);
    expect(p.goalContributions.car).toBe(13700);
    expect(p.flags).toEqual([{ goalId: 'car', code: 'date_unrealistic', realisticDate: '2029-09-01', reachableByDateCents: 13700 * 6, monthlyCents: 13700 }]);
    expect(total(p.allocations) + total(p.goalContributions)).toBeLessThanOrEqual(200000);
  });
  it('when income does not cover habits, splits what there is and gives goals nothing', () => {
    const p = generatePlan(base({ incomeMonthlyCents: 150000, goals: [{ id: 'g', targetCents: 10000, progressCents: 0 }] }));
    expect(p.allocations.groc! + p.allocations.dine!).toBe(30000);
    expect(p.goalContributions.g).toBe(0);
    expect(p.flags[0]).toMatchObject({ goalId: 'g', code: 'no_room_now' });
    expect(p.reasons.groc).toContainEqual({ code: 'income_tight' });
  });
  it('handles goals without dates or amounts', () => {
    expect(goalNeed({ id: 'a', targetCents: 120000, progressCents: 0 }, '2026-01-01').needed).toBe(10000);
    expect(goalNeed({ id: 'b', progressCents: 0 }, '2026-01-01').needed).toBe(0);
    expect(goalNeed({ id: 'c', targetCents: 100, progressCents: 500 }, '2026-01-01').reason.code).toBe('goal_reached');
    const p = generatePlan(base({ goals: [{ id: 'open', progressCents: 0 }] }));
    expect(p.goalContributions.open).toBeGreaterThan(0);
  });
  it('money is always integer cents', () => {
    const p = generatePlan(base({ incomeMonthlyCents: 123457, billsMonthlyCents: 33333, goals: [{ id: 'g', targetCents: 77777, targetDate: '2026-04-15', progressCents: 1 }] }));
    for (const v of [...Object.values(p.allocations), ...Object.values(p.goalContributions)]) expect(Number.isInteger(v)).toBe(true);
  });
});

describe('regenerateGoals', () => {
  it('only touches the changed goal and respects room left', () => {
    const r = regenerateGoals(
      { today: '2026-01-01', incomeMonthlyCents: 300000, goals: [{ id: 'a', targetCents: 60000, targetDate: '2026-07-01', progressCents: 0 }, { id: 'b', targetCents: 1, progressCents: 0 }] },
      { bills: 200000, groc: 50000 },
      { a: 5000, b: 30000 },
      ['a'],
    );
    expect(r.goalContributions).toEqual({ a: 10000, b: 30000 });
    const capped = regenerateGoals(
      { today: '2026-01-01', incomeMonthlyCents: 260000, goals: [{ id: 'a', targetCents: 600000, targetDate: '2026-07-01', progressCents: 0 }] },
      { bills: 200000, groc: 50000 },
      { a: 0 },
      ['a'],
    );
    expect(capped.goalContributions.a).toBe(10000);
    expect(capped.flags[0]!.code).toBe('date_unrealistic');
  });
});

describe('scaleToPeriod', () => {
  it('scales a monthly plan to biweekly', () => expect(scaleToPeriod({ x: 100000 }, 14)).toEqual({ x: 46027 }));
});
