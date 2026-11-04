// Market prices for investing holdings (experimental, off by default).
//
// Yahoo Finance prices, through Tameru's price service (workers/prices): Yahoo can't be
// called from the app itself. They're closing prices: after each market close (see
// lastCloseKey) the app makes one round of requests, up to 20 symbols in each, with the
// USD→CAD rate riding along in the first. Nothing is fetched on a timer, on import (a
// broker's file brings its own prices) or when a holding is added by hand (it's valued
// at its entry price until the next close). Only ticker symbols leave the device.

import { currencyOf, dueSymbols, lastCloseKey, normaliseSymbol, readPrices, USDCAD, type HoldingsImport } from '../domain/holdings';
import type { Account, Holding, MarketSettings, Quote } from '../domain/types';
import { updateAccount } from './accounts';
import type { AppContext } from './context';

/** Where the price service lives (workers/prices). */
export const PRICES_URL: string = import.meta.env.VITE_PRICES_URL || 'https://prices.tameru.cc';
const BATCH = 20; // the service's (and Yahoo's) most per request

export interface RefreshResult {
  updated: number; // prices saved (the exchange rate counts as one)
  stopped?: 'network' | 'service'; // why it stopped early, if it did
}

type Fetch = (url: string) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

let running: Promise<RefreshResult> | null = null;

/** Investing accounts' holdings, all together. */
async function allHoldings(ctx: AppContext): Promise<Holding[]> {
  return (await ctx.repos.accounts.all()).filter((a) => !a.archived && a.type === 'investing').flatMap((a) => a.holdings ?? []);
}

/** Requests one round makes for these holdings: a request per 20 symbols. */
export const requestsPerClose = (symbols: number) => Math.ceil(symbols / BATCH);

/**
 * Fetch the prices that are due, in as few requests as possible, and save them.
 * Does nothing unless the feature is on. Safe to call on every open.
 */
export function refreshQuotes(ctx: AppContext, fetchFn: Fetch = (u) => fetch(u)): Promise<RefreshResult> {
  running ??= (async () => {
    try {
      return await refresh(ctx, fetchFn);
    } finally {
      running = null;
    }
  })();
  return running;
}

async function refresh(ctx: AppContext, fetchFn: Fetch): Promise<RefreshResult> {
  const m = (await ctx.repos.settings.get()).markets;
  if (!m?.enabled) return { updated: 0 };
  const holdings = await allHoldings(ctx);
  const closeKey = lastCloseKey(ctx.clock.now());
  const due = dueSymbols(holdings, m.quotes, closeKey, m.unknown);
  const needFx = holdings.some((h) => h.currency === 'USD') && m.usdCad?.closeKey !== closeKey;
  if (!due.length && !needFx) return { updated: 0 };

  const symbols = [...due, ...(needFx ? [USDCAD] : [])];
  const fresh: Record<string, Quote> = {};
  const missing: string[] = [];
  let usdCad: MarketSettings['usdCad'];
  let updated = 0;
  let stopped: RefreshResult['stopped'];
  for (let i = 0; i < symbols.length; i += BATCH) {
    const batch = symbols.slice(i, i + BATCH);
    let body: unknown;
    try {
      const r = await fetchFn(`${PRICES_URL}/?symbols=${batch.map(encodeURIComponent).join(',')}`);
      if (!r.ok) {
        stopped = 'service';
        break;
      }
      body = await r.json();
    } catch {
      stopped = 'network';
      break;
    }
    const got = readPrices(body, closeKey);
    for (const q of got.quotes) {
      fresh[q.symbol] = q;
      updated++;
    }
    if (got.fx) {
      usdCad = { rate: got.fx, closeKey };
      updated++;
    }
    missing.push(...got.missing); // not asked again until the holding changes
  }

  // Merge into the settings as they are now, not as they were before the requests:
  // an import or a change made while they were out mustn't be lost (or undo this).
  const cur = (await ctx.repos.settings.get()).markets ?? m;
  const saved: MarketSettings = {
    ...cur,
    quotes: { ...(cur.quotes ?? {}), ...fresh },
    unknown: [...new Set([...(cur.unknown ?? []), ...missing])],
    ...(usdCad ? { usdCad } : {}),
  };
  if (stopped) saved.lastError = stopped;
  else delete saved.lastError;
  await ctx.repos.settings.update({ markets: saved });
  return { updated, ...(stopped ? { stopped } : {}) };
}

/** Everyone's holdings, for counting requests. */
export const allHoldingsOf = allHoldings;

/** Clean a list of holdings: a real symbol, more than zero shares, one per symbol. */
export function cleanHoldings(list: readonly Holding[]): Holding[] {
  const by = new Map<string, Holding>();
  for (const h of list) {
    const symbol = normaliseSymbol(h.symbol);
    if (!symbol || !(h.shares > 0) || !Number.isFinite(h.shares)) continue;
    by.set(symbol, {
      symbol,
      shares: Math.round(h.shares * 1e6) / 1e6,
      currency: h.currency ?? currencyOf(symbol),
      ...(h.avgCostCents !== undefined && h.avgCostCents > 0 && Number.isFinite(h.avgCostCents) ? { avgCostCents: h.avgCostCents } : {}),
      ...(h.costCadCents !== undefined && h.costCadCents > 0 && Number.isFinite(h.costCadCents) ? { costCadCents: Math.round(h.costCadCents) } : {}),
      ...(h.name?.trim() ? { name: h.name.trim().slice(0, 80) } : {}),
    });
  }
  return [...by.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
}

/**
 * Replace an investing account's holdings. A changed symbol gets another chance at a
 * price. A symbol with no price yet stands at its entry price for the current close,
 * so it's priced after the next one, not the next time the app opens.
 */
export async function saveHoldings(ctx: AppContext, accountId: string, holdings: readonly Holding[]): Promise<Account> {
  const list = cleanHoldings(holdings);
  const s0 = await ctx.repos.settings.get();
  const closeKey = lastCloseKey(ctx.clock.now());
  const standIns = list.filter((h) => h.avgCostCents && !s0.markets?.quotes?.[h.symbol]);
  if (standIns.length) {
    const m = s0.markets ?? { enabled: false };
    const quotes = { ...(m.quotes ?? {}) };
    for (const h of standIns) quotes[h.symbol] = { symbol: h.symbol, priceCents: h.avgCostCents!, prevCloseCents: h.avgCostCents!, tradingDay: closeKey, closeKey, from: 'entry' };
    await ctx.repos.settings.update({ markets: { ...m, quotes } });
  }
  const s = await ctx.repos.settings.get();
  if (s.markets?.unknown?.length) {
    const keep = s.markets.unknown.filter((u) => !list.some((h) => h.symbol === u));
    await ctx.repos.settings.update({ markets: { ...s.markets, unknown: keep } });
  }
  return updateAccount(ctx, accountId, { holdings: list });
}

/** Turn the feature on or off. */
export async function setMarkets(ctx: AppContext, patch: Pick<MarketSettings, 'enabled'>): Promise<void> {
  const cur = (await ctx.repos.settings.get()).markets ?? { enabled: false };
  await ctx.repos.settings.update({ markets: { ...cur, ...patch } });
}

/**
 * Bring in a broker's holdings file for an investing account. Holdings in the file
 * replace the same symbols; others stay. The file's own market prices are kept as
 * prices for the close they're from, so nothing is fetched until the next one.
 */
export async function importHoldings(ctx: AppContext, accountId: string, file: HoldingsImport): Promise<number> {
  const account = await ctx.repos.accounts.get(accountId);
  if (!account) throw new Error('account not found');
  const kept = (account.holdings ?? []).filter((h) => !file.holdings.some((x) => x.symbol === h.symbol));
  await saveHoldings(ctx, accountId, [...kept, ...file.holdings]);
  if (file.prices.length) {
    const closeKey = lastCloseKey(file.asOf ?? ctx.clock.now());
    const m = (await ctx.repos.settings.get()).markets ?? { enabled: false };
    const quotes = { ...(m.quotes ?? {}) };
    for (const p of file.prices) {
      const cur = quotes[p.symbol];
      // A fetched price for the same or a later close beats the file's.
      if (cur && cur.closeKey >= closeKey && cur.from !== 'entry') continue;
      quotes[p.symbol] = { symbol: p.symbol, priceCents: p.priceCents, prevCloseCents: p.priceCents, tradingDay: closeKey, closeKey, from: 'file' };
    }
    await ctx.repos.settings.update({ markets: { ...m, quotes } });
  }
  return file.holdings.length;
}
