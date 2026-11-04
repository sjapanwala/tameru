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
});
