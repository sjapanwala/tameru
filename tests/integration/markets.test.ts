import { describe, expect, it } from 'vitest';
import { testApp } from '../helpers';
import { createAccount } from '../../src/services/accounts';
import { importHoldings, PRICES_URL, refreshQuotes, saveHoldings, setMarkets } from '../../src/services/markets';
import { parseHoldingsCsv } from '../../src/domain/holdings';
import type { App } from '../../src/services/app';

/** A fake price service: counts requests, answers from a table. */
function fakeService(prices: Record<string, number>, status = 200) {
  const calls: string[][] = [];
  const fetchFn = async (url: string) => {
    expect(url.startsWith(PRICES_URL)).toBe(true);
    const asked = decodeURIComponent(new URL(url).searchParams.get('symbols')!).split(',');
    calls.push(asked);
    const found = Object.fromEntries(asked.filter((s) => prices[s]).map((s) => [s, { price: prices[s], prevClose: prices[s]! - 1, currency: 'CAD', time: 0 }]));
    return { ok: status === 200, json: async () => ({ prices: found, missing: asked.filter((s) => !prices[s]) }) };
  };
  return { calls, fetchFn };
}

async function setup(at: string, holdings = [
  { symbol: 'xeqt.to', shares: 10, avgCostCents: 3000, currency: 'CAD' as const },
  { symbol: 'VOO', shares: 1, avgCostCents: 50000, currency: 'USD' as const },
  { symbol: 'NOPE', shares: 1, currency: 'USD' as const },
]): Promise<{ app: App; id: string }> {
  const app = await testApp('2026-11-03');
  // Added that morning (their entry prices stand in for the Nov 2 close), checked at `at`.
  app.clock.now = () => new Date('2026-11-03T15:00:00Z');
  const tfsa = await createAccount(app, { name: 'TFSA', type: 'investing' });
  await saveHoldings(app, tfsa.id, holdings);
  await setMarkets(app, { enabled: true });
  app.clock.now = () => new Date(at);
  return { app, id: tfsa.id };
}

const PRICES = { 'XEQT.TO': 35, VOO: 600, 'USDCAD=X': 1.4 };

describe('market prices', () => {
  it('does nothing while the feature is off', async () => {
    const app = await testApp('2026-11-03');
    const svc = fakeService(PRICES);
    expect(await refreshQuotes(app, svc.fetchFn)).toEqual({ updated: 0 });
    expect(svc.calls).toHaveLength(0);
  });

  it('makes one request after each close, with the exchange rate in it', async () => {
    const { app } = await setup('2026-11-03T22:00:00Z'); // 5 p.m. ET, after the close
    const svc = fakeService(PRICES);
    expect(await refreshQuotes(app, svc.fetchFn)).toEqual({ updated: 3 }); // two prices and the rate
    expect(svc.calls).toEqual([['NOPE', 'VOO', 'XEQT.TO', 'USDCAD=X']]);
    const m = (await app.repos.settings.get()).markets!;
    expect(m.quotes!['XEQT.TO']).toMatchObject({ priceCents: 3500, prevCloseCents: 3400, closeKey: '2026-11-03' });
    expect(m.usdCad).toEqual({ rate: 1.4, closeKey: '2026-11-03' });
    expect(m.unknown).toEqual(['NOPE']);

    // Opening again the same evening, or the next morning: nothing.
    expect(await refreshQuotes(app, svc.fetchFn)).toEqual({ updated: 0 });
    app.clock.now = () => new Date('2026-11-04T14:00:00Z');
    expect(await refreshQuotes(app, svc.fetchFn)).toEqual({ updated: 0 });
    // After the next close: one request again; the unknown symbol isn't asked for.
    app.clock.now = () => new Date('2026-11-04T21:45:00Z');
    expect(await refreshQuotes(app, svc.fetchFn)).toEqual({ updated: 3 });
    expect(svc.calls).toHaveLength(2);
    expect(svc.calls[1]).toEqual(['VOO', 'XEQT.TO', 'USDCAD=X']);
  });

  it('prices any number of holdings in rounds of 20, all after the same close', async () => {
    const many = Array.from({ length: 45 }, (_, i) => ({ symbol: `S${String(i).padStart(2, '0')}.TO`, shares: 1, avgCostCents: 100, currency: 'CAD' as const }));
    const { app } = await setup('2026-11-03T22:00:00Z', many);
    const svc = fakeService(Object.fromEntries(many.map((h) => [h.symbol, 2])));
    expect(await refreshQuotes(app, svc.fetchFn)).toEqual({ updated: 45 });
    expect(svc.calls.map((c) => c.length)).toEqual([20, 20, 5]);
  });

  it('says why when the service can’t be reached, and tries again next time', async () => {
    const { app } = await setup('2026-11-03T22:00:00Z');
    expect(await refreshQuotes(app, fakeService(PRICES, 502).fetchFn)).toEqual({ updated: 0, stopped: 'service' });
    expect((await app.repos.settings.get()).markets!.lastError).toBe('service');
    expect(await refreshQuotes(app, fakeService(PRICES).fetchFn)).toEqual({ updated: 3 });
    expect((await app.repos.settings.get()).markets!.lastError).toBeUndefined();
  });

  it('imports a broker file without a request, and prices it after the next close', async () => {
    const app = await testApp('2026-11-03');
    app.clock.now = () => new Date('2026-11-04T06:30:00Z'); // that night
    const tfsa = await createAccount(app, { name: 'TFSA', type: 'investing' });
    await setMarkets(app, { enabled: true });
    const file = parseHoldingsCsv(
      ['Symbol,Exchange,Quantity,Market Price,Book Value (CAD)', 'XEQT,TSX,10,44.65,400', 'VFV,TSX,2,188.07,389.30', '', '"As of 2026-11-03 23:55 GMT-06:00"'].join('\n'),
    );
    expect(await importHoldings(app, tfsa.id, file)).toBe(2);
    const svc = fakeService({ 'XEQT.TO': 45, 'VFV.TO': 190 });
    expect(await refreshQuotes(app, svc.fetchFn)).toEqual({ updated: 0 }); // the file's prices cover the Nov 3 close
    expect(svc.calls).toHaveLength(0);
    expect((await app.repos.settings.get()).markets!.quotes!['XEQT.TO']).toMatchObject({ priceCents: 4465, closeKey: '2026-11-03' });
    app.clock.now = () => new Date('2026-11-04T21:30:00Z'); // after the Nov 4 close
    expect(await refreshQuotes(app, svc.fetchFn)).toEqual({ updated: 2 });
    expect(svc.calls).toEqual([['VFV.TO', 'XEQT.TO']]); // no rate: no US holdings
  });

  it('keeps what an import saves while prices are being fetched, and the other way round', async () => {
    const { app, id } = await setup('2026-11-03T22:00:00Z');
    const svc = fakeService(PRICES);
    // The import lands while the request is out.
    const slow = async (url: string) => {
      await importHoldings(app, id, { holdings: [{ symbol: 'VFV.TO', shares: 2, costCadCents: 38930, currency: 'CAD' }], prices: [{ symbol: 'VFV.TO', priceCents: 18807 }], skipped: [] });
      return svc.fetchFn(url);
    };
    await refreshQuotes(app, slow);
    const m = (await app.repos.settings.get()).markets!;
    expect(m.quotes!['VFV.TO']).toMatchObject({ priceCents: 18807 }); // the import's price survived
    expect(m.usdCad).toEqual({ rate: 1.4, closeKey: '2026-11-03' }); // and so did the rate
    const vfv = (await app.repos.accounts.get(id))!.holdings!.find((h) => h.symbol === 'VFV.TO')!;
    expect(vfv.costCadCents).toBe(38930); // the CAD book value is kept on save
  });

  it('adds a holding by hand without a request, and prices it after the next close (not the next open)', async () => {
    const { app, id } = await setup('2026-11-03T22:00:00Z');
    const svc = fakeService({ ...PRICES, AAPL: 200 });
    await refreshQuotes(app, svc.fetchFn);
    await saveHoldings(app, id, [{ symbol: 'AAPL', shares: 1, avgCostCents: 18000, currency: 'USD' }]);
    expect(await refreshQuotes(app, svc.fetchFn)).toEqual({ updated: 0 }); // opening again: it waits for the close
    expect(svc.calls).toHaveLength(1);
    expect((await app.repos.settings.get()).markets!.quotes!.AAPL).toMatchObject({ priceCents: 18000, from: 'entry' });
    app.clock.now = () => new Date('2026-11-04T21:30:00Z');
    await refreshQuotes(app, svc.fetchFn);
    expect(svc.calls[1]).toContain('AAPL');
    expect((await app.repos.settings.get()).markets!.quotes!.AAPL).toMatchObject({ priceCents: 20000 });
  });
});
