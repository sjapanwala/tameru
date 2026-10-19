// Budget period boundaries: monthly from a start day, or aligned to paydays.

import { addDays, clampedDay, diffDays, parts } from './dates';
import { expandSchedule } from './recurrence';
import type { LocalDate, PeriodConfig, Schedule } from './types';

export interface Period {
  start: LocalDate;
  end: LocalDate; // inclusive
}

function monthlyStart(d: LocalDate, startDay: number): LocalDate {
  const { y, m, day } = parts(d);
  const thisMonth = clampedDay(y, m, startDay);
  if (day >= Number(thisMonth.slice(8))) return thisMonth;
  return m === 1 ? clampedDay(y - 1, 12, startDay) : clampedDay(y, m - 1, startDay);
}

function nextMonthlyStart(start: LocalDate, startDay: number): LocalDate {
  const { y, m } = parts(start);
  return m === 12 ? clampedDay(y + 1, 1, startDay) : clampedDay(y, m + 1, startDay);
}

/**
 * The period containing `date`. For payday periods pass the payday schedule:
 * a period runs from one payday to the day before the next. Falls back to
 * calendar months when the schedule has no usable paydays (e.g. irregular).
 */
export function periodFor(config: PeriodConfig, date: LocalDate, paySchedule?: Schedule): Period {
  if (config.kind === 'payday' && paySchedule && paySchedule.freq !== 'irregular') {
    const back = expandSchedule(paySchedule, addDays(date, -400), date);
    const fwd = expandSchedule(paySchedule, addDays(date, 1), addDays(date, 400));
    const start = back[back.length - 1];
    const next = fwd[0];
    if (start && next) return { start, end: addDays(next, -1) };
  }
  const startDay = config.kind === 'monthly' ? Math.min(Math.max(config.startDay, 1), 28) : 1;
  const start = monthlyStart(date, startDay);
  return { start, end: addDays(nextMonthlyStart(start, startDay), -1) };
}

export const nextPeriod = (c: PeriodConfig, p: Period, s?: Schedule): Period => periodFor(c, addDays(p.end, 1), s);
export const previousPeriod = (c: PeriodConfig, p: Period, s?: Schedule): Period => periodFor(c, addDays(p.start, -1), s);

/** All periods from the one containing `from` up to the one containing `to`. */
export function periodsBetween(c: PeriodConfig, from: LocalDate, to: LocalDate, s?: Schedule): Period[] {
  const out: Period[] = [];
  for (let p = periodFor(c, from, s); p.start <= to; p = nextPeriod(c, p, s)) out.push(p);
  return out;
}

export const periodLength = (p: Period): number => diffDays(p.start, p.end) + 1;

/** Days left including today. */
export const daysLeft = (p: Period, today: LocalDate): number => Math.max(1, diffDays(today, p.end) + 1);

/** Days elapsed including today. */
export const daysElapsed = (p: Period, today: LocalDate, from = p.start): number => Math.max(1, diffDays(from, today) + 1);
