import { describe, expect, it } from 'vitest';
import {
  buildPlan,
  debtPayoffOrder,
  monthsUntil,
  PLAN_DISCLAIMER,
  requiredMonthly,
  suggestBudgets,
} from './plan';
import { monthlyEquivalent, occurrencesBetween } from './recurring';
import type { Account, Goal, Recurring, Schedule } from './types';

const base = { createdAt: 't', updatedAt: 't', deletedAt: null };
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const rec = (
  id: string,
  kind: Recurring['kind'],
  amountCents: number,
  freq: Schedule['freq'],
  extra: Partial<Recurring> = {},
): Recurring => ({ ...base, id, name: id, amountCents, kind, categoryId: null, schedule: { freq, anchorDate: '2026-10-01' }, ...extra });
const goal = (id: string, over: Partial<Goal> = {}): Goal => ({
  ...base,
  id,
  name: id,
  targetCents: 120_000,
  savedCents: 0,
  monthlyContributionCents: 0,
  targetDate: null,
  ...over,
});
const card = (id: string, owedCents: number, aprPct: number | null): Account => ({
  ...base,
  id,
  name: id,
  type: 'credit',
  startingBalanceCents: -owedCents,
  aprPct,
});

describe('schedule helpers', () => {
  it('converts every schedule to a monthly amount', () => {
    expect(monthlyEquivalent(rec('a', 'bill', 1_000, 'weekly'))).toBe(4_333);
    expect(monthlyEquivalent(rec('a', 'income', 200_000, 'biweekly'))).toBe(433_333);
    expect(monthlyEquivalent(rec('a', 'income', 150_000, 'semimonthly'))).toBe(300_000);
    expect(monthlyEquivalent(rec('a', 'bill', 5_500, 'monthly'))).toBe(5_500);
    expect(monthlyEquivalent(rec('a', 'bill', 12_000, 'yearly'))).toBe(1_000);
  });

  it('pays twice a month, 15 days apart, clamped to the month end', () => {
    const on = (anchorDate: string, from: string, to: string) =>
      occurrencesBetween({ freq: 'semimonthly', anchorDate }, from, to);
    expect(on('2026-10-01', '2026-10-01', '2026-11-30')).toEqual(['2026-10-01', '2026-10-16', '2026-11-01', '2026-11-16']);
    expect(on('2026-10-30', '2026-10-01', '2026-11-30')).toEqual(['2026-10-30', '2026-11-15', '2026-11-30']);
    expect(on('2026-01-31', '2026-02-01', '2026-02-28')).toEqual(['2026-02-16', '2026-02-28']);
  });
});

describe('goal maths', () => {
  it('counts whole months, at least one', () => {
    expect(monthsUntil('2026-10-07', '2027-10-07')).toBe(12);
    expect(monthsUntil('2026-10-07', '2026-10-20')).toBe(1);
    expect(monthsUntil('2026-10-07', '2026-01-01')).toBe(1);
  });

  it('requires (target − saved) ÷ months remaining, rounded up', () => {
    expect(requiredMonthly({ targetCents: 120_000, savedCents: 20_000, targetDate: '2027-10-07' }, '2026-10-07')).toBe(8_334);
    expect(requiredMonthly({ targetCents: 50_000, savedCents: 60_000, targetDate: '2027-01-01' }, '2026-10-07')).toBe(0);
    expect(requiredMonthly({ targetCents: 50_000, savedCents: 0, targetDate: null }, '2026-10-07')).toBeNull();
  });
});

describe('debtPayoffOrder', () => {
  const cards = [card('big-low', 500_000, 12.99), card('small-mid', 40_000, 19.99), card('mid-high', 150_000, 24.99), card('paid', 0, 29.99)];

  it('avalanche: highest rate first', () => {
    expect(debtPayoffOrder(cards, 'avalanche').map((d) => d.name)).toEqual(['mid-high', 'small-mid', 'big-low']);
  });

  it('snowball: smallest balance first', () => {
    expect(debtPayoffOrder(cards, 'snowball').map((d) => d.name)).toEqual(['small-mid', 'mid-high', 'big-low']);
  });

  it('treats an unknown rate as the lowest and ignores non-cards', () => {
    const mixed = [card('unknown', 10_000, null), card('known', 20_000, 5), { ...card('chq', 99_999, 30), type: 'chequing' as const }];
    expect(debtPayoffOrder(mixed, 'avalanche').map((d) => d.name)).toEqual(['known', 'unknown']);
  });
});

describe('buildPlan', () => {
  const recurring = [
    rec('pay', 'income', 200_000, 'semimonthly'), // 4000.00
    rec('rent', 'bill', 150_000, 'monthly'),
    rec('insurance', 'bill', 120_000, 'yearly'), // 100.00
  ];
  const plan = (over: Partial<Parameters<typeof buildPlan>[0]> = {}) =>
    buildPlan({ today: '2026-10-07', recurring, goals: [], accounts: [], strategy: 'avalanche', money, ...over });

  it('allocates income to bills, goals and flexible spending', () => {
    const result = plan({ goals: [goal('trip', { monthlyContributionCents: 30_000 })] });
    expect(result.monthly).toEqual({ incomeCents: 400_000, billsCents: 160_000, goalsCents: 30_000, flexibleCents: 210_000 });
    expect(result.feasible).toBe(true);
    expect(result.recommendations[0]).toMatchObject({ id: 'allocation', tone: 'info' });
    expect(result.recommendations[0]?.title).toContain('$2100.00');
  });

  it('sizes the emergency fund at 3 months of bills, 6 if income varies', () => {
    expect(plan().emergencyFund).toEqual({ months: 3, targetCents: 480_000 });
    const varies = plan({ recurring: [rec('gigs', 'income', 300_000, 'monthly', { variable: true }), recurring[1]!] });
    expect(varies.incomeVaries).toBe(true);
    expect(varies.emergencyFund).toEqual({ months: 6, targetCents: 900_000 });
    expect(varies.recommendations.find((r) => r.id === 'emergency-fund')?.body).toContain('6 months');
  });

  it('flags goals that need more than is being set aside', () => {
    const result = plan({
      goals: [
        goal('trip', { targetCents: 240_000, targetDate: '2027-10-07', monthlyContributionCents: 10_000 }),
        goal('bike', { targetCents: 60_000, targetDate: '2027-10-07', monthlyContributionCents: 5_000 }),
      ],
    });
    expect(result.goals.map((g) => [g.name, g.requiredMonthlyCents, g.onTrack])).toEqual([
      ['trip', 20_000, false],
      ['bike', 5_000, true],
    ]);
    const warning = result.recommendations.find((r) => r.id === 'goal-trip');
    expect(warning).toMatchObject({ tone: 'warning' });
    expect(warning?.title).toContain('$200.00');
    expect(result.recommendations.some((r) => r.id === 'goal-bike')).toBe(false);
  });

  it('warns when goals exceed income minus bills', () => {
    const result = plan({ goals: [goal('yacht', { monthlyContributionCents: 300_000 })] });
    expect(result.feasible).toBe(false);
    expect(result.shortfallCents).toBe(60_000);
    expect(result.monthly.flexibleCents).toBe(-60_000);
    expect(result.recommendations.find((r) => r.id === 'over-committed')).toMatchObject({ tone: 'warning' });
  });

  it('explains the payoff order for the chosen strategy', () => {
    const accounts = [card('Visa', 500_000, 12.99), card('Store card', 40_000, 24.99)];
    const avalanche = plan({ accounts }).recommendations.find((r) => r.id === 'debt-order');
    expect(avalanche?.title).toBe('Pay down Store card first');
    expect(avalanche?.body).toContain('Highest interest first');
    const snowball = plan({ accounts, strategy: 'snowball' });
    expect(snowball.debtOrder.map((d) => d.name)).toEqual(['Store card', 'Visa']);
    expect(snowball.recommendations.find((r) => r.id === 'debt-order')?.body).toContain('Smallest balance first');
  });

  it('gives every recommendation an explanation, and its assumptions where it made any', () => {
    const result = plan({
      accounts: [card('Visa', 500_000, 12.99)],
      goals: [goal('trip', { targetCents: 240_000, targetDate: '2027-10-07', monthlyContributionCents: 350_000 })],
    });
    expect(result.recommendations.length).toBeGreaterThanOrEqual(4);
    for (const recommendation of result.recommendations) {
      expect(recommendation.body.length).toBeGreaterThan(20);
      expect(recommendation.assumptions.length).toBeGreaterThan(0);
    }
  });

  it('asks for income before anything else', () => {
    const result = plan({ recurring: [recurring[1]!] });
    expect(result.recommendations[0]).toMatchObject({ id: 'no-income', tone: 'warning' });
  });

  it('carries the not-advice line', () => {
    expect(PLAN_DISCLAIMER).toBe('General budgeting guidance, not financial advice.');
  });
});

describe('suggestBudgets', () => {
  const categories = [
    { id: 'g', name: 'Groceries' },
    { id: 'd', name: 'Dining out' },
    { id: 'f', name: 'Fun' },
  ];
  const tx = (date: string, amountCents: number, categoryId: string | null, recurringId?: string) => ({ date, amountCents, categoryId, recurringId });
  const history = [
    ...Array.from({ length: 6 }, (_, i) => tx(`2026-09-${String(5 + i * 4).padStart(2, '0')}`, -10_000, 'g')),
    ...Array.from({ length: 4 }, (_, i) => tx(`2026-09-${String(6 + i * 5).padStart(2, '0')}`, -5_000, 'd')),
    tx('2026-09-10', -150_000, 'g', 'rent'), // bill payment: ignored
    tx('2026-09-12', -9_999, null), // uncategorised: ignored
    tx('2026-09-15', 200_000, null), // income: ignored
  ];

  it('splits the flexible amount by real spending proportions', () => {
    const result = suggestBudgets({ today: '2026-10-07', flexibleCents: 100_000, transactions: history, categories });
    expect(result).toEqual([
      { categoryId: 'g', name: 'Groceries', share: 0.75, monthlyCents: 75_000 },
      { categoryId: 'd', name: 'Dining out', share: 0.25, monthlyCents: 25_000 },
    ]);
  });

  it('rounds to a tidy amount', () => {
    const result = suggestBudgets({ today: '2026-10-07', flexibleCents: 98_765, transactions: history, categories });
    expect(result.map((s) => s.monthlyCents)).toEqual([74_000, 24_500]);
  });

  it('waits until there is enough history', () => {
    const args = { today: '2026-10-07', flexibleCents: 100_000, categories };
    expect(suggestBudgets({ ...args, transactions: history.slice(0, 5) })).toEqual([]);
    const cramped = Array.from({ length: 12 }, () => tx('2026-10-05', -1_000, 'g'));
    expect(suggestBudgets({ ...args, transactions: cramped })).toEqual([]);
  });

  it('suggests nothing when there is nothing flexible', () => {
    expect(suggestBudgets({ today: '2026-10-07', flexibleCents: 0, transactions: history, categories })).toEqual([]);
  });
});
