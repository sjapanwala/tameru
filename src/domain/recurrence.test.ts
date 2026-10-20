import { describe, expect, it } from 'vitest';
import { recurring } from '../../tests/factories';
import { billsByCategory, expandSchedule, incomePerOccurrence, monthlyEquivalent, nextOccurrence, occurrenceAmount, occurrences, scheduleFrom } from './recurrence';

describe('expandSchedule', () => {
  it('puts a 31st bill on the last day of shorter months', () => {
    expect(expandSchedule({ freq: 'monthly', day: 31 }, '2026-01-01', '2026-05-31')).toEqual([
      '2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31',
    ]);
  });
  it('handles leap years for the 29th and 31st', () => {
    expect(expandSchedule({ freq: 'monthly', day: 29 }, '2028-02-01', '2028-03-31')).toEqual(['2028-02-29', '2028-03-29']);
    expect(expandSchedule({ freq: 'monthly', day: 30 }, '2027-02-01', '2027-02-28')).toEqual(['2027-02-28']);
    expect(expandSchedule({ freq: 'yearly', month: 2, day: 29 }, '2027-01-01', '2028-12-31')).toEqual(['2027-02-28', '2028-02-29']);
  });
  it('semi-monthly pays the 1st and 15th', () => {
    expect(expandSchedule({ freq: 'semimonthly', days: [1, 15] }, '2026-01-10', '2026-02-20')).toEqual(['2026-01-15', '2026-02-01', '2026-02-15']);
    expect(expandSchedule({ freq: 'semimonthly', days: [15, 31] }, '2026-02-01', '2026-02-28')).toEqual(['2026-02-15', '2026-02-28']);
  });
  it('anchors biweekly cycles to the start date, in either direction', () => {
    const s = { freq: 'biweekly' as const, anchor: '2026-01-02' };
    expect(expandSchedule(s, '2026-01-01', '2026-02-15')).toEqual(['2026-01-02', '2026-01-16', '2026-01-30', '2026-02-13']);
    expect(expandSchedule(s, '2025-12-01', '2025-12-31')).toEqual(['2025-12-05', '2025-12-19']);
    expect(expandSchedule(s, '2026-01-03', '2026-01-15')).toEqual([]);
    // 27 paydays in some years
    expect(expandSchedule({ freq: 'biweekly', anchor: '2026-01-01' }, '2026-01-01', '2026-12-31')).toHaveLength(27);
  });
  it('weekly', () => {
    expect(expandSchedule({ freq: 'weekly', anchor: '2026-03-02' }, '2026-03-01', '2026-03-20')).toEqual(['2026-03-02', '2026-03-09', '2026-03-16']);
  });
  it('irregular and empty ranges produce nothing', () => {
    expect(expandSchedule({ freq: 'irregular' }, '2026-01-01', '2026-12-31')).toEqual([]);
    expect(expandSchedule({ freq: 'monthly', day: 1 }, '2026-02-01', '2026-01-01')).toEqual([]);
  });
});

describe('items', () => {
  const rent = { schedule: { freq: 'monthly' as const, day: 1 }, startDate: '2026-03-01', endDate: '2026-05-01' };
  it('respects start and end dates', () => {
    expect(occurrences(rent, '2026-01-01', '2026-12-31')).toEqual(['2026-03-01', '2026-04-01', '2026-05-01']);
    expect(nextOccurrence(rent, '2026-03-02')).toBe('2026-04-01');
    expect(nextOccurrence(rent, '2026-05-02')).toBeUndefined();
  });
  it('builds schedules from a next date', () => {
    expect(scheduleFrom('monthly', '2026-01-31')).toEqual({ freq: 'monthly', day: 31 });
    expect(scheduleFrom('biweekly', '2026-01-02')).toEqual({ freq: 'biweekly', anchor: '2026-01-02' });
    expect(scheduleFrom('yearly', '2026-07-04')).toEqual({ freq: 'yearly', month: 7, day: 4 });
  });
  it('reads ranges conservatively', () => {
    const pay = { kind: 'income' as const, amount: { minCents: 70000, maxCents: 90000 } };
    const bill = { kind: 'bill' as const, amount: { minCents: 7000, maxCents: 9000 } };
    expect(occurrenceAmount(pay)).toBe(80000);
    expect(occurrenceAmount(pay, 'conservative')).toBe(70000);
    expect(occurrenceAmount(bill, 'conservative')).toBe(9000);
  });
  it('monthly equivalents', () => {
    expect(monthlyEquivalent({ kind: 'income', amount: { fixedCents: 100000 }, schedule: { freq: 'biweekly', anchor: '2026-01-02' } })).toBe(216667);
    expect(monthlyEquivalent({ kind: 'income', amount: { fixedCents: 0 }, schedule: { freq: 'irregular' }, irregularMonthlyCents: 30000 })).toBe(30000);
  });
});

describe('incomePerOccurrence', () => {
  it('spreads monthly income over one occurrence', () => {
    expect(incomePerOccurrence(400_000, 'monthly')).toBe(400_000);
    expect(incomePerOccurrence(400_000, 'semimonthly')).toBe(200_000);
    expect(incomePerOccurrence(520_000, 'weekly')).toBe(120_000);
    expect(incomePerOccurrence(400_000, 'yearly')).toBe(4_800_000);
    expect(incomePerOccurrence(400_000, 'irregular')).toBe(400_000);
  });
});

describe('billsByCategory', () => {
  const spotify = recurring({ id: 's', kind: 'subscription', categoryId: 'subs', amount: { fixedCents: 671 }, schedule: { freq: 'monthly', day: 21 }, startDate: '2026-10-01' });
  const claude = recurring({ id: 'c', kind: 'subscription', categoryId: 'subs', amount: { fixedCents: 3000 }, schedule: { freq: 'monthly', day: 16 }, startDate: '2026-11-16' });
  const phone = recurring({ id: 'p', kind: 'bill', categoryId: 'bills', amount: { minCents: 4000, maxCents: 5000 }, schedule: { freq: 'monthly', day: 12 }, startDate: '2026-01-01' });
  it('adds up what falls due in each category in the period, ranges at the high end', () => {
    expect(billsByCategory([spotify, claude, phone], '2026-10-09', '2026-10-22')).toEqual({ subs: 671, bills: 5000 });
    expect(billsByCategory([spotify, claude, phone], '2026-11-06', '2026-11-19')).toEqual({ subs: 3000, bills: 5000 });
  });
  it('leaves out income and stopped items', () => {
    const pay = recurring({ id: 'i', kind: 'income', categoryId: 'income', amount: { fixedCents: 90000 }, schedule: { freq: 'monthly', day: 15 } });
    expect(billsByCategory([{ ...spotify, archived: true }, pay], '2026-10-01', '2026-10-31')).toEqual({});
  });
});
