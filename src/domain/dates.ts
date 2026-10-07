import type { ISODate } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar date of a Date, as `YYYY-MM-DD`. */
export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayISO(now: Date = new Date()): ISODate {
  return toISODate(now);
}

/** Local midnight of an ISO date. */
export function parseISODate(iso: ISODate): Date {
  const [y = 1970, m = 1, d = 1] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isISODate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && toISODate(parseISODate(value)) === value;
}

export function addDays(iso: ISODate, days: number): ISODate {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** "Today", "Yesterday", or a short date ("Mon, Oct 5"; year added if not this year). */
export function dayLabel(iso: ISODate, today: ISODate, locale?: string): string {
  if (iso === today) return 'Today';
  if (iso === addDays(today, -1)) return 'Yesterday';
  const sameYear = iso.slice(0, 4) === today.slice(0, 4);
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric',
  }).format(parseISODate(iso));
}

/** Whole days from `a` to `b` (positive when `b` is later). DST-safe. */
export function daysBetween(a: ISODate, b: ISODate): number {
  const utc = (iso: ISODate) => {
    const [y = 1970, m = 1, d = 1] = iso.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(b) - utc(a)) / 86_400_000);
}

export function daysInMonth(year: number, month1: number): number {
  return new Date(year, month1, 0).getDate();
}

/** First and last day of the month containing `iso`. */
export function monthRange(iso: ISODate): { start: ISODate; end: ISODate } {
  const [y = 1970, m = 1] = iso.split('-').map(Number);
  const prefix = iso.slice(0, 8);
  return { start: `${prefix}01`, end: `${prefix}${String(daysInMonth(y, m)).padStart(2, '0')}` };
}

/** Days left in the month, counting today. */
export function daysLeftInMonth(today: ISODate): number {
  return daysBetween(today, monthRange(today).end) + 1;
}

/** Short date without weekday ("Oct 5"). */
export function shortDate(iso: ISODate, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(
    parseISODate(iso),
  );
}
