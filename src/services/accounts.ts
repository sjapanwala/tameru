// Account orchestration: create/update/archive and the account list with derived figures.

import { balanceTrend, cardDates, creditUsed, monthFlows, nextInterestDate, yearContributions, type CardDates } from '../domain/accountInsights';
import { moveInList, reorderSubset, sortAccounts } from '../domain/accountOrder';
import { addDays } from '../domain/dates';
import { recurringOriginKey } from '../domain/materialise';
import { occurrenceAmount, occurrences } from '../domain/recurrence';
import { cleanLast4, isHexColor } from '../domain/cardCatalog';
import { balanceAsOf, cardOwing, netContributed } from '../domain/ledger';
import type { Account, AccountType, CardConfig, CardFace, Cents, InterestConfig, LocalDate } from '../domain/types';
import { stamp, type AppContext } from './context';
import { syncCardFee } from './recurring';
import { accruedInterest } from './automation';

export interface NewAccount {
  name: string;
  type: AccountType;
  openingBalanceCents?: Cents;
  openingDate?: LocalDate;
  currency?: string;
  interest?: InterestConfig;
  card?: CardConfig;
  face?: CardFace;
}

/** Keep only well-formed face fields: ids, a short name, a #rrggbb colour, and a clean last four. */
const faceFields = (f?: CardFace): { face?: CardFace } => {
  if (!f) return {};
  const last4 = f.last4 ? cleanLast4(f.last4) : undefined;
  const face: CardFace = {
    ...(f.artId ? { artId: f.artId } : {}),
    ...(f.institutionId ? { institutionId: f.institutionId } : {}),
    ...(f.cardName?.trim() ? { cardName: f.cardName.trim().slice(0, 40) } : {}),
    ...(isHexColor(f.color) ? { color: f.color.toLowerCase() } : {}),
    ...(last4 ? { last4 } : {}),
    ...(typeof f.hidePrinted === 'boolean' ? { hidePrinted: f.hidePrinted } : {}),
  };
  return Object.keys(face).length ? { face } : {};
};

export async function createAccount(ctx: AppContext, input: NewAccount): Promise<Account> {
  const settings = await ctx.repos.settings.get();
  const account: Account = stamp(ctx, {
    name: input.name.trim() || input.type,
    type: input.type,
    currency: input.currency ?? settings.defaultCurrency,
    openingBalanceCents: input.openingBalanceCents ?? 0,
    openingDate: input.openingDate ?? ctx.clock.today(),
    archived: false,
    ...faceFields(input.face),
    ...(input.type === 'savings' ? { interest: input.interest ?? { rateBps: 0, kind: 'apy', compounding: 'monthly' } } : {}),
    ...(input.type === 'credit_card' ? { card: input.card ?? { monthlyFeeCents: 0, statementDay: 1, dueDay: 22 } } : {}),
  });
  await ctx.repos.accounts.put(account);
  await syncCardFee(ctx, account);
  return account;
}

export async function updateAccount(ctx: AppContext, id: string, patch: Partial<Omit<Account, 'id'>>): Promise<Account> {
  const cur = await ctx.repos.accounts.get(id);
  if (!cur) throw new Error('account not found');
  const next: Account = stamp(ctx, { ...cur, ...patch, ...('face' in patch ? faceFields(patch.face) : {}), id });
  if ('face' in patch && !next.face) delete next.face;
  await ctx.repos.accounts.put(next);
  await syncCardFee(ctx, next);
  return next;
}

export interface AccountView {
  account: Account;
  balanceCents: Cents;
  owingCents?: Cents; // cards
  netContributedCents?: Cents; // investing
  interestEarnedCents?: Cents; // savings, all posted interest
  interestAccruedCents?: Cents; // savings, accrued this period, posts at period end
  pendingCents: Cents; // sum of pending effects not yet in balance
}

export async function listAccounts(ctx: AppContext, asOf = ctx.clock.today()): Promise<AccountView[]> {
  const [accounts, txs] = await Promise.all([ctx.repos.accounts.all(), ctx.repos.transactions.all()]);
  return sortAccounts(accounts)
    .filter((a) => !a.archived)
    .map((account) => {
      const balanceCents = balanceAsOf(account, txs, asOf);
      const pendingCents = balanceAsOf(account, txs, asOf, { includePending: true }) - balanceCents;
      const v: AccountView = { account, balanceCents, pendingCents };
      if (account.type === 'credit_card') v.owingCents = cardOwing(balanceCents);
      if (account.type === 'investing') v.netContributedCents = netContributed(account, txs, asOf);
      if (account.type === 'savings') v.interestAccruedCents = accruedInterest(account, txs, asOf);
      if (account.type === 'savings')
        v.interestEarnedCents = txs
          .filter((t) => t.accountId === account.id && t.originKey?.startsWith('int:') && t.status === 'posted' && t.date <= asOf)
          .reduce((s, t) => s + t.amountCents, 0);
      return v;
    });
}

export interface RemovedAccount {
  accountId: string;
  quickIds: string[]; // quick adds switched to "ask each time", restored on undo
}

/**
 * Remove an account from use. It's archived, not deleted: past transactions keep
 * their history. Its card fee stops (syncCardFee), recurring items on it stop
 * generating (materialise skips archived accounts), and quick adds that paid
 * from it switch to "ask each time".
 */
export async function removeAccount(ctx: AppContext, id: string): Promise<RemovedAccount> {
  const quick = (await ctx.repos.quickActions.all()).filter((q) => q.accountId === id);
  await ctx.repos.atomic(async () => {
    for (const q of quick) await ctx.repos.quickActions.put(stamp(ctx, { ...q, accountId: 'ask' as const }));
  });
  await updateAccount(ctx, id, { archived: true });
  return { accountId: id, quickIds: quick.map((q) => q.id) };
}

/** Undo removeAccount. */
export async function restoreAccount(ctx: AppContext, removed: RemovedAccount): Promise<void> {
  await updateAccount(ctx, removed.accountId, { archived: false });
  for (const qid of removed.quickIds) {
    const q = await ctx.repos.quickActions.get(qid);
    if (q && q.accountId === 'ask') await ctx.repos.quickActions.put(stamp(ctx, { ...q, accountId: removed.accountId }));
  }
}

/** All accounts (archived included, for name lookups) in the user's order. */
export async function orderedAccounts(ctx: AppContext): Promise<Account[]> {
  return sortAccounts(await ctx.repos.accounts.all());
}

/** Save a new order for some accounts (e.g. the cards in the wallet). */
export async function reorderAccounts(ctx: AppContext, ids: string[]): Promise<void> {
  const all = await ctx.repos.accounts.all();
  const order = reorderSubset(all, ids);
  await ctx.repos.atomic(async () => {
    for (const a of all) {
      const sortOrder = order.get(a.id);
      if (sortOrder !== undefined && sortOrder !== a.sortOrder) await ctx.repos.accounts.put(stamp(ctx, { ...a, sortOrder }));
    }
  });
}

/** Move one account a place earlier (−1) or later (+1) among the visible accounts. */
export async function moveAccount(ctx: AppContext, id: string, delta: number): Promise<void> {
  const visible = sortAccounts((await ctx.repos.accounts.all()).filter((a) => !a.archived)).map((a) => a.id);
  await reorderAccounts(ctx, moveInList(visible, id, delta));
}

export interface AccountInsights {
  trend: ReturnType<typeof balanceTrend>;
  flows: { inCents: Cents; outCents: Cents };
  card?: CardDates;
  creditUsed?: number;
  nextInterest?: LocalDate;
  yearContributedCents?: Cents;
  upcoming: { name: string; date: LocalDate; amountCents: Cents; income: boolean }[];
}

/** Everything the Accounts panel shows for one account. */
export async function accountInsights(ctx: AppContext, accountId: string): Promise<AccountInsights | undefined> {
  const today = ctx.clock.today();
  const [account, txs, items] = await Promise.all([ctx.repos.accounts.get(accountId), ctx.repos.transactions.all(), ctx.repos.recurring.all()]);
  if (!account) return undefined;
  const keys = new Set(txs.map((t) => t.originKey).filter(Boolean));
  const upcoming = items
    .filter((r) => !r.archived && r.defaultAccountId === accountId)
    .flatMap((r) =>
      occurrences(r, addDays(today, 1), addDays(today, 30))
        .filter((date) => !keys.has(recurringOriginKey(r.id, date)))
        .map((date) => ({ name: r.name, date, amountCents: occurrenceAmount(r), income: r.kind === 'income' })),
    )
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 4);
  return {
    trend: balanceTrend(account, txs, today, 30),
    flows: monthFlows(account, txs, today),
    ...(account.card ? { card: cardDates(account, today) } : {}),
    ...(creditUsed(account, txs, today) !== undefined ? { creditUsed: creditUsed(account, txs, today) } : {}),
    ...(account.interest ? { nextInterest: nextInterestDate(account, today) } : {}),
    ...(account.type === 'investing' ? { yearContributedCents: yearContributions(account, txs, today) } : {}),
    upcoming,
  };
}
