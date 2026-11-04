// A credit card's statement-cycle analysis: the cycle in progress, the payment on the
// last statement, month-by-month statement history, credit use and an outlook.
// Statements come from two places: ones the user entered (from their bank's
// statements, usually from before the card was in Tameru) and ones worked out from
// the ledger for cycles Tameru has tracked. An entered statement wins for its date.
// Pure; all money in integer cents, owing positive.

import { addDays, clampedDay, diffDays, parts } from './dates';
import { accountEffect, balanceAsOf } from './ledger';
import type { Account, CardStatement, Cents, LocalDate, Transaction } from './types';

/** The statement closing date in a given month. */
const closingIn = (y: number, m: number, day: number) => clampedDay(y, m, day);

/** The closing date one month before (or after, n > 0) a closing date. */
export function shiftClosing(close: LocalDate, day: number, n: number): LocalDate {
  const { y, m } = parts(close);
  const idx = y * 12 + (m - 1) + n;
  return closingIn(Math.floor(idx / 12), (idx % 12) + 1, day);
}

/** The last statement to close before today. (A statement closes at the end of its day.) */
export function lastClosing(today: LocalDate, day: number): LocalDate {
  const { y, m } = parts(today);
  const c = closingIn(y, m, day);
  return c < today ? c : shiftClosing(c, day, -1);
}

/** The payment due date for a statement: the first due day after it closes. */
export function dueFor(close: LocalDate, dueDay: number): LocalDate {
  const after = addDays(close, 1);
  const { y, m } = parts(after);
  const c = clampedDay(y, m, dueDay);
  return c >= after ? c : m === 12 ? clampedDay(y + 1, 1, dueDay) : clampedDay(y, m + 1, dueDay);
}

/** Money onto and off a card between two dates (exclusive, inclusive], posted only. */
export function cardFlows(account: Account, txs: readonly Transaction[], after: LocalDate, through: LocalDate) {
  let charges = 0;
  let payments = 0;
  for (const t of txs) {
    if (t.status !== 'posted' || t.date <= after || t.date > through || t.date < account.openingDate) continue;
    if (t.accountId !== account.id && t.toAccountId !== account.id) continue;
    const e = accountEffect(t, account.id);
    if (t.type === 'expense') charges += -e;
    else if (t.type === 'refund') charges -= e; // a refund takes a charge back
    else if (e > 0) payments += e; // a transfer or income onto the card pays it down
    else charges += -e; // money moved off the card (a cash advance)
  }
  return { charges, payments };
}

export interface StatementView {
  closingDate: LocalDate;
  dueDate: LocalDate;
  balanceCents: Cents; // owing on the statement; ≤ 0 means nothing was due
  minimumCents?: Cents;
  minimumEstimated: boolean;
  paidCents?: Cents; // toward this statement, before the next one closed
  chargesCents?: Cents; // new charges in the cycle, when known
  paidInFull?: boolean; // undefined when we don't know what was paid
  source: 'entered' | 'tracked';
}

/** The typical minimum: the greater of $10 or 3% of the balance (most Canadian cards). */
export const typicalMinimum = (balance: Cents): Cents => (balance <= 0 ? 0 : Math.min(balance, Math.max(1000, Math.round(balance * 0.03))));

/** The share of the balance this card asks as a minimum, learned from entered statements. */
function minimumRatio(statements: readonly CardStatement[]): number | undefined {
  const ratios = statements
    .filter((s) => s.balanceCents > 0 && s.minimumCents !== undefined && s.minimumCents > 1000)
    .map((s) => s.minimumCents! / s.balanceCents)
    .sort((a, b) => a - b);
  return ratios.length ? ratios[Math.floor(ratios.length / 2)] : undefined;
}

export function estimateMinimum(balance: Cents, statements: readonly CardStatement[]): Cents {
  if (balance <= 0) return 0;
  const r = minimumRatio(statements);
  return r === undefined ? typicalMinimum(balance) : Math.min(balance, Math.max(1000, Math.round(balance * r)));
}

/** Every statement we know, oldest first, up to `months` back from the last closing. */
export function statementHistory(account: Account, txs: readonly Transaction[], today: LocalDate, months = 12): StatementView[] {
  const card = account.card;
  if (!card) return [];
  const entered = new Map((card.statements ?? []).map((s) => [s.closingDate, s]));
  const out: StatementView[] = [];
  let close = lastClosing(today, card.statementDay);
  for (let i = 0; i < months; i++, close = shiftClosing(close, card.statementDay, -1)) {
    const next = shiftClosing(close, card.statementDay, 1);
    const prev = shiftClosing(close, card.statementDay, -1);
    const e = entered.get(close);
    const tracked = close >= account.openingDate;
    if (!e && !tracked) continue;
    const balance = e ? e.balanceCents : -balanceAsOf(account, txs, close);
    // Payments made after the statement closed and before the next one (or today); only
    // for statements Tameru tracked, since earlier payments never reached the ledger.
    const paidTracked = tracked ? cardFlows(account, txs, close, next < today ? next : today).payments : undefined;
    const paid = e?.paidCents ?? paidTracked;
    // New charges: tracked when the whole cycle is in Tameru.
    const charges = prev >= account.openingDate ? cardFlows(account, txs, prev, close).charges : undefined;
    const minimum = e?.minimumCents;
    out.push({
      closingDate: close,
      dueDate: dueFor(close, card.dueDay),
      balanceCents: balance,
      ...(minimum !== undefined ? { minimumCents: minimum } : balance > 0 ? { minimumCents: estimateMinimum(balance, card.statements ?? []) } : {}),
      minimumEstimated: minimum === undefined,
      ...(paid !== undefined ? { paidCents: paid } : {}),
      ...(charges !== undefined ? { chargesCents: charges } : {}),
      // Paid in full as soon as it is; "part paid" only once the cycle to pay it in is over.
      ...(balance <= 0 || (paid !== undefined && paid >= balance) ? { paidInFull: true } : paid !== undefined && (e?.paidCents !== undefined || next <= today) ? { paidInFull: false } : {}),
      source: e ? 'entered' : 'tracked',
    });
  }
  out.reverse();
  // Where two statements in a row were entered, the later one's new charges follow:
  // what's owing now, less what was still owing after the payment on the one before.
  for (let i = 1; i < out.length; i++) {
    const s = out[i]!;
    const p = out[i - 1]!;
    if (s.chargesCents === undefined && p.paidCents !== undefined) s.chargesCents = Math.max(0, s.balanceCents - (p.balanceCents - p.paidCents));
  }
  return out;
}

export interface CardCycle {
  start: LocalDate; // the day after the last statement closed
  closes: LocalDate;
  dayOf: number; // 1-based day of the cycle today
  days: number;
  daysLeft: number;
  chargesCents: Cents;
  paymentsCents: Cents;
}

export interface CardPayment {
  statement: StatementView;
  dueDate: LocalDate;
  daysToDue: number;
  leftToPayCents: Cents; // of the statement balance, after payments since it closed
  minimumLeftCents: Cents;
  past: boolean; // the due date has gone by
}

export interface CardOutlook {
  projectedChargesCents: Cents; // more charges likely before the cycle closes
  projectedStatementCents: Cents;
  projectedUse?: number; // 0..1+, at the next statement
  interestIfCarriedCents?: Cents; // about a month's interest on the projected statement
  feeCents: Cents; // the monthly fee, charged each cycle
}

export interface CardAnalysis {
  owingCents: Cents;
  limitCents?: Cents;
  use?: number; // 0..1+, now
  availableCents?: Cents;
  cycle: CardCycle;
  payment?: CardPayment;
  history: StatementView[];
  paidInFull: { yes: number; of: number };
  averageChargesCents?: Cents; // per cycle, over the history
  outlook: CardOutlook;
  missing: { limit: boolean; apr: boolean; statements: number }; // statements still worth adding (of 3)
}

/** What a card's analysis needs, worked out once. */
export function analyseCard(account: Account, txs: readonly Transaction[], today: LocalDate): CardAnalysis | undefined {
  const card = account.card;
  if (!card) return undefined;
  const owing = -balanceAsOf(account, txs, today);
  const last = lastClosing(today, card.statementDay);
  const closes = shiftClosing(last, card.statementDay, 1);
  const flows = cardFlows(account, txs, last, today);
  const cycle: CardCycle = {
    start: addDays(last, 1),
    closes,
    days: diffDays(last, closes),
    dayOf: diffDays(last, today),
    daysLeft: diffDays(today, closes),
    chargesCents: flows.charges,
    paymentsCents: flows.payments,
  };

  const history = statementHistory(account, txs, today);
  const latest = history[history.length - 1];
  let payment: CardPayment | undefined;
  if (latest && latest.closingDate === last && latest.balanceCents > 0) {
    const paid = latest.source === 'entered' && latest.paidCents !== undefined ? latest.paidCents : flows.payments;
    const left = Math.max(0, latest.balanceCents - paid);
    payment = {
      statement: latest,
      dueDate: latest.dueDate,
      daysToDue: diffDays(today, latest.dueDate),
      leftToPayCents: Math.min(left, Math.max(0, owing)),
      minimumLeftCents: Math.min(Math.max(0, (latest.minimumCents ?? 0) - paid), Math.max(0, owing)),
      past: today > latest.dueDate,
    };
  }

  const known = history.filter((s) => s.paidInFull !== undefined && s.balanceCents > 0);
  const withCharges = history.filter((s) => s.chargesCents !== undefined);
  const averageChargesCents = withCharges.length ? Math.round(withCharges.reduce((t, s) => t + s.chargesCents!, 0) / withCharges.length) : undefined;

  // The pace for the rest of the cycle: this cycle's own once a week in, else the history's.
  const perDay = cycle.dayOf >= 7 || averageChargesCents === undefined ? cycle.chargesCents / Math.max(1, cycle.dayOf) : averageChargesCents / Math.max(1, cycle.days);
  const projectedCharges = Math.max(0, Math.round(perDay * cycle.daysLeft));
  const projectedStatement = Math.max(0, owing + projectedCharges);
  const limit = card.limitCents && card.limitCents > 0 ? card.limitCents : undefined;

  const statementsKnown = history.length;
  return {
    owingCents: owing,
    ...(limit ? { limitCents: limit, use: Math.max(0, owing) / limit, availableCents: limit - Math.max(0, owing) } : {}),
    cycle,
    ...(payment ? { payment } : {}),
    history,
    paidInFull: { yes: known.filter((s) => s.paidInFull).length, of: known.length },
    ...(averageChargesCents !== undefined ? { averageChargesCents } : {}),
    outlook: {
      projectedChargesCents: projectedCharges,
      projectedStatementCents: projectedStatement,
      ...(limit ? { projectedUse: projectedStatement / limit } : {}),
      ...(card.aprBps ? { interestIfCarriedCents: Math.round((projectedStatement * card.aprBps) / 10000 / 12) } : {}),
      feeCents: card.monthlyFeeCents,
    },
    missing: { limit: !limit, apr: !card.aprBps, statements: Math.max(0, 3 - statementsKnown) },
  };
}

/**
 * The closing dates worth asking about: the most recent `n` before the card was in
 * Tameru (newest first), plus any the user has already entered.
 */
export function statementsToAsk(account: Account, today: LocalDate, n = 3): LocalDate[] {
  const card = account.card;
  if (!card) return [];
  const dates = new Set((card.statements ?? []).map((s) => s.closingDate));
  let close = lastClosing(today, card.statementDay);
  while (close >= account.openingDate) close = shiftClosing(close, card.statementDay, -1);
  for (let i = 0; i < n; i++, close = shiftClosing(close, card.statementDay, -1)) dates.add(close);
  return [...dates].sort().reverse();
}

/** The closing date one month before the oldest of `dates`. */
export const earlierClosing = (dates: readonly LocalDate[], day: number): LocalDate => shiftClosing([...dates].sort()[0]!, day, -1);
