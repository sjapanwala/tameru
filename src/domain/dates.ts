// Local calendar date arithmetic on 'YYYY-MM-DD' strings.
// Internally uses UTC so daylight-saving changes never shift a day.

import type { LocalDate } from './types';

const RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

export function parts(d: LocalDate): { y: number; m: number; day: number } {
  const match = RE.exec(d);
  if (!match) throw new Error(`Invalid LocalDate: ${d}`);
  return { y: Number(match[1]), m: Number(match[2]), day: Number(match[3]) };
}

export function isLocalDate(s: unknown): s is LocalDate {
  if (typeof s !== 'string' || !RE.test(s)) return false;
  const { y, m, day } = parts(s);
  return m >= 1 && m <= 12 && day >= 1 && day <= daysInMonth(y, m);
}

export function make(y: number, m: number, day: number): LocalDate {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function toEpochDay(d: LocalDate): number {
  const { y, m, day } = parts(d);
  return Math.round(Date.UTC(y, m - 1, day) / DAY_MS);
}

function fromEpochDay(n: number): LocalDate {
  const dt = new Date(n * DAY_MS);
  return make(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(y: number, m: number): number {
  return [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]!;
}

export function addDays(d: LocalDate, n: number): LocalDate {
  return fromEpochDay(toEpochDay(d) + n);
}

/** b − a in days. */
export function diffDays(a: LocalDate, b: LocalDate): number {
  return toEpochDay(b) - toEpochDay(a);
}

/** Same day-of-month n months later, clamped to the month's last day. */
export function addMonths(d: LocalDate, n: number, dayOfMonth?: number): LocalDate {
  const { y, m, day } = parts(d);
  const idx = y * 12 + (m - 1) + n;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return make(ny, nm, Math.min(dayOfMonth ?? day, daysInMonth(ny, nm)));
}

/** Day `day` in the given month, clamped (31 → 30 in April, 28/29 in February). */
export function clampedDay(y: number, m: number, day: number): LocalDate {
  return make(y, m, Math.min(day, daysInMonth(y, m)));
}

/** The next date (today or later) that falls on day-of-month `day`, clamped in short months. */
export function nextMonthlyDate(day: number, today: LocalDate): LocalDate {
  const { y, m } = parts(today);
  const thisMonth = clampedDay(y, m, day);
  return thisMonth >= today ? thisMonth : addMonths(make(y, m, 1), 1, day);
}

export function startOfMonth(d: LocalDate): LocalDate {
  const { y, m } = parts(d);
  return make(y, m, 1);
}

export function endOfMonth(d: LocalDate): LocalDate {
  const { y, m } = parts(d);
  return make(y, m, daysInMonth(y, m));
}

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(d: LocalDate): number {
  return (((toEpochDay(d) + 4) % 7) + 7) % 7; // 1970-01-01 was a Thursday
}

export function compare(a: LocalDate, b: LocalDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export const minDate = (a: LocalDate, b: LocalDate): LocalDate => (a < b ? a : b);
export const maxDate = (a: LocalDate, b: LocalDate): LocalDate => (a > b ? a : b);

/** Inclusive range from..to. */
export function eachDay(from: LocalDate, to: LocalDate): LocalDate[] {
  const out: LocalDate[] = [];
  for (let n = toEpochDay(from), end = toEpochDay(to); n <= end; n++) out.push(fromEpochDay(n));
  return out;
}

export function inRange(d: LocalDate, from: LocalDate, to: LocalDate): boolean {
  return d >= from && d <= to;
}

/** The device's local calendar day for a JS Date. */
export function localDateOf(dt: Date): LocalDate {
  return make(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
}

/** Days in the year containing d. */
export function daysInYear(d: LocalDate): number {
  return isLeapYear(parts(d).y) ? 366 : 365;
}
