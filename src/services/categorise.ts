// Category/account suggestions for fast entry, and learning from the user's choices.

import { learn, suggestCategory, type SuggestionSource } from '../domain/categorise';
import { addDays } from '../domain/dates';
import { merchantKey } from '../domain/merchant';
import type { Cents, Id, TransactionType } from '../domain/types';
import { stamp, type AppContext } from './context';

export interface Suggestion {
  categoryId?: Id;
  accountId?: Id;
  source: SuggestionSource | 'default';
  /** Accounts to list first in the picker (e.g. the cards a matching bill is assigned to). */
  preferredAccountIds: Id[];
}

export async function suggestFor(
  ctx: AppContext,
  input: { amountCents: Cents; merchant?: string; type: TransactionType },
): Promise<Suggestion> {
  const [accounts, rules, txs, recurring] = await Promise.all([
    ctx.repos.accounts.all(),
    ctx.repos.merchantRules.all(),
    ctx.repos.transactions.all(),
    ctx.repos.recurring.all(),
  ]);
  const usable = accounts.filter((a) => !a.archived && a.type !== 'investing');
  const key = input.merchant ? merchantKey(input.merchant) : undefined;
  const hour = ctx.clock.now().getHours();

  let category: { categoryId?: Id; source: SuggestionSource };
  if (input.type === 'income') {
    const inc = recurring.find((r) => r.kind === 'income' && !r.archived);
    category = { categoryId: inc?.categoryId ?? 'cat_income', source: 'rule' };
  } else category = suggestCategory({ merchantKey: key, amountCents: input.amountCents, hour }, rules, txs);

  // Account: a bill with this merchant → its assigned accounts first; else where this merchant
  // was paid last; else the most-used account in the last 30 days; else the first chequing.
  const bill = key ? recurring.find((r) => !r.archived && r.merchant && merchantKey(r.merchant) === key) : undefined;
  const preferredAccountIds = bill ? bill.accountIds.filter((id) => usable.some((a) => a.id === id)) : [];
  const lastForMerchant = key
    ? [...txs].filter((t) => t.merchantKey === key && !t.originKey).sort((a, b) => b.date.localeCompare(a.date))[0]?.accountId
    : undefined;
  const since = addDays(ctx.clock.today(), -30);
  const counts = new Map<Id, number>();
  for (const t of txs) if (t.date >= since && t.type === 'expense' && !t.originKey) counts.set(t.accountId, (counts.get(t.accountId) ?? 0) + 1);
  const mostUsed = [...counts.entries()].filter(([id]) => usable.some((a) => a.id === id)).sort((a, b) => b[1] - a[1])[0]?.[0];
  const firstChequing = usable.find((a) => a.type === 'chequing')?.id ?? usable[0]?.id;
  const accountId = (bill ? bill.defaultAccountId : undefined) ?? lastForMerchant ?? mostUsed ?? firstChequing;

  return { ...category, accountId, preferredAccountIds };
}

/** The user chose (or corrected to) this category for this merchant. */
export async function learnFromChoice(ctx: AppContext, key: string, categoryId: Id): Promise<void> {
  if (!key) return;
  const cur = await ctx.repos.merchantRules.byKey(key);
  const next = learn(cur, key, categoryId);
  await ctx.repos.merchantRules.put(stamp(ctx, { ...(cur ?? {}), ...next, pendingCategoryId: next.pendingCategoryId }));
}
