// Investing holdings and their market prices (experimental). Pure: symbols, when the
// market last closed, reading the price service's reply, a holdings CSV, and the sums
// (all-time invested, value, all-time P&L, today's change). Money in cents.

import { parseCsv } from './csv';
import type { Cents, Holding, LocalDate, Quote } from './types';

// ---------- symbols ----------

/** Exchange suffixes → Yahoo's: XEQT.TO (TSX), ABC.V (TSX Venture), MU.NE (Cboe Canada). */
const SUFFIX: Record<string, string> = { TO: 'TO', TSX: 'TO', TRT: 'TO', V: 'V', TSXV: 'V', TRV: 'V', NE: 'NE', NEO: 'NE', CN: 'CN' };
const CANADIAN = new Set(['TO', 'V', 'NE', 'CN']);

/** "xeqt.to" → "XEQT.TO"; "aapl" → "AAPL"; "BRK.B" → "BRK-B" (Yahoo's way). Empty when it can't be a ticker. */
export function normaliseSymbol(input: string, exchange?: string): string {
  let s = input.trim().toUpperCase(); // a space inside means it's a name, not a ticker
  if (!/^[A-Z0-9.\-^]{1,20}$/.test(s)) return '';
  const dot = s.lastIndexOf('.');
  const tail = dot > 0 ? s.slice(dot + 1) : '';
  if (tail && SUFFIX[tail]) s = `${s.slice(0, dot)}.${SUFFIX[tail]}`;
  else if (tail && tail.length === 1 && !exchange) s = `${s.slice(0, dot)}-${tail}`; // a share class: BRK.B
  else if (!tail && exchange) {
    const ex = exchange.trim().toUpperCase().replace(/\s+/g, '');
    const code = ex === 'TSX' || ex === 'XTSE' ? 'TO' : ex === 'TSXV' || ex === 'XTSX' ? 'V' : ex.startsWith('NEO') || ex.startsWith('CBOECANADA') || ex === 'XNEO' ? 'NE' : ex === 'CSE' || ex === 'XCNQ' ? 'CN' : '';
    if (code) s = `${s}.${code}`;
  }
  return s;
}

export const currencyOf = (symbol: string): 'CAD' | 'USD' => (CANADIAN.has(symbol.split('.').pop() ?? '') ? 'CAD' : 'USD');

/** "XEQT.TO" → "XEQT", for display. */
export const displaySymbol = (symbol: string) => symbol.replace(/\.(TO|V|NE|CN)$/, '');

// ---------- when the market last closed ----------

/** Prices settle a little after the 4 p.m. close. */
const SETTLED = 16 * 60 + 20;

function easternParts(at: Date) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, weekday: p.weekday!, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

const prevDay = (d: LocalDate) => new Date(Date.parse(`${d}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
const weekdayOf = (d: LocalDate) => new Date(`${d}T12:00:00Z`).getUTCDay(); // 0 Sunday

/**
 * The New York trading day whose close is the latest one to have happened by `at`:
 * today once it's past 4:20 p.m. Eastern on a weekday, otherwise the weekday before.
 * (Holidays aren't known; a fetch on one just returns the day before's close again.)
 */
export function lastCloseKey(at: Date): LocalDate {
  const e = easternParts(at);
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(e.weekday);
  if (wd >= 1 && wd <= 5 && e.minutes >= SETTLED) return e.date;
  let d = prevDay(e.date);
  while (weekdayOf(d) === 0 || weekdayOf(d) === 6) d = prevDay(d);
  return d;
}

/** Symbols that need a price: never fetched, or fetched before the latest close. */
export function dueSymbols(holdings: readonly Holding[], quotes: Record<string, Quote> | undefined, closeKey: LocalDate, unknown: readonly string[] = []): string[] {
  const syms = [...new Set(holdings.map((h) => h.symbol))].filter((s) => !unknown.includes(s));
  return syms.filter((s) => quotes?.[s]?.closeKey !== closeKey);
}

// ---------- the price service's reply ----------

/** Yahoo's symbol for the US dollar in Canadian dollars. */
export const USDCAD = 'USDCAD=X';

interface ServicePrice {
  price: number;
  prevClose: number;
  currency?: string;
  name?: string;
}

/** The price service's reply → prices in cents, and the symbols it had nothing for. */
export function readPrices(body: unknown, closeKey: LocalDate): { quotes: Quote[]; fx?: number; missing: string[] } {
  const o = (body ?? {}) as { prices?: Record<string, ServicePrice>; missing?: unknown };
  const quotes: Quote[] = [];
  let fx: number | undefined;
  for (const [symbol, p] of Object.entries(o.prices ?? {})) {
    if (!(p?.price > 0)) continue;
    if (symbol === USDCAD) {
      fx = p.price;
      continue;
    }
    const price = Math.round(p.price * 10000) / 100;
    const prev = p.prevClose > 0 ? Math.round(p.prevClose * 10000) / 100 : price;
    const name = typeof p.name === 'string' && p.name.trim() ? p.name.trim().slice(0, 80) : undefined;
    quotes.push({ symbol, priceCents: price, prevCloseCents: prev, tradingDay: closeKey, closeKey, ...(name ? { name } : {}) });
  }
  const missing = Array.isArray(o.missing) ? o.missing.filter((m): m is string => typeof m === 'string' && m !== USDCAD) : [];
  return { quotes, ...(fx ? { fx } : {}), missing };
}

// ---------- the sums ----------

export interface HoldingView {
  holding: Holding;
  quote?: Quote;
  valueCents?: Cents; // in CAD
  investedCents?: Cents; // shares × average cost, in CAD
  pnlCents?: Cents; // all time
  pnlPct?: number;
  dayCents?: Cents; // today's change
  entry?: boolean; // valued at the entry price: no market price yet
}

export interface Portfolio {
  holdings: HoldingView[];
  valueCents: Cents;
  investedCents: Cents; // all time, for holdings with a cost
  pnlCents: Cents; // all time, value − invested, for holdings with both
  pnlPct?: number;
  dayCents: Cents;
  priced: number; // holdings with a price
  hasDay: boolean; // some price came with a real previous close (fetched, not from a file)
  asOf?: LocalDate; // the latest trading day among the prices
  missingFx: boolean; // US holdings, but no USD→CAD rate yet
}

export function portfolio(holdings: readonly Holding[], quotes: Record<string, Quote> = {}, usdCad?: number): Portfolio {
  let value = 0;
  let invested = 0;
  let pnlBase = 0;
  let pnlValue = 0;
  let day = 0;
  let priced = 0;
  let asOf: LocalDate | undefined;
  let missingFx = false;
  let hasDay = false;
  const views = holdings.map((h): HoldingView => {
    const fx = h.currency === 'USD' ? usdCad : 1;
    if (h.currency === 'USD' && !usdCad) missingFx = true;
    const rate = fx ?? 1;
    const real = quotes[h.symbol];
    // A broker's CAD book value is exactly what went in; an entry price is converted.
    const cost = h.costCadCents ?? (h.avgCostCents !== undefined ? Math.round(h.shares * h.avgCostCents * rate) : undefined);
    if (cost !== undefined) invested += cost;
    // No price yet: value it at the entry price until the first close brings a real one.
    const q: Quote | undefined = real ?? (h.avgCostCents !== undefined ? { symbol: h.symbol, priceCents: h.avgCostCents, prevCloseCents: h.avgCostCents, tradingDay: '', closeKey: '' } : undefined);
    if (!q) return { holding: h, ...(cost !== undefined ? { investedCents: cost } : {}) };
    if (real && !real.from) hasDay = true;
    if (real?.from === 'entry') {
      // the entry price standing in: valued, but not a market price
    } else if (real) {
      priced++;
      if (!asOf || real.tradingDay > asOf) asOf = real.tradingDay;
    }
    const v = Math.round(h.shares * q.priceCents * rate);
    const d = Math.round(h.shares * (q.priceCents - q.prevCloseCents) * rate);
    value += v;
    day += d;
    const view: HoldingView = { holding: h, valueCents: v, dayCents: d, ...(real && real.from !== 'entry' ? { quote: real } : { entry: true }) };
    if (cost !== undefined) {
      pnlBase += cost;
      pnlValue += v;
      Object.assign(view, { investedCents: cost, pnlCents: v - cost, ...(cost > 0 ? { pnlPct: (v - cost) / cost } : {}) });
    }
    return view;
  });
  return {
    holdings: views,
    valueCents: value,
    investedCents: invested,
    pnlCents: pnlValue - pnlBase,
    ...(pnlBase > 0 ? { pnlPct: (pnlValue - pnlBase) / pnlBase } : {}),
    dayCents: day,
    priced,
    hasDay,
    ...(asOf ? { asOf } : {}),
    missingFx,
  };
}

// ---------- a holdings CSV ----------

const num = (s: string | undefined) => {
  if (!s) return NaN;
  const t = s.replace(/[$,\s]|CAD|USD/gi, '').replace(/^\((.*)\)$/, '-$1');
  return t === '' ? NaN : Number(t);
};

/** A price the file itself gives (a broker's "Market Price"), so it needn't be fetched. */
export interface FilePrice {
  symbol: string;
  priceCents: number;
}

export interface HoldingsImport {
  holdings: Holding[];
  prices: FilePrice[];
  asOf?: Date; // when the file's prices are from (a broker's "As of …" line)
  skipped: { line: number; reason: 'symbol' | 'shares' }[];
}

/** "As of 2026-11-03 23:55 GMT-06:00" → that moment. */
export function parseAsOf(text: string): Date | undefined {
  const m = text.match(/as of\s+(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})(?::\d{2})?\s*(?:GMT|UTC)?\s*([+-]\d{1,2})(?::?(\d{2}))?/i);
  if (!m) return undefined;
  const [, d, h, mi, oh, om] = m;
  const sign = oh!.startsWith('-') ? '-' : '+';
  const off = `${sign}${String(Math.abs(Number(oh))).padStart(2, '0')}:${om ?? '00'}`;
  const at = new Date(`${d}T${h!.padStart(2, '0')}:${mi}:00${off}`);
  return Number.isNaN(at.getTime()) ? undefined : at;
}

/**
 * Read holdings from a broker's export or a simple file. Needs a symbol and a quantity.
 * What it cost: a total in CAD ("Book Value (CAD)") is kept as is; otherwise an average
 * or per-share column, or a total in the holding's own currency divided by the quantity.
 * A market price column, if there is one, comes along too, so the file's prices can be
 * used until the next close. Rows for the same symbol (lots) are combined.
 */
export function parseHoldingsCsv(text: string): HoldingsImport {
  const rows = parseCsv(text);
  const out: HoldingsImport = { holdings: [], prices: [], skipped: [] };
  const asOf = parseAsOf(text);
  if (asOf) out.asOf = asOf;
  if (rows.length < 2) return out;
  const head = rows[0]!.map((h) => h.trim().toLowerCase());
  const find = (...tests: ((h: string) => boolean)[]) => {
    for (const t of tests) {
      const i = head.findIndex(t);
      if (i >= 0) return i;
    }
    return -1;
  };
  const is = (...names: string[]) => (h: string) => names.includes(h);
  const starts = (...names: string[]) => (h: string) => names.some((n) => h.startsWith(n));
  const ix = {
    symbol: find(is('symbol', 'ticker', 'ticker symbol', 'security symbol'), starts('symbol')),
    exchange: find(is('exchange', 'market', 'mic')),
    qty: find(is('quantity', 'shares', 'units', 'qty', 'quantity held'), starts('quantity')),
    avg: find(is('average cost', 'avg cost', 'average price', 'avg price', 'cost per share', 'book cost per share', 'acb per share', 'average cost per share', 'entry price'), starts('average cost', 'avg cost')),
    cad: find(is('book value (cad)', 'book cost (cad)', 'total cost (cad)', 'cost basis (cad)')),
    total: find(is('book value', 'book cost', 'total cost', 'cost basis', 'acb', 'total book cost'), starts('book value (market)')),
    price: find(is('market price', 'price', 'last price', 'current price', 'last')),
    name: find(is('name', 'security name', 'security', 'description', 'security description')),
  };
  const by = new Map<string, Holding>();
  const prices = new Map<string, number>();
  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    if (r.filter((f) => f.trim()).length <= 1) return; // a footer like "As of …"
    const symbol = normaliseSymbol(r[ix.symbol] ?? '', ix.exchange >= 0 ? r[ix.exchange] : undefined);
    if (!symbol) return void out.skipped.push({ line, reason: 'symbol' });
    const shares = num(r[ix.qty]);
    if (!Number.isFinite(shares) || shares <= 0) return void out.skipped.push({ line, reason: 'shares' });
    const cad = num(r[ix.cad]);
    const avg = num(r[ix.avg]);
    const total = num(r[ix.total]);
    const costCad = Number.isFinite(cad) && cad > 0 ? Math.round(cad * 100) : undefined;
    const avgCost = Number.isFinite(avg) && avg > 0 ? avg * 100 : Number.isFinite(total) && total > 0 ? (total * 100) / shares : undefined;
    const name = (r[ix.name] ?? '').trim().slice(0, 80);
    const price = num(r[ix.price]);
    if (Number.isFinite(price) && price > 0) prices.set(symbol, Math.round(price * 10000) / 100);
    const prev = by.get(symbol);
    const both = (prev?.shares ?? 0) + shares;
    const mergedAvg =
      prev?.avgCostCents !== undefined && avgCost !== undefined ? (prev.avgCostCents * prev.shares + avgCost * shares) / both : (prev?.avgCostCents ?? avgCost);
    const mergedCad = prev ? (prev.costCadCents !== undefined && costCad !== undefined ? prev.costCadCents + costCad : undefined) : costCad;
    by.set(symbol, {
      symbol,
      shares: Math.round(both * 1e6) / 1e6,
      currency: currencyOf(symbol),
      ...(mergedAvg !== undefined ? { avgCostCents: Math.round(mergedAvg * 100) / 100 } : {}),
      ...(mergedCad !== undefined ? { costCadCents: mergedCad } : {}),
      ...((prev?.name ?? name) ? { name: prev?.name ?? name } : {}),
    });
  });
  out.holdings = [...by.values()];
  out.prices = [...prices].map(([symbol, priceCents]) => ({ symbol, priceCents }));
  return out;
}
