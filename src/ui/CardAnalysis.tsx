// A credit card's analysis on Accounts, led by the statement cycle: the cycle so far,
// the payment on the last statement, month-by-month statements, credit used and an
// outlook. Plus the flow that asks for the details behind it (limit, rate, statements),
// run after adding a card and from the "Complete this card" list.

import { useRef, useState } from 'preact/hooks';
import { fmtDate, fmtMonth, S } from '../copy/strings';
import { addDays } from '../domain/dates';
import { dueFor, earlierClosing, statementsToAsk, type CardAnalysis, type StatementView } from '../domain/cardAnalysis';
import type { Account, CardStatement, Cents } from '../domain/types';
import { saveCardDetails } from '../services/accounts';
import { Amount, MoneyInput } from './components';
import { useApp } from './hooks';
import { CheckIcon, ChevronRight } from './Icons';

export type CardStep = 'limit' | 'apr' | 'statements';
const STEPS: CardStep[] = ['limit', 'apr', 'statements'];

export function CardAnalysisPanel({ r, onDetails }: { r: CardAnalysis; onDetails: (step: CardStep) => void }) {
  const todo = r.missing.limit || r.missing.apr || r.missing.statements > 0;
  return (
    <div class="cardx">
      {todo && <Todo r={r} onDetails={onDetails} />}
      <Cycle r={r} />
      <Payment r={r} onDetails={onDetails} />
      <History key={r.history.map((h) => h.closingDate).join()} r={r} onDetails={onDetails} />
      {r.limitCents !== undefined && <CreditUse r={r} />}
      <Outlook r={r} onDetails={onDetails} />
    </div>
  );
}

function Todo({ r, onDetails }: { r: CardAnalysis; onDetails: (step: CardStep) => void }) {
  const rows: { step: CardStep; label: string; sub: string; done: boolean }[] = [
    {
      step: 'limit',
      label: S.cardx.todo.limit,
      sub: S.cardx.todo.limitSub,
      done: !r.missing.limit,
    },
    {
      step: 'apr',
      label: S.cardx.todo.apr,
      sub: S.cardx.todo.aprSub,
      done: !r.missing.apr,
    },
    {
      step: 'statements',
      label: S.cardx.todo.statements,
      sub: S.cardx.todo.statementsSub(r.missing.statements),
      done: r.missing.statements === 0,
    },
  ];
  const done = rows.filter((x) => x.done).length;
  return (
    <section class="cardx-panel cardx-todo">
      <div class="cardx-todo__head">
        <div>
          <h3>{S.cardx.todoTitle}</h3>
          <p>{S.cardx.todoBody}</p>
        </div>
        <span class="cardx-ring" style={{ '--p': String(done / rows.length) }} aria-label={S.cardx.step(done, rows.length)}>
          <span class="num">
            {done}/{rows.length}
          </span>
        </span>
      </div>
      <ul>
        {rows.map((x) => (
          <li key={x.step}>
            <button type="button" class={`cardx-todo__row${x.done ? ' is-done' : ''}`} onClick={() => onDetails(x.step)}>
              <span class="cardx-check" aria-hidden="true">
                {x.done && <CheckIcon />}
              </span>
              <span class="cardx-todo__text">
                <span>{x.label}</span>
                <small>{x.sub}</small>
              </span>
              <ChevronRight />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Cycle({ r }: { r: CardAnalysis }) {
  const c = r.cycle;
  const share = Math.min(1, c.dayOf / Math.max(1, c.days));
  return (
    <section class="cardx-panel">
      <p class="cardx-eyebrow">
        <span>{S.cardx.cycle}</span>
        <span class="num">{S.cardx.cycleRange(fmtDate(c.start), fmtDate(c.closes))}</span>
      </p>
      <p class="cardx-big">
        <Amount c={c.chargesCents} /> <span class="cardx-big__sub">{S.cardx.spent}</span>
      </p>
      <div class="cardx-track" aria-hidden="true">
        <span style={{ width: `${share * 100}%` }} />
        <i style={{ left: `${share * 100}%` }} />
      </div>
      <p class="cardx-meta">
        <span>{S.cardx.dayOf(c.dayOf, c.days)}</span>
        <span>{S.cardx.closesIn(c.daysLeft)}</span>
      </p>
      {(c.paymentsCents > 0 || r.averageChargesCents !== undefined) && (
        <p class="cardx-foot">
          {c.paymentsCents > 0 && <span>{S.cardx.paidThisCycle(c.paymentsCents)}</span>}
          {r.averageChargesCents !== undefined && <span>{S.cardx.usual(r.averageChargesCents)}</span>}
        </p>
      )}
    </section>
  );
}

function Payment({ r, onDetails }: { r: CardAnalysis; onDetails: (step: CardStep) => void }) {
  const p = r.payment;
  const last = r.history[r.history.length - 1];
  if (!p) {
    // The last statement is known and nothing was owing on it, or it isn't known yet.
    const known = !!last && addDays(last.closingDate, 1) === r.cycle.start;
    return (
      <section class="cardx-panel cardx-pay cardx-pay--quiet">
        {known ? (
          <p class="cardx-note">{S.cardx.nothingDue}</p>
        ) : (
          <button type="button" class="cardx-link" onClick={() => onDetails('statements')}>
            <span>{S.cardx.noStatement}</span>
            <ChevronRight />
          </button>
        )}
      </section>
    );
  }
  const st = p.statement;
  if (p.leftToPayCents === 0)
    return (
      <section class="cardx-panel cardx-pay cardx-pay--done">
        <span class="cardx-check cardx-check--on" aria-hidden="true">
          <CheckIcon />
        </span>
        <div>
          <h3>{S.cardx.paidInFull}</h3>
          <p>
            {S.cardx.payTitle(fmtDate(st.closingDate))} · {S.cardx.paidInFullSub}
          </p>
        </div>
      </section>
    );
  const soon = !p.past && p.daysToDue <= 5;
  return (
    <section class={`cardx-panel cardx-pay${soon || p.past ? ' cardx-pay--soon' : ''}`}>
      <p class="cardx-eyebrow">
        <span>{S.cardx.payTitle(fmtDate(st.closingDate))}</span>
        {!p.past && <span>{S.accounts.dueIn(p.daysToDue)}</span>}
      </p>
      <p class="cardx-big">
        <span class="cardx-big__sub">{S.cardx.pay}</span> <Amount c={p.leftToPayCents} /> <span class="cardx-big__sub">{S.cardx.payBy(fmtDate(p.dueDate))}</span>
      </p>
      {p.past && <p class="cardx-note">{S.cardx.datePassed(fmtDate(p.dueDate))}</p>}
      <dl class="cardx-pair">
        <div>
          <dt>{S.cardx.statementBalance}</dt>
          <dd>
            <Amount c={st.balanceCents} />
          </dd>
        </div>
        {p.minimumLeftCents > 0 && (
          <div>
            <dt>{st.minimumEstimated ? S.cardx.minimumAbout : S.cardx.minimum}</dt>
            <dd>
              <Amount c={p.minimumLeftCents} />
            </dd>
          </div>
        )}
      </dl>
    </section>
  );
}

function History({ r, onDetails }: { r: CardAnalysis; onDetails: (step: CardStep) => void }) {
  const shown = r.history.slice(-6);
  const est = {
    closingDate: r.cycle.closes,
    balanceCents: r.outlook.projectedStatementCents,
  };
  const [pick, setPick] = useState<number>(shown.length); // the estimate, at the end
  const max = Math.max(1, ...shown.map((s) => s.balanceCents), est.balanceCents);
  const sel: StatementView | undefined = shown[pick];
  return (
    <section class="cardx-panel">
      <div class="cardx-headrow">
        <h3>{S.cardx.history}</h3>
        <button type="button" class="linkbtn" onClick={() => onDetails('statements')}>
          {shown.length ? S.cardx.edit : S.cardx.add}
        </button>
      </div>
      {shown.length === 0 && <p class="cardx-note">{S.cardx.historyEmpty}</p>}
      {shown.length > 0 && (
        <>
          <p class="cardx-detail">
            {sel ? (
              <>
                <b>{fmtDate(sel.closingDate)}</b> {S.cardx.detail(Math.max(0, sel.balanceCents), sel.paidCents)}
              </>
            ) : (
              <>
                <b>{fmtDate(est.closingDate)}</b> {S.cardx.detailNext(est.balanceCents)}
              </>
            )}
          </p>
          <div class="cardx-bars" role="list">
            {shown.map((s, i) => (
              <button
                type="button"
                role="listitem"
                key={s.closingDate}
                class={`cardx-bar${pick === i ? ' is-on' : ''}`}
                aria-label={`${fmtDate(s.closingDate)}: ${S.cardx.detail(Math.max(0, s.balanceCents), s.paidCents)}`}
                onClick={() => setPick(i)}
              >
                <span class="cardx-bar__col">
                  <span
                    style={{
                      height: `${Math.max(3, (Math.max(0, s.balanceCents) / max) * 100)}%`,
                    }}
                  />
                </span>
                <span class={`cardx-dot${s.paidInFull === true ? ' cardx-dot--full' : s.paidInFull === false ? ' cardx-dot--part' : ''}`} />
                <span class="cardx-bar__label">{fmtMonth(s.closingDate)}</span>
              </button>
            ))}
            <button
              type="button"
              role="listitem"
              class={`cardx-bar cardx-bar--est${pick === shown.length ? ' is-on' : ''}`}
              aria-label={S.cardx.detailNext(est.balanceCents)}
              onClick={() => setPick(shown.length)}
            >
              <span class="cardx-bar__col">
                <span
                  style={{
                    height: `${Math.max(3, (est.balanceCents / max) * 100)}%`,
                  }}
                />
              </span>
              <span class="cardx-dot" />
              <span class="cardx-bar__label">{S.cardx.est}</span>
            </button>
          </div>
        </>
      )}
      {r.paidInFull.of > 0 && (
        <p class="cardx-foot">
          <span>{S.cardx.paidFullCount(r.paidInFull.yes, r.paidInFull.of)}</span>
          <span class="cardx-legend">
            <i class="cardx-dot cardx-dot--full" /> {S.cardx.legendFull} <i class="cardx-dot cardx-dot--part" /> {S.cardx.legendPart}
          </span>
        </p>
      )}
    </section>
  );
}

function CreditUse({ r }: { r: CardAnalysis }) {
  const use = r.use ?? 0;
  const at = r.outlook.projectedUse;
  const pct = (x: number) => Math.round(x * 100);
  return (
    <section class="cardx-panel">
      <p class="cardx-eyebrow">
        <span>{S.cardx.use}</span>
      </p>
      <p class="cardx-big">
        <span class="num">{pct(use)}%</span>
      </p>
      <div class={`cardx-use${use > 0.3 ? ' is-high' : ''}`} aria-hidden="true">
        <span style={{ width: `${Math.min(100, pct(use))}%` }} />
        {at !== undefined && at > use && (
          <span
            class="cardx-use__next"
            style={{
              left: `${Math.min(100, pct(use))}%`,
              width: `${Math.max(0, Math.min(100, pct(at)) - Math.min(100, pct(use)))}%`,
            }}
          />
        )}
        <i style={{ left: '30%' }} />
      </div>
      <p class="cardx-meta">
        <span>{S.cardx.available(Math.max(0, r.availableCents ?? 0), r.limitCents!)}</span>
      </p>
      {at !== undefined && pct(at) !== pct(use) && <p class="cardx-note">{S.cardx.useAtClose(pct(at))}</p>}
      {(at ?? use) > 0.3 && <p class="cardx-note">{S.cardx.useTip}</p>}
    </section>
  );
}

function Outlook({ r, onDetails }: { r: CardAnalysis; onDetails: (step: CardStep) => void }) {
  const o = r.outlook;
  return (
    <>
      <div class="section-head">
        <h2>{S.cardx.outlook}</h2>
      </div>
      <div class="tiles cardx-tiles">
        <div class="tile">
          <span class="tile__label">{S.cardx.nextStatement}</span>
          <span class="tile__value">
            <Amount c={o.projectedStatementCents} />
          </span>
          <span class="tile__sub">{S.cardx.nextStatementSub(fmtDate(r.cycle.closes))}</span>
        </div>
        {o.interestIfCarriedCents !== undefined ? (
          <div class="tile">
            <span class="tile__label">{S.cardx.interest}</span>
            <span class="tile__value">
              <Amount c={o.interestIfCarriedCents} />
            </span>
            <span class="tile__sub">{S.cardx.interestSub}</span>
          </div>
        ) : (
          <button type="button" class="tile tile--add" onClick={() => onDetails('apr')}>
            <span class="tile__label">{S.cardx.interest}</span>
            <span class="tile__value">—</span>
            <span class="tile__sub">{S.cardx.interestAdd}</span>
          </button>
        )}
      </div>
    </>
  );
}

// ---------- the details flow ----------

interface Draft {
  balance?: Cents;
  minimum?: Cents;
  paid?: Cents;
}

/**
 * Asks for a card's limit, interest rate and past statements, a step at a time. Each
 * step saves as you leave it, so skipping later ones keeps what's been entered.
 */
export function CardDetailsFlow({ account, start = 'limit', onDone }: { account: Account; start?: CardStep; onDone: (saved: boolean) => void }) {
  const { app } = useApp();
  const card = account.card!;
  const today = app.clock.today();
  const [step, setStep] = useState(STEPS.indexOf(start));
  const [limit, setLimit] = useState<Cents | undefined>(card.limitCents);
  const [apr, setApr] = useState(card.aprBps ? (card.aprBps / 100).toFixed(2) : '');
  const [dates, setDates] = useState(() => statementsToAsk(account, today));
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries((card.statements ?? []).map((s) => [s.closingDate, { balance: s.balanceCents, minimum: s.minimumCents, paid: s.paidCents }])),
  );
  const [busy, setBusy] = useState(false);
  const saved = useRef(false); // whether any step saved, for the closing toast
  const cur = STEPS[step]!;
  const last = step === STEPS.length - 1;

  const save = async () => {
    if (cur === 'limit') await saveCardDetails(app, account.id, { limitCents: limit ?? null });
    if (cur === 'apr') {
      const n = Number(apr.replace('%', '').trim());
      await saveCardDetails(app, account.id, {
        aprBps: apr.trim() && Number.isFinite(n) ? Math.round(n * 100) : null,
      });
    }
    if (cur === 'statements') {
      const statements: CardStatement[] = Object.entries(drafts)
        .filter(([, d]) => d.balance !== undefined)
        .map(([closingDate, d]) => ({
          closingDate,
          balanceCents: d.balance!,
          ...(d.minimum !== undefined ? { minimumCents: d.minimum } : {}),
          ...(d.paid !== undefined ? { paidCents: d.paid } : {}),
        }));
      await saveCardDetails(app, account.id, { statements });
    }
  };
  const next = async () => {
    setBusy(true);
    try {
      await save();
      saved.current = true;
    } finally {
      setBusy(false);
    }
    if (last) onDone(true);
    else setStep(step + 1);
  };
  const skip = () => (last ? onDone(saved.current) : setStep(step + 1));
  const set = (date: string, k: keyof Draft, v: Cents | undefined) => setDrafts((d) => ({ ...d, [date]: { ...d[date], [k]: v } }));

  return (
    <div class="cardflow">
      <div class="cardflow__steps" aria-label={S.cardx.step(step + 1, STEPS.length)}>
        {STEPS.map((s, i) => (
          <span key={s} class={i < step ? 'is-done' : i === step ? 'is-on' : ''} />
        ))}
        <span class="cardflow__count num">{S.cardx.step(step + 1, STEPS.length)}</span>
      </div>

      {cur === 'limit' && (
        <>
          <h2>{S.cardx.limitTitle}</h2>
          <p class="muted">{S.cardx.limitBody}</p>
          <MoneyInput label={S.cardx.todo.limit} value={limit} onChange={setLimit} autoFocus />
        </>
      )}
      {cur === 'apr' && (
        <>
          <h2>{S.cardx.aprTitle}</h2>
          <p class="muted">{S.cardx.aprBody}</p>
          <label>
            {S.cardx.aprLabel}
            <input inputMode="decimal" placeholder="20.99" value={apr} autoFocus onInput={(e) => setApr((e.target as HTMLInputElement).value)} />
          </label>
        </>
      )}
      {cur === 'statements' && (
        <>
          <h2>{S.cardx.statementsTitle}</h2>
          <p class="muted">{S.cardx.statementsBody}</p>
          <div class="cardflow__list">
            {dates.map((d) => (
              <fieldset key={d} class="cardflow__st">
                <legend>
                  <b>{S.cardx.closed(fmtDate(d))}</b> <span>{S.cardx.dueOn(fmtDate(dueFor(d, card.dueDay)))}</span>
                </legend>
                <MoneyInput label={S.cardx.stBalance} value={drafts[d]?.balance} onChange={(c) => set(d, 'balance', c)} />
                <div class="cardflow__pair">
                  <MoneyInput label={S.cardx.stMinimum} value={drafts[d]?.minimum} onChange={(c) => set(d, 'minimum', c)} />
                  <MoneyInput label={S.cardx.stPaid} value={drafts[d]?.paid} onChange={(c) => set(d, 'paid', c)} />
                </div>
              </fieldset>
            ))}
          </div>
          {dates.length < 24 && (
            <button type="button" class="cardflow__more" onClick={() => setDates([...dates, earlierClosing(dates, card.statementDay)])}>
              {S.cardx.earlier}
            </button>
          )}
        </>
      )}

      <div class="sheet__actions cardflow__actions">
        <button type="button" class="primary block" disabled={busy} onClick={next}>
          {last ? S.cardx.done : S.cardx.next}
        </button>
        <div class="cardflow__sub">
          {step > 0 ? (
            <button type="button" class="link" onClick={() => setStep(step - 1)}>
              {S.cardx.back}
            </button>
          ) : (
            <span />
          )}
          <button type="button" class="link" onClick={skip}>
            {S.cardx.skip}
          </button>
        </div>
      </div>
    </div>
  );
}
