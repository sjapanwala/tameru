// Fresh start: accept the backlog in one go, collapse it into a summary, and
// restart the current period from today's real balances. History is kept.

import { learn } from '../domain/categorise';
import { categoryId } from '../domain/defaults';
import { backlogOf, freshStartAllocations, freshStartOffer, summariseBacklog, type BacklogSummary } from '../domain/freshStart';
import type { LocalDate } from '../domain/types';
import { stamp, type AppContext } from './context';
import { safeToSpendNow } from './home';
import { logEvent, periodContext } from './plan';

export async function currentOffer(ctx: AppContext, lastOpened: LocalDate | undefined) {
  const [settings, txs] = await Promise.all([ctx.repos.settings.get(), ctx.repos.transactions.all()]);
  if (!settings.onboardedAt) return null;
  return freshStartOffer(settings, lastOpened, ctx.clock.today(), backlogOf(txs, ctx.clock.today()).length);
}

export async function doFreshStart(ctx: AppContext, daysAway = 0): Promise<BacklogSummary> {
  const today = ctx.clock.today();
  const backlog = backlogOf(await ctx.repos.transactions.all(), today);
  const summary = summariseBacklog(backlog);

  await ctx.repos.atomic(async () => {
    // Bulk-accept: suggestions become confirmed choices, due pending items are treated as happened.
    for (const t of backlog) {
      await ctx.repos.transactions.put(stamp(ctx, { ...t, needsReview: false, status: 'posted' as const }));
      if (t.needsReview && t.merchantKey && t.categoryId) {
        const rule = await ctx.repos.merchantRules.byKey(t.merchantKey);
        await ctx.repos.merchantRules.put(stamp(ctx, { ...(rule ?? {}), ...learn(rule, t.merchantKey, t.categoryId) }));
      }
    }
  });

  const [{ plan, period }, sts] = await Promise.all([periodContext(ctx), safeToSpendNow(ctx)]);
  const allocations = freshStartAllocations(plan.templateAllocations, categoryId('bills'), sts.breakdown.billsCents, sts.safeCents, period, today);
  await ctx.repos.atomic(async () => {
    const existing = (await ctx.repos.allocations.all()).filter((a) => a.periodStart === period.start);
    for (const [cid, amountCents] of Object.entries(allocations)) {
      const cur = existing.find((a) => a.categoryId === cid);
      await ctx.repos.allocations.put(stamp(ctx, { ...(cur ?? {}), periodStart: period.start, categoryId: cid, amountCents }));
    }
    await ctx.repos.segments.put(stamp(ctx, { periodStart: period.start, segmentStart: today }));
  });
  await logEvent(ctx, 'fresh_start', { daysAway, summary, allocations, periodStart: period.start });
  await ctx.repos.settings.update({ lastOpenedDate: today });
  return summary;
}
