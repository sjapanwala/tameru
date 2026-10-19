// Suggest recurring items from repeating charges. Never auto-creates.

import { detectRecurring, type DetectedRecurring } from '../domain/detectRecurring';
import { merchantKey } from '../domain/merchant';
import type { AppContext } from './context';
import { createRecurring } from './recurring';

export async function detectedSuggestions(ctx: AppContext): Promise<DetectedRecurring[]> {
  const [txs, items, settings] = await Promise.all([ctx.repos.transactions.all(), ctx.repos.recurring.all(), ctx.repos.settings.get()]);
  const known = new Set<string>(settings.dismissedDetections);
  for (const r of items) {
    if (r.merchant) known.add(merchantKey(r.merchant));
    known.add(merchantKey(r.name));
  }
  return detectRecurring(txs, known);
}

export async function acceptDetection(ctx: AppContext, d: DetectedRecurring) {
  return createRecurring(ctx, {
    name: d.merchant,
    kind: 'subscription',
    amountCents: d.amountCents,
    freq: d.freq,
    nextDate: d.nextDate,
    accountIds: [d.accountId],
    merchant: d.merchant,
    ...(d.categoryId ? { categoryId: d.categoryId } : {}),
  });
}

export async function dismissDetection(ctx: AppContext, key: string): Promise<void> {
  const s = await ctx.repos.settings.get();
  await ctx.repos.settings.update({ dismissedDetections: [...new Set([...s.dismissedDetections, key])] });
}
