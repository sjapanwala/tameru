import { describe, expect, it } from 'vitest';
import { currencyOf, dueSymbols, lastCloseKey, normaliseSymbol, parseHoldingsCsv, portfolio, readPrices } from './holdings';
import type { Holding, Quote } from './types';

describe('symbols', () => {
  it('writes tickers the way Yahoo does', () => {
    expect(normaliseSymbol(' xeqt.to ')).toBe('XEQT.TO');
    expect(normaliseSymbol('XEQT.TO')).toBe('XEQT.TO'); // the form saved before
    expect(normaliseSymbol('ABC.V')).toBe('ABC.V');
    expect(normaliseSymbol('MU.NEO')).toBe('MU.NE');
    expect(normaliseSymbol('aapl')).toBe('AAPL');
    expect(normaliseSymbol('BRK.B')).toBe('BRK-B');
    expect(normaliseSymbol('VFV', 'TSX')).toBe('VFV.TO');
    expect(normaliseSymbol('MU', 'XTSE')).toBe('MU.TO');
    expect(normaliseSymbol('PSI', 'NYSE')).toBe('PSI');
    expect(normaliseSymbol('not a ticker!')).toBe('');
    expect(currencyOf('XEQT.TO')).toBe('CAD');
    expect(currencyOf('VOO')).toBe('USD');
  });
});

describe('the last market close', () => {
  // 2026-11-03 is a Tuesday; Eastern time is UTC−5 then.
  it('is today once it is past 4:20 p.m. Eastern on a weekday', () => {
    expect(lastCloseKey(new Date('2026-11-03T21:30:00Z'))).toBe('2026-11-03'); // 4:30 p.m. ET
    expect(lastCloseKey(new Date('2026-11-03T21:10:00Z'))).toBe('2026-11-02'); // 4:10 p.m. ET
    expect(lastCloseKey(new Date('2026-11-03T15:00:00Z'))).toBe('2026-11-02'); // morning
  });
  it('skips the weekend', () => {
    expect(lastCloseKey(new Date('2026-11-08T18:00:00Z'))).toBe('2026-11-06'); // Sunday → Friday
    expect(lastCloseKey(new Date('2026-11-09T14:00:00Z'))).toBe('2026-11-06'); // Monday morning → Friday
  });
  it('asks only for prices older than that close', () => {
    const h: Holding[] = [
      { symbol: 'A', shares: 1, currency: 'USD' },
      { symbol: 'B', shares: 1, currency: 'USD' },
      { symbol: 'C', shares: 1, currency: 'USD' },
    ];
    const q = (closeKey: string) => ({ symbol: 'x', priceCents: 1, prevCloseCents: 1, tradingDay: closeKey, closeKey });
    expect(dueSymbols(h, { A: q('2026-11-03'), B: q('2026-11-02') }, '2026-11-03', ['C'])).toEqual(['B']);
  });
});

describe('the price service’s reply', () => {
  it('reads prices in cents, the exchange rate, and what was missing', () => {
    const r = readPrices(
      {
        prices: {
          'XEQT.TO': { price: 44.65, prevClose: 44.69, currency: 'CAD', time: 1 },
          'USDCAD=X': { price: 1.3962, prevClose: 1.4007, currency: 'CAD', time: 1 },
          BAD: { price: 0, prevClose: 0 },
        },
        missing: ['NOPE.TO'],
      },
      '2026-11-03',
    );
    expect(r.quotes).toEqual([{ symbol: 'XEQT.TO', priceCents: 4465, prevCloseCents: 4469, tradingDay: '2026-11-03', closeKey: '2026-11-03' }]);
    expect(r.fx).toBe(1.3962);
    expect(r.missing).toEqual(['NOPE.TO']);
    expect(readPrices('nonsense', 'd')).toEqual({ quotes: [], missing: [] });
  });
});

describe('a holdings CSV', () => {
  // The layout of a Wealthsimple holdings report (made-up account and amounts).
  const report = [
    'Account Name,Account Type,Account Classification,Account Number,Symbol,Exchange,MIC,Name,Security Type,Quantity,Position Direction,Market Price,Market Price Currency,Book Value (CAD),Book Value Currency (CAD),Book Value (Market),Book Value Currency (Market),Market Value,Market Value Currency,Market Unrealized Returns,Market Unrealized Returns Currency',
    '"TFSA","TFSA","Trade","ACCT1","XEQT","TSX","XTSE","iShares Core Equity ETF Portfolio","EXCHANGE_TRADED_FUND","10","LONG","44.65","CAD","400","CAD","400","CAD","446.5","CAD","46.5","CAD"',
    '"TFSA","TFSA","Trade","ACCT1","XEQT","TSX","XTSE","iShares Core Equity ETF Portfolio","EXCHANGE_TRADED_FUND","2.5","LONG","44.65","CAD","120","CAD","120","CAD","111.6","CAD","-8.4","CAD"',
    '"TFSA","TFSA","Trade","ACCT1","PSI","NYSE","XNYS","Invesco Dynamic Semiconductors ETF","EXCHANGE_TRADED_FUND","2.042","LONG","117.51","USD","535.4","CAD","370.17462267037568","USD","239.95542","USD","-130.21920267037568","USD"',
    '',
    '"As of 2026-11-03 23:55 GMT-06:00"',
  ].join('\n');

  it('keeps the CAD book value as what was invested, and the file’s prices', () => {
    const r = parseHoldingsCsv(report);
    expect(r.holdings).toEqual([
      { symbol: 'XEQT.TO', shares: 12.5, currency: 'CAD', avgCostCents: 4160, costCadCents: 52000, name: 'iShares Core Equity ETF Portfolio' },
      // US: $535.40 CAD went in; the per-share cost comes from the US-dollar book value.
      { symbol: 'PSI', shares: 2.042, currency: 'USD', avgCostCents: 18128.04, costCadCents: 53540, name: 'Invesco Dynamic Semiconductors ETF' },
    ]);
    expect(r.prices).toEqual([
      { symbol: 'XEQT.TO', priceCents: 4465 },
      { symbol: 'PSI', priceCents: 11751 },
    ]);
    expect(r.asOf?.toISOString()).toBe('2026-11-04T05:55:00.000Z');
    expect(r.skipped).toEqual([]); // the "As of" footer isn't a row left out
  });
  it('reads a simple file with an entry price', () => {
    expect(parseHoldingsCsv('ticker,shares,avg cost\nshop.to,10,95.5\n,,\nfoo bar,1,1\n').holdings).toEqual([{ symbol: 'SHOP.TO', shares: 10, currency: 'CAD', avgCostCents: 9550 }]);
    expect(parseHoldingsCsv('ticker,shares\n!!,1\nAAPL,0\n').skipped).toEqual([
      { line: 2, reason: 'symbol' },
      { line: 3, reason: 'shares' },
    ]);
  });
});

describe('the portfolio', () => {
  it('adds up all-time invested, value, all-time P&L and today, converting US holdings', () => {
    const h: Holding[] = [
      { symbol: 'XEQT.TO', shares: 100, avgCostCents: 3000, currency: 'CAD' },
      { symbol: 'VOO', shares: 2, avgCostCents: 50000, currency: 'USD' },
      { symbol: 'NEW.TO', shares: 5, currency: 'CAD' }, // no cost: counts in value only
    ];
    const quotes: Record<string, Quote> = {
      'XEQT.TO': { symbol: 'XEQT.TO', priceCents: 3500, prevCloseCents: 3450, tradingDay: '2026-11-03', closeKey: '2026-11-03' },
      VOO: { symbol: 'VOO', priceCents: 60000, prevCloseCents: 59000, tradingDay: '2026-11-03', closeKey: '2026-11-03' },
      'NEW.TO': { symbol: 'NEW.TO', priceCents: 1000, prevCloseCents: 1000, tradingDay: '2026-11-03', closeKey: '2026-11-03' },
    };
    const p = portfolio(h, quotes, 1.4);
    expect(p.investedCents).toBe(300000 + 140000);
    expect(p.valueCents).toBe(350000 + 168000 + 5000);
    expect(p.pnlCents).toBe(50000 + 28000);
    expect(p.pnlPct).toBeCloseTo(78000 / 440000);
    expect(p.dayCents).toBe(5000 + 2800);
    expect(p.priced).toBe(3);
    expect(p.missingFx).toBe(false);
    expect(portfolio(h, quotes).missingFx).toBe(true);
  });
  it('counts a CAD book value as is, and values a holding at its entry price until it has a price', () => {
    const h: Holding[] = [
      { symbol: 'PSI', shares: 2, avgCostCents: 18000, costCadCents: 53540, currency: 'USD' },
      { symbol: 'VFV.TO', shares: 2, avgCostCents: 19000, currency: 'CAD' },
    ];
    const quotes: Record<string, Quote> = { PSI: { symbol: 'PSI', priceCents: 12000, prevCloseCents: 12000, tradingDay: '2026-11-03', closeKey: '2026-11-03' } };
    const p = portfolio(h, quotes, 1.4);
    expect(p.investedCents).toBe(53540 + 38000); // not 2 × $180 × 1.4
    expect(p.valueCents).toBe(33600 + 38000);
    expect(p.pnlCents).toBe(33600 - 53540); // the entry-priced one adds nothing yet
    expect(p.holdings[1]).toMatchObject({ entry: true, valueCents: 38000 });
    expect(p.priced).toBe(1);
  });
});
