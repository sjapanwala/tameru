// Tameru's price service: closing prices for the app's experimental investment prices.
//
// Yahoo Finance's quote endpoints can't be called from a web page on another site
// (no CORS), so the app asks here instead, once after each market close. This passes
// up to 20 ticker symbols to Yahoo in one request and returns only what the app needs:
// each symbol's price, previous close and currency. It keeps nothing: no logs of its
// own, no storage, no cookies. Yahoo's endpoint is unofficial and may change.
//
// So that nobody can lean on Yahoo through it (and get it cut off), in this order:
// - Only the app's own pages are answered at all; anything else is turned away (403).
//   (A script can fake that header, so it's only the first fence.)
// - An answer is kept at Cloudflare's edge for a minute: the same tickers asked again
//   in that time never reach Yahoo.
// - Each device (IP address) gets PER_CLIENT requests a minute, and everyone together
//   OVERALL a minute (429 past either). The app makes one to three after each close
//   and three refreshes a day, so neither is ever near for real use.

const YAHOO = 'https://query1.finance.yahoo.com/v7/finance/spark';
export const MAX_SYMBOLS = 20; // Yahoo's limit for one request

/** Pages allowed to ask (the app, and local development). */
const ORIGINS = [/^https:\/\/app\.tameru\.cc$/, /^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/];

/** A ticker as Yahoo writes them: XEQT.TO, BRK-B, USDCAD=X, ^GSPC. */
const SYMBOL = /^[A-Z0-9^][A-Z0-9.\-=^]{0,19}$/;

export interface Price {
  price: number;
  prevClose: number;
  currency: string;
  time: number; // seconds since 1970, of the last trade
  name?: string; // Yahoo's short name for it
}

export interface PricesReply {
  prices: Record<string, Price>;
  missing: string[]; // asked for, but Yahoo had nothing
}

function cors(origin: string | null): Record<string, string> {
  return origin && ORIGINS.some((o) => o.test(origin)) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
}

function json(body: unknown, status: number, origin: string | null, maxAge = 0): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': maxAge ? `public, max-age=${maxAge}` : 'no-store',
      ...cors(origin),
    },
  });
}

/** Pick the fields the app needs out of Yahoo's spark reply. */
export function readSpark(body: unknown, asked: readonly string[]): PricesReply {
  const results = ((body as { spark?: { result?: unknown[] } })?.spark?.result ?? []) as { symbol?: string; response?: { meta?: Record<string, unknown> }[] }[];
  const prices: Record<string, Price> = {};
  for (const r of results) {
    const m = r.response?.[0]?.meta;
    const symbol = String(r.symbol ?? '').toUpperCase();
    const price = Number(m?.regularMarketPrice);
    if (!symbol || !m || !(price > 0)) continue;
    const prev = Number(m.chartPreviousClose ?? m.previousClose);
    const name = String(m.shortName ?? m.longName ?? '').trim().slice(0, 80);
    prices[symbol] = { price, prevClose: prev > 0 ? prev : price, currency: String(m.currency ?? ''), time: Number(m.regularMarketTime) || 0, ...(name ? { name } : {}) };
  }
  return { prices, missing: asked.filter((s) => !prices[s]) };
}

/** Cloudflare's rate limiting binding (wrangler.jsonc → ratelimits). */
export interface Limiter {
  limit(o: { key: string }): Promise<{ success: boolean }>;
}

/** What guards Yahoo: the rate limiters and the edge cache. All optional (tests, local dev). */
export interface Guard {
  perClient?: Limiter;
  overall?: Limiter;
  cache?: Pick<Cache, 'match' | 'put'>;
  waitUntil?: (p: Promise<unknown>) => void;
}

const EDGE_SECONDS = 60; // how long the edge keeps an answer

export async function handle(request: Request, fetchFn: typeof fetch = fetch, guard: Guard = {}): Promise<Response> {
  const origin = request.headers.get('Origin');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors(origin), 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Max-Age': '86400' } });
  if (request.method !== 'GET') return json({ error: 'method' }, 405, origin);
  if (!origin || !ORIGINS.some((o) => o.test(origin))) return json({ error: 'origin' }, 403, null);

  const url = new URL(request.url);
  const asked = [...new Set((url.searchParams.get('symbols') ?? '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean))];
  if (!asked.length || asked.length > MAX_SYMBOLS || !asked.every((s) => SYMBOL.test(s))) return json({ error: 'symbols' }, 400, origin);

  // The same tickers in any order, whatever else is on the URL (the app's refresh adds
  // a stamp to get past the phone's cache, not this one).
  const key = new Request(`${url.origin}/cached?symbols=${[...asked].sort().map(encodeURIComponent).join(',')}`);
  const hit = await guard.cache?.match(key).catch(() => undefined);
  if (hit) return json(await hit.json(), 200, origin, 900);

  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  if (guard.perClient && !(await guard.perClient.limit({ key: ip })).success) return json({ error: 'slow down' }, 429, origin);
  if (guard.overall && !(await guard.overall.limit({ key: 'all' })).success) return json({ error: 'busy' }, 429, origin);

  const upstream = `${YAHOO}?symbols=${asked.map(encodeURIComponent).join(',')}&range=1d&interval=1d`;
  let body: unknown;
  try {
    const r = await fetchFn(upstream, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TameruPrices/1.0)', Accept: 'application/json' } });
    if (!r.ok) return json({ error: 'upstream', status: r.status }, 502, origin);
    body = await r.json();
  } catch {
    return json({ error: 'upstream' }, 502, origin);
  }
  const reply = readSpark(body, asked);
  if (guard.cache) {
    const kept = guard.cache.put(key, json(reply, 200, null, EDGE_SECONDS)).catch(() => {});
    if (guard.waitUntil) guard.waitUntil(kept);
    else await kept;
  }
  // Closing prices barely change for hours: let the phone reuse them too.
  return json(reply, 200, origin, 900);
}

interface Env {
  PER_CLIENT?: Limiter;
  OVERALL?: Limiter;
}

export default {
  fetch: (request: Request, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }) =>
    handle(request, fetch, {
      perClient: env.PER_CLIENT,
      overall: env.OVERALL,
      cache: (caches as unknown as { default: Cache }).default,
      waitUntil: (p) => ctx.waitUntil(p),
    }),
};
