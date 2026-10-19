// Per-account figures for the Accounts panel: balance trend, money in/out this
// month, card dates and credit use. Pure; all money in integer cents.

import { addDays, clampedDay, diffDays, maxDate, parts, startOfMonth } from './dates';
import { isPostingDay } from './interest';
import { accountEffect, balanceAsOf, dailyBalances } from './ledger';
import type { Account, Cents, LocalDate, Transaction } from './types';

/** The next date (today included) that falls on `day` of the month, clamped to short months. */
export function nextDayOfMonth(today: LocalDate, day: number): LocalDate {
  const { y, m } = parts(today);
  const thisMonth = clampedDay(y, m, day);
  if (thisMonth >= today) return thisMonth;
  return m === 12 ? clampedDay(y + 1, 1, day) : clampedDay(y, m + 1, day);
}

/** End-of-day balances for the last `days` days (from the opening date at the earliest). */
export function balanceTrend(account: Account, txs: readonly Transaction[], today: LocalDate, days = 30) {
  const from = maxDate(addDays(today, -(days - 1)), account.openingDate);
  const series = from > today ? [] : dailyBalances(account, txs, from, today);
  const first = series[0]?.balanceCents ?? 0;
  const last = series[series.length - 1]?.balanceCents ?? 0;
  return { series, changeCents: last - first, days: series.length };
}

/** Money that came into and left the account (posted) from the 1st of this month to today. */
export function monthFlows(account: Account, txs: readonly Transaction[], today: LocalDate): { inCents: Cents; outCents: Cents } {
  const from = maxDate(startOfMonth(today), account.openingDate);
  let inCents = 0;
  let outCents = 0;
  for (const t of txs) {
    if (t.status !== 'posted' || t.date < from || t.date > today) continue;
    const e = accountEffect(t, account.id);
    if (e > 0) inCents += e;
    else outCents -= e;
  }
  return { inCents, outCents };
}

/** Contributions to an investing account so far this calendar year (transfers in − out). */
export function yearContributions(account: Account, txs: readonly Transaction[], today: LocalDate): Cents {
  const from = `${today.slice(0, 4)}-01-01`;
  return txs
    .filter((t) => t.type === 'transfer' && t.status === 'posted' && t.date >= from && t.date <= today && t.date >= account.openingDate)
    .reduce((s, t) => s + accountEffect(t, account.id), 0);
}

export interface CardDates {
  statement: LocalDate;
  due: LocalDate;
  daysToDue: number;
}

export function cardDates(account: Account, today: LocalDate): CardDates | undefined {
  if (!account.card) return undefined;
  const due = nextDayOfMonth(today, account.card.dueDay);
  return { statement: nextDayOfMonth(today, account.card.statementDay), due, daysToDue: diffDays(today, due) };
}

/** Share of the credit limit in use (0..1), when a limit is known. */
export function creditUsed(account: Account, txs: readonly Transaction[], today: LocalDate): number | undefined {
  const limit = account.card?.limitCents;
  if (!limit || limit <= 0) return undefined;
  const owing = Math.max(0, -balanceAsOf(account, txs, today));
  return Math.min(1, owing / limit);
}

/** The next day savings interest is paid into the account. */
export function nextInterestDate(account: Account, today: LocalDate): LocalDate | undefined {
  if (!account.interest) return undefined;
  for (let d = today, i = 0; i < 400; i++, d = addDays(d, 1)) if (isPostingDay(account.interest.compounding, d)) return d;
  return undefined;
}

/** A smooth SVG path through the points (normalised to w × h); returns line and closed area. */
export function sparkPath(values: readonly number[], w: number, h: number, pad = 2): { line: string; area: string } {
  if (values.length === 0) return { line: '', area: '' };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [values.length === 1 ? w / 2 : (i / (values.length - 1)) * w, pad + (1 - (v - min) / span) * (h - pad * 2)] as const);
  let line = `M${pts[0]![0].toFixed(1)},${pts[0]![1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]!;
    const [x1, y1] = pts[i]!;
    const cx = (x0 + x1) / 2;
    line += ` C${cx.toFixed(1)},${y0.toFixed(1)} ${cx.toFixed(1)},${y1.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
  }
  const area = `${line} L${pts[pts.length - 1]![0].toFixed(1)},${h} L${pts[0]![0].toFixed(1)},${h} Z`;
  return { line, area };
}
