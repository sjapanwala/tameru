import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState, type FormEvent } from 'react';
import {
  deleteTransaction,
  listBudgets,
  listGoals,
  listRecurring,
  listTransactions,
  recordOccurrence,
  saveRecurring,
} from '../db/repo';
import { addDays, parseISODate, todayISO } from '../domain/dates';
import { centsToInput, formatMoney, parseMoneyInput } from '../domain/money';
import {
  cautiousEstimate,
  occurrenceKey,
  occurrencesOf,
  paidKeys,
  signedAmount,
  type Occurrence,
} from '../domain/recurring';
import { budgetProgress, compareToLastMonth, dailySpend, safeToSpend } from '../domain/safeToSpend';
import { useApp } from '../ui/context';
import { AlertIcon, CheckIcon } from '../ui/Icons';
import { PageHeader } from '../ui/PageHeader';
import { Sheet } from '../ui/Sheet';

const LOOK_BACK_DAYS = 7;
const LOOK_AHEAD_DAYS = 14;
const SEGMENTS = 24;
const BAR_HEIGHT = 88;

/** "OCT 09": month and zero-padded day, for the ledger's date column. */
function monoDate(iso: string): string {
  const month = new Intl.DateTimeFormat(undefined, { month: 'short' }).format(parseISODate(iso));
  return `${month} ${iso.slice(8)}`;
}

/** 24-tick meter. The numbers beside it carry the exact value. */
function Segments({ fraction, over = false }: { fraction: number; over?: boolean }) {
  const on = Math.round(Math.min(1, Math.max(0, fraction)) * SEGMENTS);
  return (
    <span className={`segs${over ? ' segs--over' : ''}`} aria-hidden="true">
      {Array.from({ length: SEGMENTS }, (_, i) => (
        <span key={i} className={`segs__seg${i < on ? ' segs__seg--on' : ''}`} />
      ))}
    </span>
  );
}

/** Asks what actually arrived for a payday whose amount varies. */
function ReceivedSheet({
  occurrence,
  currency,
  onSave,
  onClose,
}: {
  occurrence: Occurrence;
  currency: string;
  onSave(cents: number): void;
  onClose(): void;
}) {
  const { recurring: item } = occurrence;
  const [amount, setAmount] = useState(centsToInput(item.amountCents, currency));
  const cents = parseMoneyInput(amount, currency);
  const valid = cents !== null && cents > 0;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (valid) onSave(cents);
  }

  return (
    <Sheet label={`${item.name} received`} variant="alert" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <h2 className="dialog__title">How much arrived?</h2>
        <label className="field">
          <span className="field__label">{item.name}, take-home</span>
          <input
            className="input num"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            autoFocus
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
          <span className="field__hint">
            Planned on {formatMoney(item.amountCents, currency)}. Your daily number adjusts to the
            real amount.
          </span>
        </label>
        <div className="dialog__actions">
          <button type="button" className="btn btn--quiet" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={!valid}>
            Save
          </button>
        </div>
      </form>
    </Sheet>
  );
}

export function Home() {
  const { settings, accounts, categories, openAdd, showToast } = useApp();
  const transactions = useLiveQuery(() => listTransactions(), []);
  const recurring = useLiveQuery(listRecurring, []);
  const budgets = useLiveQuery(listBudgets, []);
  const goals = useLiveQuery(listGoals, []);
  const [receiving, setReceiving] = useState<Occurrence | null>(null);

  const today = todayISO();
  const money = (cents: number) => formatMoney(cents, settings.currency);
  const ready = transactions && recurring && budgets && goals;

  const safe = useMemo(
    () => (ready ? safeToSpend({ today, recurring, goals, transactions }) : null),
    [ready, today, recurring, goals, transactions],
  );
  const progress = useMemo(
    () => (ready ? budgetProgress({ today, budgets, categories, transactions }) : []),
    [ready, today, budgets, categories, transactions],
  );
  const days = useMemo(
    () => (ready ? dailySpend(transactions, today) : []),
    [ready, transactions, today],
  );
  const comparison = useMemo(
    () => (ready ? compareToLastMonth(transactions, today) : null),
    [ready, transactions, today],
  );
  const comingUp = useMemo(() => {
    if (!ready) return [];
    const paid = paidKeys(transactions);
    return occurrencesOf(
      recurring,
      addDays(today, -LOOK_BACK_DAYS),
      addDays(today, LOOK_AHEAD_DAYS),
    ).filter(({ recurring: item, date }) => !paid.has(occurrenceKey(item.id, date)));
  }, [ready, today, recurring, transactions]);

  const date = parseISODate(today);
  const monthName = new Intl.DateTimeFormat(undefined, { month: 'long' }).format(date);
  const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(date);
  const dayOfMonth = Number(today.slice(8));
  const header = (
    <PageHeader
      title={monthName}
      sub={`${weekday} ${today.slice(8)} · Day ${dayOfMonth} of ${days.length || 31}`}
    />
  );

  if (!ready || !safe || !comparison) return header;

  const over = safe.remainingCents < 0;
  const budgetCents = safe.incomeCents - safe.billsCents - safe.goalsCents;
  const figure = money(safe.perDayCents);
  const previousMonthName = new Intl.DateTimeFormat(undefined, { month: 'long' }).format(
    parseISODate(comparison.previousMonth),
  );
  const billsDue = comingUp
    .filter((o) => o.recurring.kind === 'bill')
    .reduce((sum, o) => sum + o.recurring.amountCents, 0);

  // Bars share one scale with the allowance line; the tallest of the two fills the plot.
  const scaleMax = Math.max(...days, safe.perDayCents * 1.25, 1);
  const allowanceY = safe.hasIncome ? (safe.perDayCents / scaleMax) * BAR_HEIGHT : null;
  const spentDays = days.slice(0, dayOfMonth);
  const overDays = spentDays.filter((cents) => cents > safe.perDayCents).length;

  async function record({ recurring: item, date: due }: Occurrence, actualCents?: number) {
    const accountId = settings.defaultAccountId ?? accounts[0]?.id;
    if (!accountId) return;
    // A future bill paid early is dated today; a past one keeps its due date.
    const tx = await recordOccurrence(item, due, due > today ? today : due, accountId, actualCents);

    // Income that varies: once there are a few paydays to go on, offer (never
    // assume) to plan on the lowest recent one.
    if (actualCents !== undefined && transactions) {
      const earlier = transactions
        .filter((t) => t.recurringId === item.id && t.recurringDate)
        .map((t) => Math.abs(t.amountCents));
      const estimate = cautiousEstimate([actualCents, ...earlier]);
      if (estimate !== null && estimate !== item.amountCents) {
        showToast({
          message: `${money(actualCents)} received. Your lowest recent ${item.name} was ${money(estimate)}. Plan on that?`,
          actionLabel: 'Update',
          onAction: () => saveRecurring(item.id, { amountCents: estimate }).then(() => {}),
          sticky: true,
        });
        return;
      }
    }
    showToast({
      message: item.kind === 'bill' ? `${item.name} marked paid.` : `${item.name} marked received.`,
      actionLabel: 'Undo',
      onAction: () => deleteTransaction(tx.id),
    });
  }

  return (
    <>
      {header}

      <section className="ledger" aria-labelledby="safe-title">
        {safe.hasIncome ? (
          <>
            <div className="ledger__hero">
              <div>
                <h2 id="safe-title" className="ledger__label">
                  Safe to spend today
                </h2>
                <span
                  className={`ledger__figure${figure.length > 9 ? ' ledger__figure--long' : ''}`}
                >
                  {figure}
                </span>
              </div>
              <span className="ledger__aside">
                per day
                <br />
                for {safe.daysLeft} day{safe.daysLeft === 1 ? '' : 's'}
              </span>
            </div>
            {over && (
              <p className="notice notice--warn">
                <AlertIcon size={20} />
                <span>
                  <strong>Over plan by {money(-safe.remainingCents)}.</strong> Spending so far is
                  more than this month's income covers after bills and goals.
                </span>
              </p>
            )}
          </>
        ) : (
          <div className="ledger__hero">
            <div className="ledger__setup">
              <h2 id="safe-title" className="ledger__label">
                Safe to spend today
              </h2>
              <span className="ledger__figure ledger__figure--empty" aria-label="Not available yet">
                —
              </span>
              <p className="card__hint">
                Add your payday and bills, and Tameru works out a daily number.
              </p>
              <a className="btn btn--primary" href="#/plan">
                Set up your plan
              </a>
            </div>
          </div>
        )}

        <dl className="ledger__grid">
          <div className="ledger__cell">
            <dt>Spent</dt>
            <dd>{money(safe.spentCents)}</dd>
          </div>
          <div className="ledger__cell">
            <dt>Remaining</dt>
            <dd className={over ? 'is-neg' : undefined}>
              {safe.hasIncome ? money(safe.remainingCents) : '—'}
            </dd>
          </div>
        </dl>
        <dl className="ledger__grid">
          <div className="ledger__cell">
            <dt>Budget</dt>
            <dd>{safe.hasIncome ? money(budgetCents) : '—'}</dd>
          </div>
          <div className="ledger__cell">
            <dt>vs {previousMonthName}</dt>
            {/* More than last month is flagged; the sign says which way. */}
            <dd
              className={comparison.hasPrevious && comparison.diffCents > 0 ? 'is-neg' : undefined}
            >
              {comparison.hasPrevious
                ? formatMoney(comparison.diffCents, settings.currency, { signed: true })
                : '—'}
            </dd>
          </div>
        </dl>
      </section>

      <section className="section" aria-labelledby="home-daily">
        <div className="section__head">
          <h2 id="home-daily" className="section__title">
            Daily spending
          </h2>
          {allowanceY !== null && (
            <span className="section__meta allowance-key num">{figure} allowance</span>
          )}
        </div>
        <div
          className="daybars"
          role="img"
          aria-label={`Spending for each day of ${monthName}. ${spentDays.filter((c) => c > 0).length} of ${dayOfMonth} days had spending${
            safe.hasIncome ? `, ${overDays} above today's allowance of ${figure}` : ''
          }. Today: ${money(days[dayOfMonth - 1] ?? 0)}.`}
        >
          {days.map((cents, i) => {
            const day = i + 1;
            const state =
              day > dayOfMonth
                ? ' daybars__bar--future'
                : day === dayOfMonth
                  ? ' daybars__bar--today'
                  : cents === 0
                    ? ' daybars__bar--zero'
                    : '';
            return (
              <span
                key={day}
                className={`daybars__bar${state}`}
                style={{
                  height: day > dayOfMonth ? 3 : Math.max(3, (cents / scaleMax) * BAR_HEIGHT),
                }}
              />
            );
          })}
          {allowanceY !== null && (
            <span className="daybars__allowance" style={{ bottom: allowanceY }} />
          )}
        </div>
        <div className="daybars__axis" aria-hidden="true">
          {[1, 8, 15, 22, days.length].map((day) => (
            <span key={day}>{String(day).padStart(2, '0')}</span>
          ))}
        </div>
      </section>

      {comingUp.length > 0 && (
        <section className="section" aria-labelledby="home-coming">
          <div className="section__head">
            <h2 id="home-coming" className="section__title">
              Bills · next {LOOK_AHEAD_DAYS} days
            </h2>
            <span className="section__meta mono">{money(billsDue)}</span>
          </div>
          <ul>
            {comingUp.map((occurrence) => {
              const { recurring: item, date: due } = occurrence;
              const late = due < today;
              return (
                <li key={occurrenceKey(item.id, due)} className="bill">
                  <span className="bill__date">{monoDate(due)}</span>
                  <span className="bill__name">
                    {item.name}
                    {late && <small>{item.kind === 'bill' ? 'Overdue' : 'Not received yet'}</small>}
                    {item.kind === 'income' && item.variable && (
                      <small className="bill__note">Estimate</small>
                    )}
                  </span>
                  <span
                    className={`bill__amount${item.kind === 'income' ? ' tx__amount--in' : ''}`}
                  >
                    {item.kind === 'income'
                      ? formatMoney(signedAmount(item), settings.currency, { signed: true })
                      : money(item.amountCents)}
                  </span>
                  <button
                    type="button"
                    className="bill__done"
                    onClick={() =>
                      item.kind === 'income' && item.variable
                        ? setReceiving(occurrence)
                        : void record(occurrence)
                    }
                  >
                    <CheckIcon size={16} />
                    {item.kind === 'bill' ? 'Paid' : 'Got it'}
                    <span className="visually-hidden">: {item.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {progress.length > 0 && (
        <section className="section" aria-labelledby="home-budgets">
          <h2 id="home-budgets" className="section__title">
            Budgets
          </h2>
          <ul className="progress-list">
            {progress.map((row) => (
              <li key={row.categoryId} className="progress">
                <span className="progress__line">
                  <span>{row.name}</span>
                  <span className={`progress__meta${row.over ? ' progress__meta--over' : ''}`}>
                    {money(row.spentCents)} / {money(row.budgetCents)}
                    {row.over ? ` · over ${money(-row.leftCents)}` : ''}
                  </span>
                </span>
                <Segments fraction={row.fraction} over={row.over} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {goals.length > 0 && (
        <section className="section" aria-labelledby="home-goals">
          <h2 id="home-goals" className="section__title">
            Goals
          </h2>
          <ul className="progress-list">
            {goals.map((goal) => {
              const fraction = Math.min(1, goal.savedCents / goal.targetCents);
              return (
                <li key={goal.id} className="progress">
                  <span className="progress__line">
                    <span>{goal.name}</span>
                    <span className="progress__meta">
                      {money(goal.savedCents)} / {money(goal.targetCents)} ·{' '}
                      {Math.round(fraction * 100)}%
                    </span>
                  </span>
                  <Segments fraction={fraction} />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {transactions.length === 0 && (
        <section className="card empty">
          <p className="card__text">Nothing logged yet. Your first expense takes a few seconds.</p>
          <button type="button" className="btn btn--primary" onClick={openAdd}>
            Add an expense
          </button>
        </section>
      )}
      {receiving && (
        <ReceivedSheet
          occurrence={receiving}
          currency={settings.currency}
          onClose={() => setReceiving(null)}
          onSave={(cents) => {
            setReceiving(null);
            void record(receiving, cents);
          }}
        />
      )}
    </>
  );
}
