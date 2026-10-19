// Daily balance projection per account, lowest point, negative days, and
// end-of-period estimates. Recurring income/bills come from the engine;
// discretionary spending is a rolling average of recent non-recurring spending.

import { addDays, diffDays, eachDay, maxDate } from './dates';
import { computeInterest } from './interest';
import { balanceAsOf, dailyBalances, spendingLines } from './ledger';
import { recurringOriginKey } from './materialise';
import { daysLeft, type Period } from './period';
import { occurrenceAmount, occurrences } from './recurrence';
import type { Account, Cents, Id, LocalDate, RecurringItem, Transaction } from './types';

export const DISCRETIONARY_WINDOW_DAYS = 56; // 8 weeks
export const DISCRETIONARY_MIN_HISTORY_DAYS = 28; // 4 weeks before we trust history
export const DEFAULT_DAILY_DISCRETIONARY_CENTS = 2000; // $20/day with nothing else to go on

export interface DiscretionaryEstimate {
  dailyCents: number; // fractional on purpose; rounded with carry when applied
  perCategoryDaily: Record<Id, number>;
  accountShares: Record<Id, number>; // where the spending lands, sums to 1
  source: 'history' | 'plan' | 'habits' | 'default';
}

const isDiscretionary = (t: Transaction) => (t.type === 'expense' || t.type === 'refund') && !t.recurringId && !t.originKey && t.status === 'posted';

export interface EstimateInput {
  today: LocalDate;
  transactions: readonly Transaction[];
  /** Flexible (non-bill) allocations per category for a period of `periodDays`. */
  planFlexible?: { perCategory: Record<Id, Cents>; periodDays: number };
  habitsWeekly?: Record<Id, Cents>;
  fallbackAccountId?: Id;
}

export function estimateDiscretionary(i: EstimateInput): DiscretionaryEstimate {
  const end = addDays(i.today, -1);
  const windowStart = addDays(i.today, -DISCRETIONARY_WINDOW_DAYS);
  const recent = i.transactions.filter((t) => isDiscretionary(t) && t.date >= windowStart && t.date <= end);
  const earliest = i.transactions.filter(isDiscretionary).reduce<LocalDate | undefined>((m, t) => (!m || t.date < m ? t.date : m), undefined);
  const span = earliest ? diffDays(maxDate(windowStart, earliest), end) + 1 : 0;
  const shares: Record<Id, number> = {};
  const fallbackShares = i.fallbackAccountId ? { [i.fallbackAccountId]: 1 } : {};

  if (span >= DISCRETIONARY_MIN_HISTORY_DAYS) {
    const perCat: Record<Id, number> = {};
    let total = 0;
    for (const t of recent) {
      for (const l of spendingLines(t)) perCat[l.categoryId] = (perCat[l.categoryId] ?? 0) + l.cents;
      const signed = t.type === 'expense' ? t.amountCents : -t.amountCents;
      shares[t.accountId] = (shares[t.accountId] ?? 0) + signed;
      total += signed;
    }
    for (const k of Object.keys(perCat)) perCat[k] = perCat[k]! / span;
    const positive = Object.values(shares).reduce((a, b) => a + Math.max(0, b), 0);
    for (const k of Object.keys(shares)) shares[k] = positive > 0 ? Math.max(0, shares[k]!) / positive : 0;
    return { dailyCents: Math.max(0, total / span), perCategoryDaily: perCat, accountShares: positive > 0 ? shares : fallbackShares, source: 'history' };
  }
  const fromPerCategory = (perCat: Record<Id, number>, source: DiscretionaryEstimate['source']): DiscretionaryEstimate => ({
    dailyCents: Object.values(perCat).reduce((a, b) => a + b, 0),
    perCategoryDaily: perCat,
    accountShares: fallbackShares,
    source,
  });
  const planTotal = i.planFlexible ? Object.values(i.planFlexible.perCategory).reduce((a, b) => a + b, 0) : 0;
  if (i.planFlexible && planTotal > 0) {
    const days = i.planFlexible.periodDays;
    return fromPerCategory(Object.fromEntries(Object.entries(i.planFlexible.perCategory).map(([k, v]) => [k, v / days])), 'plan');
  }
  if (i.habitsWeekly && Object.values(i.habitsWeekly).some((v) => v > 0))
    return fromPerCategory(Object.fromEntries(Object.entries(i.habitsWeekly).map(([k, v]) => [k, v / 7])), 'habits');
  return { dailyCents: DEFAULT_DAILY_DISCRETIONARY_CENTS, perCategoryDaily: {}, accountShares: fallbackShares, source: 'default' };
}

export interface ForecastInput {
  today: LocalDate;
  horizonDays: number; // 30 / 60 / 90
  accounts: readonly Account[];
  transactions: readonly Transaction[];
  recurring: readonly RecurringItem[];
  estimate: DiscretionaryEstimate;
}

export interface ForecastDay {
  date: LocalDate;
  balances: Record<Id, Cents>;
  spendableCents: Cents; // chequing + cash
}

export interface Forecast {
  days: ForecastDay[];
  lowest: Record<Id, { date: LocalDate; balanceCents: Cents }>;
  lowestSpendable: { date: LocalDate; balanceCents: Cents };
  /** First projected day each non-card account dips below zero. */
  negatives: { accountId: Id; date: LocalDate; balanceCents: Cents; days: number }[];
  interest: { accountId: Id; date: LocalDate; cents: Cents }[];
}

const SPENDABLE = new Set(['chequing', 'cash']);
const isInterestTx = (t: Transaction) => t.originKey?.startsWith('int:') ?? false;

export function forecast(i: ForecastInput): Forecast {
  const accounts = i.accounts.filter((a) => !a.archived);
  const end = addDays(i.today, i.horizonDays);
  const dates = eachDay(i.today, end);
  const deltas = new Map<LocalDate, Map<Id, Cents>>();
  const live = new Set(accounts.map((a) => a.id));
  const bump = (date: LocalDate, acc: Id, c: Cents) => {
    if (!live.has(acc)) return; // removed (archived) accounts aren't projected
    const d = deltas.get(date) ?? new Map<Id, Cents>();
    d.set(acc, (d.get(acc) ?? 0) + c);
    deltas.set(date, d);
  };
  // Balances as of yesterday's close; today's posted transactions are applied as today's deltas.
  const yesterday = addDays(i.today, -1);
  const start = new Map(accounts.map((a) => [a.id, balanceAsOf(a, i.transactions, yesterday)]));
  for (const t of i.transactions) {
    if (t.date !== i.today || t.status !== 'posted') continue;
    if (t.type === 'transfer') {
      bump(i.today, t.accountId, -t.amountCents);
      if (t.toAccountId) bump(i.today, t.toAccountId, t.amountCents);
    } else bump(i.today, t.accountId, t.type === 'expense' ? -t.amountCents : t.amountCents);
  }
  // Pending generated transactions land on their date (or today if already due).
  const keys = new Set(i.transactions.map((t) => t.originKey).filter((k): k is string => !!k));
  for (const t of i.transactions) {
    if (t.status !== 'pending' || t.date > end) continue;
    bump(maxDate(t.date, i.today), t.accountId, t.type === 'expense' ? -t.amountCents : t.amountCents);
  }
  for (const item of i.recurring) {
    if (item.archived || !live.has(item.defaultAccountId)) continue;
    if (item.schedule.freq === 'irregular') {
      if (item.kind === 'income' && item.irregularMonthlyCents) carrySpread(dates, (item.irregularMonthlyCents * 12) / 365, (d, c) => bump(d, item.defaultAccountId, c));
      continue;
    }
    for (const date of occurrences(item, i.today, end)) {
      if (keys.has(recurringOriginKey(item.id, date))) continue;
      const amt = occurrenceAmount(item, 'expected');
      bump(date, item.defaultAccountId, item.kind === 'income' ? amt : -amt);
    }
  }
  for (const [acc, share] of Object.entries(i.estimate.accountShares)) {
    if (share > 0) carrySpread(dates, i.estimate.dailyCents * share, (d, c) => bump(d, acc, -c));
  }

  const running = new Map(start);
  const days: ForecastDay[] = dates.map((date) => {
    for (const [acc, c] of deltas.get(date) ?? []) running.set(acc, (running.get(acc) ?? 0) + c);
    return { date, balances: Object.fromEntries(running), spendableCents: 0 };
  });

  // Savings interest on the projected balances.
  const interest: Forecast['interest'] = [];
  for (const a of accounts) {
    if (a.type !== 'savings' || !a.interest || i.today < a.openingDate) continue;
    const postedInterest = i.transactions.filter((t) => isInterestTx(t) && t.accountId === a.id && t.status === 'posted').reduce((s, t) => s + t.amountCents, 0);
    const history = yesterday >= a.openingDate ? dailyBalances(a, i.transactions.filter((t) => !isInterestTx(t)), a.openingDate, yesterday) : [];
    const stream = [...history, ...days.map((d) => ({ date: d.date, balanceCents: (d.balances[a.id] ?? 0) - postedInterest }))];
    let cum = 0;
    const future = computeInterest(a.interest, stream).postings.filter((p) => p.date >= i.today);
    let k = 0;
    for (const d of days) {
      while (k < future.length && future[k]!.date <= d.date) cum += future[k++]!.cents;
      d.balances[a.id] = (d.balances[a.id] ?? 0) + cum;
    }
    interest.push(...future.map((p) => ({ accountId: a.id, ...p })));
  }

  const spendable = accounts.filter((a) => SPENDABLE.has(a.type));
  for (const d of days) d.spendableCents = spendable.reduce((s, a) => s + (d.balances[a.id] ?? 0), 0);

  const lowest: Forecast['lowest'] = {};
  for (const a of accounts) {
    for (const d of days) {
      const b = d.balances[a.id] ?? 0;
      if (!lowest[a.id] || b < lowest[a.id]!.balanceCents) lowest[a.id] = { date: d.date, balanceCents: b };
    }
  }
  const lowestSpendable = days.reduce((m, d) => (d.spendableCents < m.balanceCents ? { date: d.date, balanceCents: d.spendableCents } : m), {
    date: days[0]!.date,
    balanceCents: days[0]!.spendableCents,
  });
  const negatives: Forecast['negatives'] = [];
  for (const a of accounts) {
    if (a.type === 'credit_card' || a.type === 'investing') continue;
    const neg = days.filter((d) => (d.balances[a.id] ?? 0) < 0);
    if (neg.length) negatives.push({ accountId: a.id, date: neg[0]!.date, balanceCents: neg[0]!.balances[a.id]!, days: neg.length });
  }
  return { days, lowest, lowestSpendable, negatives, interest };
}

/** Apply a fractional daily amount as whole cents, carrying the remainder so totals stay exact. */
function carrySpread(dates: readonly LocalDate[], perDay: number, apply: (d: LocalDate, cents: Cents) => void): void {
  let acc = 0;
  let applied = 0;
  for (const d of dates) {
    acc += perDay;
    const c = Math.round(acc) - applied;
    if (c !== 0) apply(d, c);
    applied += c;
  }
}

export interface PeriodOutlook {
  incomeCents: Cents; // received + still expected this period
  spendCents: Cents; // spent + projected
  onTrackToSaveCents: Cents; // income − spend (can be negative: shown neutrally)
  perCategory: Record<Id, { spentCents: Cents; projectedCents: Cents }>;
}

/** End-of-period estimates: "on track to save $X", "projected to spend $Y in Eating out". */
export function periodOutlook(
  period: Period,
  today: LocalDate,
  txs: readonly Transaction[],
  recurring: readonly RecurringItem[],
  estimate: DiscretionaryEstimate,
): PeriodOutlook {
  const perCategory: PeriodOutlook['perCategory'] = {};
  const add = (cid: Id, spent: Cents, projected: Cents) => {
    const c = perCategory[cid] ?? { spentCents: 0, projectedCents: 0 };
    c.spentCents += spent;
    c.projectedCents += projected;
    perCategory[cid] = c;
  };
  let income = 0;
  const keys = new Set(txs.map((t) => t.originKey).filter((k): k is string => !!k));
  for (const t of txs) {
    if (t.status === 'skipped' || t.date < period.start || t.date > period.end) continue;
    if (t.type === 'income') income += t.amountCents;
    for (const l of spendingLines(t)) add(l.categoryId, l.cents, l.cents);
  }
  // Discretionary for the rest of the period (from tomorrow; today's entries are likely in).
  const rest = daysLeft(period, today) - 1;
  for (const [cid, perDay] of Object.entries(estimate.perCategoryDaily)) add(cid, 0, Math.round(perDay * rest));
  for (const item of recurring) {
    if (item.archived) continue;
    for (const date of occurrences(item, today, period.end)) {
      if (keys.has(recurringOriginKey(item.id, date))) continue;
      const amt = occurrenceAmount(item, 'expected');
      if (item.kind === 'income') income += amt;
      else add(item.categoryId, 0, amt);
    }
  }
  const spend = Object.values(perCategory).reduce((s, c) => s + c.projectedCents, 0);
  return { incomeCents: income, spendCents: spend, onTrackToSaveCents: income - spend, perCategory };
}
