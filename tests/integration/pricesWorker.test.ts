import { describe, expect, it } from 'vitest';
import { handle, readSpark } from '../../workers/prices/src/index';

const spark = {
  spark: {
    result: [
      { symbol: 'XEQT.TO', response: [{ meta: { currency: 'CAD', regularMarketPrice: 44.65, chartPreviousClose: 44.69, regularMarketTime: 1793739572 } }] },
      { symbol: 'USDCAD=X', response: [{ meta: { currency: 'CAD', regularMarketPrice: 1.3962, chartPreviousClose: 1.4007, regularMarketTime: 1793772120 } }] },
    ],
  },
};
const yahoo = (body: unknown, status = 200) => {
  const calls: string[] = [];
  const fn = (async (url: string) => (calls.push(url), new Response(JSON.stringify(body), { status }))) as unknown as typeof fetch;
  return { calls, fn };
};
const get = (q: string, origin = 'https://app.tameru.cc') => new Request(`https://prices.tameru.cc/?${q}`, { headers: { Origin: origin } });

describe('the price service', () => {
  it('asks Yahoo once for all the symbols and returns just the prices', async () => {
    const y = yahoo(spark);
    const r = await handle(get('symbols=xeqt.to,USDCAD=X,NOPE.TO'), y.fn);
    expect(r.status).toBe(200);
    expect(y.calls).toHaveLength(1);
    expect(y.calls[0]).toContain('symbols=XEQT.TO,USDCAD%3DX,NOPE.TO');
    expect(await r.json()).toEqual({
      prices: {
        'XEQT.TO': { price: 44.65, prevClose: 44.69, currency: 'CAD', time: 1793739572 },
        'USDCAD=X': { price: 1.3962, prevClose: 1.4007, currency: 'CAD', time: 1793772120 },
      },
      missing: ['NOPE.TO'],
    });
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe('https://app.tameru.cc');
    expect(r.headers.get('Cache-Control')).toBe('public, max-age=900');
  });
  it('only lets the app (and local development) read it from a browser', async () => {
    expect((await handle(get('symbols=VFV.TO', 'https://example.com'), yahoo(spark).fn)).headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect((await handle(get('symbols=VFV.TO', 'http://localhost:5179'), yahoo(spark).fn)).headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5179');
  });
  it('turns away anything that isn’t a short list of tickers, without asking Yahoo', async () => {
    const y = yahoo(spark);
    const many = Array.from({ length: 21 }, (_, i) => `S${i}`).join(',');
    for (const q of ['', 'symbols=', `symbols=${many}`, 'symbols=<script>', 'symbols=A%20B']) expect((await handle(get(q), y.fn)).status).toBe(400);
    expect((await handle(new Request('https://prices.tameru.cc/?symbols=A', { method: 'POST' }), y.fn)).status).toBe(405);
    expect(y.calls).toHaveLength(0);
  });
  it('says so when Yahoo fails', async () => {
    expect((await handle(get('symbols=VFV.TO'), yahoo({}, 429).fn)).status).toBe(502);
    expect(readSpark({ nonsense: true }, ['A'])).toEqual({ prices: {}, missing: ['A'] });
  });

  describe('guarding Yahoo', () => {
    const limiter = (allowed: number) => {
      const keys: string[] = [];
      return { keys, limit: async ({ key }: { key: string }) => (keys.push(key), { success: keys.filter((k) => k === key).length <= allowed }) };
    };
    const memoryCache = () => {
      const kept = new Map<string, Response>();
      return {
        kept,
        match: async (r: RequestInfo | URL) => kept.get(String((r as Request).url ?? r))?.clone(),
        put: async (r: RequestInfo | URL, res: Response) => void kept.set(String((r as Request).url ?? r), res),
      } as unknown as Pick<Cache, 'match' | 'put'> & { kept: Map<string, Response> };
    };
    const from = (ip: string, q = 'symbols=XEQT.TO') => new Request(`https://prices.tameru.cc/?${q}`, { headers: { Origin: 'https://app.tameru.cc', 'CF-Connecting-IP': ip } });

    it('turns away anything that isn’t the app, before Yahoo', async () => {
      const y = yahoo(spark);
      expect((await handle(new Request('https://prices.tameru.cc/?symbols=XEQT.TO'), y.fn)).status).toBe(403);
      expect((await handle(get('symbols=XEQT.TO', 'https://example.com'), y.fn)).status).toBe(403);
      expect(y.calls).toHaveLength(0);
    });

    it('gives each device its own allowance, and everyone a shared one', async () => {
      const y = yahoo(spark);
      const perClient = limiter(2);
      const overall = limiter(3);
      const guard = { perClient, overall };
      expect((await handle(from('1.1.1.1'), y.fn, guard)).status).toBe(200);
      expect((await handle(from('1.1.1.1'), y.fn, guard)).status).toBe(200);
      const third = await handle(from('1.1.1.1'), y.fn, guard);
      expect(third.status).toBe(429);
      expect(third.headers.get('Access-Control-Allow-Origin')).toBe('https://app.tameru.cc'); // so the app can tell
      expect((await handle(from('2.2.2.2'), y.fn, guard)).status).toBe(200); // another device: fine
      expect((await handle(from('3.3.3.3'), y.fn, guard)).status).toBe(429); // but everyone's used the shared 3
      expect(y.calls).toHaveLength(3);
      expect(overall.keys.every((k) => k === 'all')).toBe(true);
    });

    it('answers the same tickers from the edge for a minute, in any order, whatever else is on the URL', async () => {
      const y = yahoo(spark);
      const cache = memoryCache();
      const perClient = limiter(100);
      const guard = { cache, perClient };
      const first = await handle(from('1.1.1.1', 'symbols=XEQT.TO,USDCAD=X'), y.fn, guard);
      expect(first.status).toBe(200);
      const again = await handle(from('1.1.1.1', 'symbols=usdcad=x,XEQT.TO&now=123'), y.fn, guard);
      expect(await again.json()).toEqual(await first.json());
      expect(again.headers.get('Access-Control-Allow-Origin')).toBe('https://app.tameru.cc');
      expect(y.calls).toHaveLength(1);
      expect(perClient.keys).toHaveLength(1); // a cached answer doesn't count against anyone
      expect([...cache.kept.values()][0]!.headers.get('Cache-Control')).toBe('public, max-age=60');
    });
  });
});
