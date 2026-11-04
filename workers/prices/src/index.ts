// Tameru's price service: closing prices for the app's experimental investment prices.
//
// Yahoo Finance's quote endpoints can't be called from a web page on another site
// (no CORS), so the app asks here instead, once after each market close. This passes
// up to 20 ticker symbols to Yahoo in one request and returns only what the app needs:
// each symbol's price, previous close and currency. It keeps nothing: no logs of its
// own, no storage, no cookies. Yahoo's endpoint is unofficial and may change.

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

export async function handle(request: Request, fetchFn: typeof fetch = fetch): Promise<Response> {
  const origin = request.headers.get('Origin');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors(origin), 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Max-Age': '86400' } });
  if (request.method !== 'GET') return json({ error: 'method' }, 405, origin);

  const url = new URL(request.url);
  const asked = [...new Set((url.searchParams.get('symbols') ?? '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean))];
  if (!asked.length || asked.length > MAX_SYMBOLS || !asked.every((s) => SYMBOL.test(s))) return json({ error: 'symbols' }, 400, origin);

  const upstream = `${YAHOO}?symbols=${asked.map(encodeURIComponent).join(',')}&range=1d&interval=1d`;
  let body: unknown;
  try {
    const r = await fetchFn(upstream, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TameruPrices/1.0)', Accept: 'application/json' } });
    if (!r.ok) return json({ error: 'upstream', status: r.status }, 502, origin);
    body = await r.json();
  } catch {
    return json({ error: 'upstream' }, 502, origin);
  }
  // Closing prices barely change for hours: let Cloudflare and the phone reuse them.
  return json(readSpark(body, asked), 200, origin, 900);
}

export default { fetch: (request: Request) => handle(request) };
