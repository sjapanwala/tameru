// Savings interest: rate conversion, daily accrual, periodic posting.
//
// The user's rate is an APY unless marked APR. For compounding n times a year,
// interest for a period of D days on the average daily balance B is
//   B × ((1 + APY)^(D/365) − 1)
// so a constant balance earns exactly the APY over a year. Daily compounding
// accrues day by day on (balance + accrued) and posts at month end.
// Posted amounts are rounded to cents with the remainder carried forward.

import { endOfMonth, parts } from './dates';
import type { Cents, Compounding, InterestConfig, LocalDate } from './types';

const PER_YEAR: Record<Compounding, number> = { daily: 365, monthly: 12, quarterly: 4, annually: 1 };

/** Effective annual yield as a fraction (0.0425 = 4.25%). */
export function effectiveAnnualRate(cfg: InterestConfig): number {
  const r = cfg.rateBps / 10_000;
  if (cfg.kind === 'apy') return r;
  const n = PER_YEAR[cfg.compounding];
  return (1 + r / n) ** n - 1;
}

export const dailyRate = (cfg: InterestConfig): number => (1 + effectiveAnnualRate(cfg)) ** (1 / 365) - 1;

/** Whether interest posts at the end of this day. */
export function isPostingDay(compounding: Compounding, d: LocalDate): boolean {
  if (d !== endOfMonth(d)) return false;
  const { m } = parts(d);
  if (compounding === 'quarterly') return m % 3 === 0;
  if (compounding === 'annually') return m === 12;
  return true; // monthly, and daily (accrues daily, posts monthly)
}

export interface InterestResult {
  postings: { date: LocalDate; cents: Cents }[];
  /** Interest accrued in the current, not-yet-posted period (fractional, for display round it). */
  accruedCents: number;
}

/**
 * Compute interest from a daily balance stream that EXCLUDES interest postings.
 * The stream should start at the account's opening date and be contiguous.
 * Negative balances earn nothing.
 */
export function computeInterest(cfg: InterestConfig, days: readonly { date: LocalDate; balanceCents: Cents }[]): InterestResult {
  const apy = effectiveAnnualRate(cfg);
  const rd = dailyRate(cfg);
  const postings: InterestResult['postings'] = [];
  let posted = 0; // cents posted so far; they add to the balance
  let exactCum = 0;
  let periodSum = 0;
  let periodDays = 0;
  let periodAcc = 0;

  const periodExact = () =>
    cfg.compounding === 'daily' ? periodAcc : periodDays === 0 ? 0 : (periodSum / periodDays) * ((1 + apy) ** (periodDays / 365) - 1);

  if (apy <= 0) return { postings, accruedCents: 0 };
  for (const day of days) {
    const bal = Math.max(0, day.balanceCents + posted);
    if (cfg.compounding === 'daily') periodAcc += (bal + periodAcc) * rd;
    else periodSum += bal;
    periodDays++;
    if (isPostingDay(cfg.compounding, day.date)) {
      exactCum += periodExact();
      const cents = Math.round(exactCum) - posted;
      if (cents > 0) {
        postings.push({ date: day.date, cents });
        posted += cents;
      }
      periodSum = 0;
      periodDays = 0;
      periodAcc = 0;
    }
  }
  return { postings, accruedCents: periodExact() };
}

export const interestOriginKey = (accountId: string, date: LocalDate): string => `int:${accountId}:${date}`;
