import { describe, expect, it } from 'vitest';
import { daysBetween, daysLeftInMonth, monthRange } from './dates';
import { averageDailySpend, forecast } from './forecast';
import {
  cautiousEstimate,
  occurrenceKey,
  occurrencesBetween,
  occurrencesOf,
  paidKeys,
  recordedAmounts,
} from './recurring';
import { budgetProgress, compareToLastMonth, dailySpend, safeToSpend } from './safeToSpend';
import type { Budget, Category, Goal, Recurring, Schedule } from './types';

const base = { createdAt: 't', updatedAt: 't', deletedAt: null };
const rec = (
  id: string,
  kind: Recurring['kind'],
  amountCents: number,
  freq: Schedule['freq'],
  anchorDate: string,
): Recurring => ({
  ...base,
  id,
  name: id,
  amountCents,
  kind,
  categoryId: null,
  schedule: { freq, anchorDate },
});
const tx = (
  date: string,
  amountCents: number,
  categoryId: string | null = null,
  recurringId?: string,
) => ({
  date,
  amountCents,
  categoryId,
  recurringId,
  recurringDate: recurringId ? date : undefined,
});

describe('month helpers', () => {
  it('finds month bounds and days left', () => {
    expect(monthRange('2026-02-10')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    expect(monthRange('2028-02-10').end).toBe('2028-02-29');
    expect(daysLeftInMonth('2026-10-07')).toBe(25);
    expect(daysLeftInMonth('2026-10-31')).toBe(1);
  });

  it('counts days across a DST change', () => {
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
    expect(daysBetween('2026-11-02', '2026-10-31')).toBe(-2);
  });
});

describe('occurrencesBetween', () => {
  const on = (freq: Schedule['freq'], anchorDate: string, from: string, to: string) =>
    occurrencesBetween({ freq, anchorDate }, from, to);

  it('repeats weekly and biweekly from the anchor', () => {
    expect(on('weekly', '2026-10-02', '2026-10-01', '2026-10-20')).toEqual([
      '2026-10-02',
      '2026-10-09',
      '2026-10-16',
    ]);
    expect(on('biweekly', '2026-09-04', '2026-10-01', '2026-10-31')).toEqual([
      '2026-10-02',
      '2026-10-16',
      '2026-10-30',
    ]);
  });

  it('includes the range ends', () => {
    expect(on('weekly', '2026-10-07', '2026-10-07', '2026-10-14')).toEqual([
      '2026-10-07',
      '2026-10-14',
    ]);
  });

  it('never occurs before the anchor', () => {
    expect(on('monthly', '2026-10-15', '2026-09-01', '2026-11-30')).toEqual([
      '2026-10-15',
      '2026-11-15',
    ]);
    expect(on('weekly', '2026-11-01', '2026-10-01', '2026-10-31')).toEqual([]);
  });

  it('clamps monthly items to short months', () => {
    expect(on('monthly', '2026-01-31', '2026-01-01', '2026-04-30')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
  });

  it('repeats yearly, clamping Feb 29', () => {
    expect(on('yearly', '2024-02-29', '2024-01-01', '2026-12-31')).toEqual([
      '2024-02-29',
      '2025-02-28',
      '2026-02-28',
    ]);
  });

  it('crosses year boundaries', () => {
    expect(on('monthly', '2026-11-05', '2026-12-01', '2027-02-28')).toEqual([
      '2026-12-05',
      '2027-01-05',
      '2027-02-05',
    ]);
  });
});

describe('occurrencesOf / paidKeys', () => {
  it('merges items soonest first', () => {
    const list = occurrencesOf(
      [
        rec('rent', 'bill', 100, 'monthly', '2026-10-01'),
        rec('pay', 'income', 500, 'biweekly', '2026-10-02'),
      ],
      '2026-10-01',
      '2026-10-20',
    );
    expect(list.map((o) => `${o.recurring.id}@${o.date}`)).toEqual([
      'rent@2026-10-01',
      'pay@2026-10-02',
      'pay@2026-10-16',
    ]);
  });

  it('collects keys of recorded occurrences', () => {
    const keys = paidKeys([
      { recurringId: 'rent', recurringDate: '2026-10-01' },
      { recurringId: null },
      {},
    ]);
    expect([...keys]).toEqual([occurrenceKey('rent', '2026-10-01')]);
  });
});

describe('safeToSpend', () => {
  const recurring = [
    rec('pay', 'income', 200_000, 'biweekly', '2026-10-02'), // Oct 2, 16, 30 = 6000.00
    rec('rent', 'bill', 150_000, 'monthly', '2026-10-01'),
    rec('phone', 'bill', 5_000, 'monthly', '2026-10-15'),
  ];
  const goals = [
    {
      ...base,
      id: 'g',
      name: 'Trip',
      targetCents: 1,
      savedCents: 0,
      monthlyContributionCents: 20_000,
      targetDate: null,
    },
  ] as Goal[];

  it('follows the planned formula', () => {
    const result = safeToSpend({
      today: '2026-10-07',
      recurring,
      goals,
      transactions: [
        tx('2026-10-03', -10_000),
        tx('2026-10-06', -15_000),
        tx('2026-10-01', -150_000, null, 'rent'), // bill payment: already reserved
        tx('2026-10-02', 200_000, null, 'pay'), // income: not spend
        tx('2026-09-30', -99_999), // last month
      ],
    });
    expect(result).toEqual({
      incomeCents: 600_000,
      billsCents: 155_000,
      goalsCents: 20_000,
      spentCents: 25_000,
      remainingCents: 400_000,
      daysLeft: 25,
      perDayCents: 16_000,
      hasIncome: true,
    });
  });

  it('counts a received payday for what actually arrived', () => {
    const pay = [rec('pay', 'income', 100_000, 'biweekly', '2026-10-02')];
    const planned = safeToSpend({
      today: '2026-10-07',
      recurring: pay,
      goals: [],
      transactions: [],
    });
    expect(planned.incomeCents).toBe(300_000); // Oct 2, 16, 30

    const short = safeToSpend({
      today: '2026-10-07',
      recurring: pay,
      goals: [],
      transactions: [tx('2026-10-02', 70_000, null, 'pay')],
    });
    // The first cheque came in low; the two still to come stay at the estimate.
    expect(short.incomeCents).toBe(270_000);
    expect(short.spentCents).toBe(0);
  });

  it('rounds the daily amount down', () => {
    const result = safeToSpend({
      today: '2026-10-29',
      recurring: [rec('pay', 'income', 1_000, 'monthly', '2026-10-01')],
      goals: [],
      transactions: [],
    });
    expect(result.daysLeft).toBe(3);
    expect(result.perDayCents).toBe(333);
  });

  it('never reports a negative daily amount', () => {
    const result = safeToSpend({
      today: '2026-10-07',
      recurring: [rec('pay', 'income', 10_000, 'monthly', '2026-10-01')],
      goals: [],
      transactions: [tx('2026-10-02', -25_000)],
    });
    expect(result.remainingCents).toBe(-15_000);
    expect(result.perDayCents).toBe(0);
  });

  it('flags a plan with no income', () => {
    expect(
      safeToSpend({ today: '2026-10-07', recurring: [], goals: [], transactions: [] }).hasIncome,
    ).toBe(false);
  });
});

describe('budgetProgress', () => {
  const categories = [
    { ...base, id: 'g', name: 'Groceries', sortOrder: 0 },
    { ...base, id: 'd', name: 'Dining out', sortOrder: 1 },
    { ...base, id: 'f', name: 'Fun', sortOrder: 2 },
  ] as Category[];
  const budgets = [
    { ...base, id: 'b1', categoryId: 'd', monthlyCents: 10_000 },
    { ...base, id: 'b2', categoryId: 'g', monthlyCents: 40_000 },
  ] as Budget[];

  it('reports spend against each budget in category order', () => {
    const result = budgetProgress({
      today: '2026-10-07',
      budgets,
      categories,
      transactions: [
        tx('2026-10-02', -10_000, 'g'),
        tx('2026-10-03', -12_500, 'd'),
        tx('2026-10-03', -5_000, 'f'), // no budget
        tx('2026-09-28', -30_000, 'g'), // last month
        tx('2026-10-04', 2_000, 'g'), // refunds aren't spend
      ],
    });
    expect(result).toEqual([
      {
        categoryId: 'g',
        name: 'Groceries',
        budgetCents: 40_000,
        spentCents: 10_000,
        leftCents: 30_000,
        fraction: 0.25,
        over: false,
      },
      {
        categoryId: 'd',
        name: 'Dining out',
        budgetCents: 10_000,
        spentCents: 12_500,
        leftCents: -2_500,
        fraction: 1,
        over: true,
      },
    ]);
  });
});

describe('forecast', () => {
  const recurring = [
    rec('rent', 'bill', 100_000, 'monthly', '2026-10-10'),
    rec('pay', 'income', 150_000, 'biweekly', '2026-10-16'),
  ];

  it('projects the balance day by day', () => {
    const result = forecast({ today: '2026-10-07', days: 30, balanceCents: 120_000, recurring });
    expect(result.points).toHaveLength(31);
    expect(result.points[0]).toMatchObject({ date: '2026-10-07', balanceCents: 120_000 });
    expect(result.points[3]).toMatchObject({ date: '2026-10-10', balanceCents: 20_000 });
    expect(result.points[3]?.events).toEqual([
      { name: 'rent', amountCents: -100_000, kind: 'bill' },
    ]);
    expect(result.lowest).toMatchObject({ date: '2026-10-10', balanceCents: 20_000 });
    // pay on Oct 16 and 30
    expect(result.endBalanceCents).toBe(120_000 - 100_000 + 300_000);
  });

  it('skips occurrences already recorded', () => {
    const paid = new Set([occurrenceKey('rent', '2026-10-10')]);
    const result = forecast({
      today: '2026-10-07',
      days: 7,
      balanceCents: 120_000,
      recurring,
      paid,
    });
    expect(result.lowest.balanceCents).toBe(120_000);
  });

  it('applies typical daily spending from tomorrow', () => {
    const result = forecast({
      today: '2026-10-07',
      days: 2,
      balanceCents: 10_000,
      recurring: [],
      dailySpendCents: 1_000,
    });
    expect(result.points.map((p) => p.balanceCents)).toEqual([10_000, 9_000, 8_000]);
  });

  it('adds what-if purchases inside the horizon only', () => {
    const whatIf = [
      { name: 'Bike', date: '2026-10-09', amountCents: -50_000 },
      { name: 'Later', date: '2027-01-01', amountCents: -1 },
    ];
    const result = forecast({
      today: '2026-10-07',
      days: 30,
      balanceCents: 120_000,
      recurring,
      whatIf,
    });
    expect(result.lowest).toMatchObject({ date: '2026-10-10', balanceCents: -30_000 });
    expect(result.points[2]?.events[0]).toMatchObject({ kind: 'what-if', name: 'Bike' });
  });
});

describe('averageDailySpend', () => {
  it('averages variable spend over the window', () => {
    const txs = [
      tx('2026-10-07', -3_000),
      tx('2026-09-20', -6_000),
      tx('2026-09-01', -99_000), // outside 30 days
      tx('2026-10-01', -150_000, null, 'rent'), // bill
      tx('2026-10-02', 200_000), // income
    ];
    expect(averageDailySpend(txs, '2026-10-07')).toBe(300);
  });
});

describe('dailySpend', () => {
  it('buckets variable spend by day of the month', () => {
    const days = dailySpend(
      [
        tx('2026-10-01', -1_000),
        tx('2026-10-01', -500),
        tx('2026-10-07', -2_000),
        tx('2026-10-07', -150_000, null, 'rent'),
        tx('2026-10-03', 5_000),
        tx('2026-09-30', -9_999),
      ],
      '2026-10-07',
    );
    expect(days).toHaveLength(31);
    expect(days.slice(0, 7)).toEqual([1_500, 0, 0, 0, 0, 0, 2_000]);
  });
});

describe('compareToLastMonth', () => {
  it('compares spend to date with the same stretch of last month', () => {
    const result = compareToLastMonth(
      [
        tx('2026-10-02', -4_000),
        tx('2026-10-07', -1_000),
        tx('2026-10-20', -9_000), // after today
        tx('2026-09-03', -2_500),
        tx('2026-09-07', -500),
        tx('2026-09-08', -7_000), // after the cutoff
        tx('2026-09-01', -100_000, null, 'rent'),
      ],
      '2026-10-07',
    );
    expect(result).toEqual({ previousMonth: '2026-09-01', diffCents: 2_000, hasPrevious: true });
  });

  it('caps the cutoff at the end of a shorter month', () => {
    const result = compareToLastMonth(
      [tx('2026-02-28', -1_000), tx('2026-03-31', -400)],
      '2026-03-31',
    );
    expect(result.diffCents).toBe(-600);
  });

  it('reports when there is nothing to compare against', () => {
    expect(compareToLastMonth([tx('2026-10-02', -4_000)], '2026-10-07').hasPrevious).toBe(false);
  });
});

describe('income that varies', () => {
  it('keys recorded amounts by occurrence, as magnitudes', () => {
    const amounts = recordedAmounts([
      { amountCents: 70_000, recurringId: 'pay', recurringDate: '2026-10-02' },
      { amountCents: -5_000, recurringId: 'rent', recurringDate: '2026-10-01' },
      { amountCents: -1_000 },
    ]);
    expect(amounts.get(occurrenceKey('pay', '2026-10-02'))).toBe(70_000);
    expect(amounts.get(occurrenceKey('rent', '2026-10-01'))).toBe(5_000);
    expect(amounts.size).toBe(2);
  });

  it('suggests the lowest of the last three paydays, once there are three', () => {
    expect(cautiousEstimate([90_000, 80_000])).toBeNull();
    expect(cautiousEstimate([90_000, 80_000, 110_000, 10_000])).toBe(80_000);
  });
});
