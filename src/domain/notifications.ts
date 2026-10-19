// Notification rules (scheduling only; delivery comes later).
// Only useful, forward-looking notices. Never inactivity or guilt nudges,
// never streaks. Each notice has a stable id so it is sent at most once.

import { addDays } from './dates';
import type { Cents, Id, LocalDate } from './types';

export type NoticeKind = 'low_balance_ahead' | 'bill_soon' | 'card_due_soon' | 'payday' | 'goal_milestone';

export interface Notice {
  id: string;
  kind: NoticeKind;
  fireOn: LocalDate;
  params: Record<string, string | number>;
}

export interface NoticeInput {
  today: LocalDate;
  bills: { recurringId: Id; name: string; date: LocalDate; amountCents: Cents }[];
  paydays: { recurringId: Id; name: string; date: LocalDate; amountCents: Cents }[];
  cards: { accountId: Id; name: string; dueDate: LocalDate; owingCents: Cents }[];
  negatives: { accountId: Id; name: string; date: LocalDate; balanceCents: Cents; coverFromName?: string }[];
  milestones: { goalId: Id; name: string; milestone: number }[];
}

export const BILL_LEAD_DAYS = 2;
export const CARD_LEAD_DAYS = 3;
export const LOW_BALANCE_LOOKAHEAD_DAYS = 7;
export const MAX_PER_DAY = 2;

const PRIORITY: Record<NoticeKind, number> = { low_balance_ahead: 0, card_due_soon: 1, bill_soon: 2, payday: 3, goal_milestone: 4 };

export function buildNotices(i: NoticeInput): Notice[] {
  const out: Notice[] = [];
  for (const b of i.bills) {
    const fireOn = addDays(b.date, -BILL_LEAD_DAYS);
    if (fireOn >= i.today) out.push({ id: `bill:${b.recurringId}:${b.date}`, kind: 'bill_soon', fireOn, params: { name: b.name, amountCents: b.amountCents, days: BILL_LEAD_DAYS } });
  }
  for (const c of i.cards) {
    const fireOn = addDays(c.dueDate, -CARD_LEAD_DAYS);
    if (c.owingCents > 0 && fireOn >= i.today)
      out.push({ id: `card:${c.accountId}:${c.dueDate}`, kind: 'card_due_soon', fireOn, params: { name: c.name, amountCents: c.owingCents, days: CARD_LEAD_DAYS } });
  }
  for (const p of i.paydays) if (p.date >= i.today) out.push({ id: `pay:${p.recurringId}:${p.date}`, kind: 'payday', fireOn: p.date, params: { name: p.name, amountCents: p.amountCents } });
  for (const n of i.negatives) {
    if (n.date > addDays(i.today, LOW_BALANCE_LOOKAHEAD_DAYS)) continue;
    out.push({
      id: `low:${n.accountId}:${n.date}`,
      kind: 'low_balance_ahead',
      fireOn: i.today,
      params: { name: n.name, date: n.date, amountCents: -n.balanceCents, ...(n.coverFromName ? { coverFrom: n.coverFromName } : {}) },
    });
  }
  for (const m of i.milestones) out.push({ id: `goal:${m.goalId}:${m.milestone}`, kind: 'goal_milestone', fireOn: i.today, params: { name: m.name, milestone: m.milestone } });
  return out.sort((a, b) => a.fireOn.localeCompare(b.fireOn) || PRIORITY[a.kind] - PRIORITY[b.kind]);
}

/** Notices to deliver today: not sent before, most useful first, capped per day. */
export function dueToday(notices: readonly Notice[], today: LocalDate, sent: ReadonlySet<string>): Notice[] {
  return notices
    .filter((n) => n.fireOn === today && !sent.has(n.id))
    .sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind])
    .slice(0, MAX_PER_DAY);
}
