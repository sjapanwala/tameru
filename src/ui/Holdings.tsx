// An investing account's holdings on Accounts (experimental): what they're worth at the
// last close, all-time invested, all-time P&L and today's change, then each holding.
// Holdings are added one at a time or imported from a broker's CSV.

import { useRef, useState } from 'preact/hooks';
import { fmtDate, money, S } from '../copy/strings';
import { currencyOf, displaySymbol, normaliseSymbol, parseHoldingsCsv, portfolio } from '../domain/holdings';
import type { Account, Cents, Holding, MarketSettings } from '../domain/types';
import { importHoldings, refreshQuotes, saveHoldings } from '../services/markets';
import { Amount, MoneyInput } from './components';
import { useApp } from './hooks';
import { PlusIcon, UploadIcon } from './Icons';
import { Sheet } from './Sheet';
import { toast } from './toast';

const M = S.markets;
const shares = (n: number) => String(Math.round(n * 10000) / 10000);
const pct = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(1)}%`;
const signed = (c: Cents) => (c > 0 ? '+' : undefined);
/** 1234.5 → "1,234.50": the ledger's figures, without the $. */
const n2 = (cents: number) => (cents / 100).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** "ISHARES CORE EQUITY ETF" → "Ishares Core Equity ETF": Yahoo's all-caps names, gentler. Short words in caps (ETF, S&P) stay. */
const softName = (n?: string) => (n && n === n.toUpperCase() ? n.replace(/[A-Z][A-Z'&.]*/g, (w) => (w.length <= 3 ? w : w[0] + w.slice(1).toLowerCase())) : n);
const signedMoney = (c: Cents) => `${c >= 0 ? '+' : '−'}${money(Math.abs(c))}`;

export function HoldingsPanel({ account, markets }: { account: Account; markets?: MarketSettings }) {
  const { app, bump } = useApp();
  const [editing, setEditing] = useState<{ index: number; draft: Holding } | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const holdings = account.holdings ?? [];
  const on = !!markets?.enabled;
  const fx = markets?.usdCad?.rate;
  const p = portfolio(holdings, markets?.quotes, fx);
  const unknown = new Set(markets?.unknown ?? []);
  // Biggest first: by value once priced, else by what went in.
  const sorted = [...p.holdings].sort((a, b) => (b.valueCents ?? b.investedCents ?? 0) - (a.valueCents ?? a.investedCents ?? 0) || a.holding.symbol.localeCompare(b.holding.symbol));

  // Saving never fetches a price: a new holding shows its entry price until the next
  // close, and an imported file brings its own prices.
  const save = async (list: Holding[]) => {
    await saveHoldings(app, account.id, list);
    bump();
  };
  const importFile = async (f: File) => {
    const file = parseHoldingsCsv(await f.text());
    if (!file.holdings.length) return toast(M.importNone);
    const n = await importHoldings(app, account.id, file);
    bump();
    // The file brings prices but not the USD→CAD rate: if that's missing, this fetches
    // just it (one small request); no prices are due, they're the file's.
    if (markets?.enabled) refreshQuotes(app).then((r) => r.updated > 0 && bump());
    toast(M.imported(n, file.skipped.length));
  };

  return (
    <section class="hold">
      <div class="hold__head">
        <h3>
          {M.holdings} <span class="hold__beta">{M.beta}</span>
        </h3>
        {on && p.asOf && <span class="hold__asof">{M.asOf(fmtDate(p.asOf))}</span>}
      </div>

      {!on ? (
        <p class="hold__note">{M.off}</p>
      ) : (
        <>
          {markets?.lastError && <p class="hold__note">{M.errors[markets.lastError]}</p>}
          {holdings.length > 0 && (
            <>
              <div class="hold__value">
                <span class="hold__label">{M.value}</span>
                <b>
                  <Amount c={p.valueCents} />
                </b>
                {p.hasDay && (
                  <span class={`hold__day${p.dayCents > 0 ? ' is-up' : p.dayCents < 0 ? ' is-down' : ''}`}>
                    <Amount c={p.dayCents} sign={signed(p.dayCents)} /> {M.todaySub}
                  </span>
                )}
              </div>
              <div class="tiles hold__tiles">
                <div class="tile">
                  <span class="tile__label">{M.invested}</span>
                  <span class="tile__value">
                    <Amount c={p.investedCents} />
                  </span>
                  <span class="tile__sub">{M.investedSub}</span>
                </div>
                <div class={`tile hold__pnl${p.pnlCents > 0 ? ' is-up' : p.pnlCents < 0 ? ' is-down' : ''}`}>
                  <span class="tile__label">{M.pnl}</span>
                  <span class="tile__value">
                    <Amount c={p.pnlCents} sign={signed(p.pnlCents)} />
                  </span>
                  <span class="tile__sub">{p.pnlPct !== undefined ? M.pnlSub(pct(p.pnlPct)) : M.noCost}</span>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {holdings.length === 0 ? (
        <p class="hold__note">{M.empty}</p>
      ) : (
        // A ledger: ticker and name, price × shares, value and weight, P&L. Biggest first.
        <div class="ledger" role="table" aria-label={M.holdings}>
          <div class="ledger__row ledger__row--head" role="row">
            <span role="columnheader">{M.cols.ticker}</span>
            <span role="columnheader">{M.cols.price}</span>
            <span role="columnheader">{M.cols.value}</span>
            <span role="columnheader">{M.cols.pnl}</span>
          </div>
          {sorted.map((v) => {
            const sym = v.holding.symbol;
            const name = v.holding.name ?? softName(v.quote?.name);
            const up = (v.pnlPct ?? 0) >= 0;
            const note = !on ? undefined : v.entry ? M.entry : !v.quote ? (unknown.has(sym) ? M.noPrice : M.soon) : unknown.has(sym) ? M.fromImport(fmtDate(v.quote.tradingDay)) : undefined;
            return (
              <button type="button" role="row" key={sym} class="ledger__row" aria-label={`${displaySymbol(sym)}${name ? `, ${name}` : ''}`} onClick={() => setEditing({ index: holdings.indexOf(v.holding), draft: v.holding })}>
                <span class="ledger__ticker" role="cell">
                  <b>{displaySymbol(sym)}</b>
                  <small>{name ?? (v.holding.currency === 'USD' ? M.us : M.ca)}</small>
                </span>
                <span class="ledger__num" role="cell">
                  <span>
                    {on && (v.quote || v.entry) ? n2((v.quote?.priceCents ?? v.holding.avgCostCents)!) : '—'}
                    {v.holding.currency === 'USD' && <sup>US</sup>}
                  </span>
                  <small>{note ?? `× ${shares(v.holding.shares)}`}</small>
                </span>
                <span class="ledger__num" role="cell">
                  <span>{on && v.valueCents !== undefined ? n2(v.valueCents) : '—'}</span>
                  <small class="ledger__weight">{on && v.valueCents !== undefined && p.valueCents > 0 ? `${Math.round((v.valueCents / p.valueCents) * 100)}%` : ''}</small>
                  {/* narrow screens: the price column folds in here */}
                  <small class="ledger__fold">{on && (v.quote || v.entry) ? `${n2((v.quote?.priceCents ?? v.holding.avgCostCents)!)} × ${shares(v.holding.shares)}` : `× ${shares(v.holding.shares)}`}</small>
                </span>
                <span class={`ledger__num ledger__pnl${v.pnlPct === undefined ? '' : up ? ' is-up' : ' is-down'}`} role="cell">
                  <span>{on && v.pnlPct !== undefined ? pct(v.pnlPct) : '—'}</span>
                  <small>{on && v.pnlCents !== undefined ? signedMoney(v.pnlCents) : ''}</small>
                </span>
              </button>
            );
          })}
          {on && p.valueCents > 0 && (
            <div class="ledger__row ledger__row--total" role="row">
              <span role="cell">{M.cols.total}</span>
              <span role="cell" />
              <span class="ledger__num" role="cell">
                <span>{n2(p.valueCents)}</span>
              </span>
              <span class={`ledger__num ledger__pnl${p.pnlPct === undefined ? '' : p.pnlCents >= 0 ? ' is-up' : ' is-down'}`} role="cell">
                <span>{p.pnlPct !== undefined ? pct(p.pnlPct) : '—'}</span>
              </span>
            </div>
          )}
        </div>
      )}

      {on && holdings.some((h) => h.currency === 'USD') && <p class="hold__fine">{p.missingFx ? M.fxPending : M.fx}</p>}

      <div class="hold__actions">
        <button type="button" onClick={() => setEditing({ index: -1, draft: { symbol: '', shares: 0, currency: 'CAD' } })}>
          <PlusIcon /> {M.add}
        </button>
        <button type="button" onClick={() => file.current?.click()}>
          <UploadIcon /> {M.import}
        </button>
        <input
          ref={file}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={(e) => {
            const f = (e.target as HTMLInputElement).files?.[0];
            (e.target as HTMLInputElement).value = '';
            if (f) void importFile(f);
          }}
        />
      </div>

      {editing && (
        <HoldingSheet
          initial={editing.draft}
          isNew={editing.index < 0}
          onClose={() => setEditing(null)}
          onSave={(h) => {
            const rest = holdings.filter((_, j) => j !== editing.index).filter((x) => x.symbol !== h.symbol);
            setEditing(null);
            void save([...rest, h]);
          }}
          onRemove={editing.index >= 0 ? () => (setEditing(null), void save(holdings.filter((_, j) => j !== editing.index))) : undefined}
        />
      )}
    </section>
  );
}

function HoldingSheet(props: { initial: Holding; isNew: boolean; onClose: () => void; onSave: (h: Holding) => void; onRemove?: () => void }) {
  const [symbol, setSymbol] = useState(props.initial.symbol);
  const [qty, setQty] = useState(props.initial.shares ? shares(props.initial.shares) : '');
  const [cost, setCost] = useState<Cents | undefined>(props.initial.avgCostCents !== undefined ? Math.round(props.initial.avgCostCents) : undefined);
  const sym = normaliseSymbol(symbol);
  const n = Number(qty);
  const ok = !!sym && Number.isFinite(n) && n > 0;
  return (
    <Sheet label={props.isNew ? M.add : M.edit} onClose={props.onClose}>
      <form
        class="hold-sheet"
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) props.onSave({ symbol: sym, shares: n, currency: currencyOf(sym), ...(cost ? { avgCostCents: cost } : {}) });
        }}
      >
        <h2>{props.isNew ? M.add : M.edit}</h2>
        <label>
          {M.symbol}
          <input value={symbol} autoCapitalize="characters" autoComplete="off" spellcheck={false} placeholder="XEQT.TO" onInput={(e) => setSymbol((e.target as HTMLInputElement).value)} />
          <small class="muted">{sym ? M.inCurrency(currencyOf(sym)) : M.symbolHint}</small>
        </label>
        <label>
          {M.sharesLabel}
          <input inputMode="decimal" value={qty} placeholder="0" onInput={(e) => setQty((e.target as HTMLInputElement).value)} />
        </label>
        <MoneyInput label={sym ? `${M.avgCost} · ${currencyOf(sym)}` : M.avgCost} value={cost} onChange={setCost} />
        <p class="muted hold-sheet__hint">{M.avgCostHint}</p>
        <div class="sheet__actions">
          <button type="submit" class="primary block" disabled={!ok}>
            {M.save}
          </button>
          {props.onRemove && (
            <button type="button" class="link" onClick={props.onRemove}>
              {M.remove}
            </button>
          )}
        </div>
      </form>
    </Sheet>
  );
}
