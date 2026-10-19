// What happens when the app opens: quiet bookkeeping, then status first.
// Returning after a gap never leads with a chore list; a fresh start is offered instead.

import type { FreshStartOffer } from '../domain/freshStart';
import { periodsBetween } from '../domain/period';
import type { AppContext } from './context';
import { runAutomations } from './automation';
import { currentOffer } from './freshStart';
import { budgetsFor, logEvent, periodContext } from './plan';
import { stamp } from './context';

export interface OpenResult {
  recurringPosted: number;
  interestPosted: number;
  periodsClosed: number;
  freshStart: FreshStartOffer | null;
}

export async function onAppOpen(ctx: AppContext): Promise<OpenResult> {
  const settings = await ctx.repos.settings.get();
  const { recurring, interest } = await runAutomations(ctx);
  const periodsClosed = settings.onboardedAt ? await closePastPeriods(ctx) : 0;
  const freshStart = await currentOffer(ctx, settings.lastOpenedDate);
  await ctx.repos.settings.update({ lastOpenedDate: ctx.clock.today() });
  return { recurringPosted: recurring, interestPosted: interest, periodsClosed, freshStart };
}

/** Snapshot each finished period once, so trends survive later plan edits. */
export async function closePastPeriods(ctx: AppContext): Promise<number> {
  const { plan, schedule, period } = await periodContext(ctx);
  const done = new Set((await ctx.repos.snapshots.all()).map((s) => s.periodStart));
  const past = periodsBetween(plan.period, plan.startDate, period.start, schedule).filter((p) => p.start < period.start && !done.has(p.start));
  for (const p of past) {
    const { rows } = await budgetsFor(ctx, p.start);
    const perCategory = Object.fromEntries(
      rows.map((r) => [r.category.id, { allocatedCents: r.budget.availableCents, spentCents: r.budget.spentCents, remainingCents: r.budget.remainingCents }]),
    );
    await ctx.repos.snapshots.put(stamp(ctx, { periodStart: p.start, periodEnd: p.end, perCategory }));
    await logEvent(ctx, 'period_closed', { periodStart: p.start, periodEnd: p.end });
  }
  return past.length;
}
