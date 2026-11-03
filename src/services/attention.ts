// What Home's bell dot means: something new that needs a look. That's an entry waiting
// to be confirmed, a bill or subscription due tomorrow, or a reminder notice for today.
// Opening Upcoming marks everything on the list as seen; the dot comes back only when
// something new joins it.

import { dueToday } from '../domain/notifications';
import type { AppContext } from './context';
import { scheduleNotices } from './notifications';
import { upcoming } from './recurring';

/** One id per thing that needs attention right now. */
export async function attentionIds(ctx: AppContext): Promise<string[]> {
  const today = ctx.clock.today();
  const [txs, tomorrow, settings] = await Promise.all([ctx.repos.transactions.all(), upcoming(ctx, 1), ctx.repos.settings.get()]);
  const pending = txs.filter((t) => t.status === 'pending').map((t) => `pending:${t.id}`);
  const due = tomorrow.map((u) => `due:${u.item.id}:${u.date}`);
  // Today's reminders, whether or not Home has shown them yet (that doesn't mean seen).
  const notices = settings.notificationsEnabled ? dueToday(await scheduleNotices(ctx), today, new Set()).map((n) => `notice:${n.id}`) : [];
  return [...pending, ...due, ...notices];
}

/** Whether anything on the list hasn't been seen on Upcoming yet. */
export async function hasNewAttention(ctx: AppContext): Promise<boolean> {
  const [ids, settings] = await Promise.all([attentionIds(ctx), ctx.repos.settings.get()]);
  const seen = new Set(settings.attentionSeen ?? []);
  return ids.some((id) => !seen.has(id));
}

/** Opening Upcoming: everything on the list now counts as seen. */
export async function markAttentionSeen(ctx: AppContext): Promise<void> {
  await ctx.repos.settings.update({ attentionSeen: await attentionIds(ctx) });
}
