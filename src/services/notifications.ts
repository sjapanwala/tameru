// Builds the notice schedule from current data. Delivery (push) is a later step;
// for now the app lists today's notices on Home and records them as sent.

import { addDays, clampedDay, parts } from '../domain/dates';
import { goalProgress } from '../domain/goals';
import { balanceAsOf, cardOwing } from '../domain/ledger';
import { buildNotices, dueToday, type Notice } from '../domain/notifications';
import { occurrenceAmount, occurrences } from '../domain/recurrence';
import type { AppContext } from './context';
import { getForecast } from './forecast';

export async function scheduleNotices(ctx: AppContext, days = 14): Promise<Notice[]> {
  const today = ctx.clock.today();
  const to = addDays(today, days);
  const [items, accounts, txs, goals, f] = await Promise.all([
    ctx.repos.recurring.all(),
    ctx.repos.accounts.all(),
    ctx.repos.transactions.all(),
    ctx.repos.goals.all(),
    getForecast(ctx, 30),
  ]);
  const live = items.filter((r) => !r.archived);
  const flows = (kinds: string[]) =>
    live
      .filter((r) => kinds.includes(r.kind) && !r.system)
      .flatMap((r) => occurrences(r, today, to).map((date) => ({ recurringId: r.id, name: r.name, date, amountCents: occurrenceAmount(r) })));
  const cards = accounts
    .filter((a) => a.type === 'credit_card' && !a.archived && a.card)
    .map((a) => {
      const { y, m, day } = parts(today);
      const thisMonth = clampedDay(y, m, a.card!.dueDay);
      const dueDate = day <= Number(thisMonth.slice(8)) ? thisMonth : m === 12 ? clampedDay(y + 1, 1, a.card!.dueDay) : clampedDay(y, m + 1, a.card!.dueDay);
      return { accountId: a.id, name: a.name, dueDate, owingCents: cardOwing(balanceAsOf(a, txs, today)) };
    });
  const savings = accounts.filter((a) => a.type === 'savings' && !a.archived);
  const negatives = f.forecast.negatives.map((n) => {
    const name = accounts.find((a) => a.id === n.accountId)?.name ?? '';
    const cover = savings.find((s) => s.id !== n.accountId && balanceAsOf(s, txs, today) >= -n.balanceCents);
    return { ...n, name, ...(cover ? { coverFromName: cover.name } : {}) };
  });
  const milestones = goals
    .filter((g) => !g.archived)
    .map((g) => ({ goalId: g.id, name: g.name, milestone: goalProgress(g, txs, today).milestone }))
    .filter((m) => m.milestone > 0);
  return buildNotices({ today, bills: flows(['bill', 'subscription']), paydays: flows(['income']), cards, negatives, milestones });
}

/** Today's notices, marked as sent so each is shown once. */
export async function takeTodaysNotices(ctx: AppContext): Promise<Notice[]> {
  const settings = await ctx.repos.settings.get();
  if (!settings.notificationsEnabled) return [];
  const due = dueToday(await scheduleNotices(ctx), ctx.clock.today(), new Set(settings.sentNoticeIds));
  if (due.length) await ctx.repos.settings.update({ sentNoticeIds: [...due.map((n) => n.id), ...settings.sentNoticeIds].slice(0, 300) });
  return due;
}
