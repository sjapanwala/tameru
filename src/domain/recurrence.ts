// Recurring schedules: expand into dated occurrences over any range.

import { addDays, clampedDay, diffDays, maxDate, minDate, parts } from './dates';
import type { Cents, Frequency, LocalDate, RecurringItem, Schedule } from './types';

/** Occurrence dates of a schedule within [from, to] (inclusive), sorted. */
export function expandSchedule(schedule: Schedule, from: LocalDate, to: LocalDate): LocalDate[] {
  if (from > to) return [];
  switch (schedule.freq) {
    case 'weekly':
    case 'biweekly': {
      const step = schedule.freq === 'weekly' ? 7 : 14;
      // First k with anchor + k·step ≥ from (k may be negative if the anchor is in the future).
      const k = Math.ceil(diffDays(schedule.anchor, from) / step);
      const out: LocalDate[] = [];
      for (let d = addDays(schedule.anchor, k * step); d <= to; d = addDays(d, step)) out.push(d);
      return out;
    }
    case 'monthly':
    case 'semimonthly': {
      const days = schedule.freq === 'monthly' ? [schedule.day] : schedule.days;
      return eachMonth(from, to, (y, m) => days.map((d) => clampedDay(y, m, d)), from, to);
    }
    case 'yearly':
      return eachMonth(from, to, (y, m) => (m === schedule.month ? [clampedDay(y, m, schedule.day)] : []), from, to);
    case 'irregular':
      return [];
  }
}

function eachMonth(
  from: LocalDate,
  to: LocalDate,
  datesIn: (y: number, m: number) => LocalDate[],
  lo: LocalDate,
  hi: LocalDate,
): LocalDate[] {
  const out = new Set<LocalDate>();
  let { y, m } = parts(from);
  const end = parts(to);
  while (y < end.y || (y === end.y && m <= end.m)) {
    for (const d of datesIn(y, m)) if (d >= lo && d <= hi) out.add(d);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return [...out].sort();
}

/** Occurrences of an item within [from, to], respecting its start and end dates. */
export function occurrences(item: Pick<RecurringItem, 'schedule' | 'startDate' | 'endDate'>, from: LocalDate, to: LocalDate): LocalDate[] {
  const lo = maxDate(from, item.startDate);
  const hi = item.endDate ? minDate(to, item.endDate) : to;
  return expandSchedule(item.schedule, lo, hi);
}

/** Next occurrence on or after `on`, searching up to ~13 months ahead. */
export function nextOccurrence(item: Pick<RecurringItem, 'schedule' | 'startDate' | 'endDate'>, on: LocalDate): LocalDate | undefined {
  return occurrences(item, on, addDays(on, 400))[0];
}

/**
 * Build a schedule from what the user sees: a frequency and the next date.
 * Monthly bills on the 29th–31st mean "that day, or the last day of shorter months".
 */
export function scheduleFrom(freq: Frequency, nextDate: LocalDate, semimonthlyDays: [number, number] = [1, 15]): Schedule {
  const { m, day } = parts(nextDate);
  switch (freq) {
    case 'weekly':
    case 'biweekly':
      return { freq, anchor: nextDate };
    case 'semimonthly':
      return { freq, days: semimonthlyDays };
    case 'monthly':
      return { freq, day };
    case 'yearly':
      return { freq, month: m, day };
    case 'irregular':
      return { freq };
  }
}

export type AmountView = 'expected' | 'conservative';

/**
 * Amount of one occurrence. For ranges, 'expected' is the midpoint; 'conservative'
 * is the low end for income and the high end for bills (never overstates what's free).
 */
export function occurrenceAmount(item: Pick<RecurringItem, 'amount' | 'kind'>, view: AmountView = 'expected'): Cents {
  const a = item.amount;
  if ('fixedCents' in a) return a.fixedCents;
  if (view === 'expected') return Math.round((a.minCents + a.maxCents) / 2);
  return item.kind === 'income' ? a.minCents : a.maxCents;
}

/** Occurrences per month, on average. */
export function perMonth(freq: Frequency): number {
  return { weekly: 52 / 12, biweekly: 26 / 12, semimonthly: 2, monthly: 1, yearly: 1 / 12, irregular: 0 }[freq];
}

/** Monthly income spread over one occurrence of `freq` (a weekly bill sees a week's pay). */
export function incomePerOccurrence(monthlyCents: Cents, freq: Frequency): Cents {
  const n = perMonth(freq);
  return n > 0 ? Math.round(monthlyCents / n) : monthlyCents;
}

/** Average monthly amount of an item, in cents. */
export function monthlyEquivalent(item: Pick<RecurringItem, 'amount' | 'kind' | 'schedule' | 'irregularMonthlyCents'>, view: AmountView = 'expected'): Cents {
  if (item.schedule.freq === 'irregular') return item.irregularMonthlyCents ?? 0;
  return Math.round(occurrenceAmount(item, view) * perMonth(item.schedule.freq));
}

export const isIncome = (item: Pick<RecurringItem, 'kind'>): boolean => item.kind === 'income';
