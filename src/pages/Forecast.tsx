import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { listRecurring, listTransactions } from '../db/repo';
import { addDays, dayLabel, isISODate, shortDate, todayISO } from '../domain/dates';
import { averageDailySpend, currentBalance, forecast, type WhatIf } from '../domain/forecast';
import { formatMoney, parseMoneyInput } from '../domain/money';
import { paidKeys } from '../domain/recurring';
import { BalanceChart } from '../ui/BalanceChart';
import { useApp } from '../ui/context';
import { AlertIcon, CheckIcon } from '../ui/Icons';
import { PageHeader } from '../ui/PageHeader';
import { MoneyField } from '../ui/PlanSheets';
import { PlanTabs } from '../ui/TabBar';

const HORIZONS = [30, 60, 90] as const;

export function Forecast() {
  const { settings, accounts } = useApp();
  const transactions = useLiveQuery(() => listTransactions(), []);
  const recurring = useLiveQuery(listRecurring, []);

  const [days, setDays] = useState<(typeof HORIZONS)[number]>(30);
  const [includeSpending, setIncludeSpending] = useState(true);
  const [whatIfName, setWhatIfName] = useState('');
  const [whatIfAmount, setWhatIfAmount] = useState('');
  const [whatIfDate, setWhatIfDate] = useState(todayISO());

  const today = todayISO();
  const money = (cents: number) => formatMoney(cents, settings.currency);
  const signed = (cents: number) => formatMoney(cents, settings.currency, { signed: true });

  const whatIfCents = parseMoneyInput(whatIfAmount, settings.currency);
  const whatIf = useMemo<WhatIf | null>(
    () =>
      whatIfCents && whatIfCents > 0 && isISODate(whatIfDate)
        ? { name: whatIfName.trim() || 'Purchase', date: whatIfDate, amountCents: -whatIfCents }
        : null,
    [whatIfCents, whatIfDate, whatIfName],
  );

  const model = useMemo(() => {
    if (!transactions || !recurring) return null;
    const typicalCents = averageDailySpend(transactions, today);
    const input = {
      today,
      days,
      balanceCents: currentBalance(accounts, transactions),
      recurring,
      paid: paidKeys(transactions),
      dailySpendCents: includeSpending ? typicalCents : 0,
    };
    return {
      typicalCents,
      plan: forecast(input),
      scenario: whatIf ? forecast({ ...input, whatIf: [whatIf] }) : null,
    };
  }, [transactions, recurring, accounts, today, days, includeSpending, whatIf]);

  if (!model) return <PageHeader title="Plan" />;

  const { plan, scenario, typicalCents } = model;
  const shown = scenario ?? plan;
  const belowZero = shown.lowest.balanceCents < 0;
  const eventDays = shown.points.filter((point) => point.events.length > 0);
  const whatIfOutside =
    whatIf !== null && (whatIf.date < today || whatIf.date > addDays(today, days));

  return (
    <>
      <PageHeader title="Plan" />
      <PlanTabs route="/forecast" />

      <div className="segmented segmented--block" role="group" aria-label="Forecast length">
        {HORIZONS.map((value) => (
          <button
            key={value}
            type="button"
            className="segmented__option"
            aria-pressed={days === value}
            onClick={() => setDays(value)}
          >
            {value} days
          </button>
        ))}
      </div>

      <section className="card stack" aria-labelledby="forecast-chart">
        <h2 id="forecast-chart" className="card__title">
          Projected balance
        </h2>
        <BalanceChart
          points={plan.points}
          scenario={scenario?.points}
          scenarioLabel={whatIf ? `With ${whatIf.name.toLowerCase()}` : undefined}
          currency={settings.currency}
          today={today}
        />
        {belowZero ? (
          <p className="notice notice--warn">
            <AlertIcon size={20} />
            <span>
              <strong>Dips below zero.</strong> Lowest point is {money(shown.lowest.balanceCents)}{' '}
              on {shortDate(shown.lowest.date)}.
            </span>
          </p>
        ) : (
          <p className="notice notice--good">
            <CheckIcon size={20} />
            <span>
              Stays above zero. Lowest point is {money(shown.lowest.balanceCents)} on{' '}
              {shortDate(shown.lowest.date)}.
            </span>
          </p>
        )}
        <dl className="facts">
          <div>
            <dt>Today</dt>
            <dd className="num">{money(plan.points[0]!.balanceCents)}</dd>
          </div>
          <div>
            <dt>In {days} days</dt>
            <dd className="num">{money(shown.endBalanceCents)}</dd>
          </div>
        </dl>
        <label className="check">
          <input
            type="checkbox"
            checked={includeSpending}
            onChange={(event) => setIncludeSpending(event.target.checked)}
          />
          <span>
            Include everyday spending
            <span className="field__hint check__hint num">
              {money(typicalCents)} a day, your average over the last 30 days
            </span>
          </span>
        </label>
      </section>

      <section className="card stack" aria-labelledby="forecast-whatif">
        <h2 id="forecast-whatif" className="card__title">
          What if…
        </h2>
        <p className="field__hint">
          Try a one-off purchase and see what it does to your balance. Nothing is saved.
        </p>
        <label className="field">
          <span className="field__label">What</span>
          <input
            className="input"
            type="text"
            maxLength={30}
            autoComplete="off"
            placeholder="New bike"
            value={whatIfName}
            onChange={(event) => setWhatIfName(event.target.value)}
          />
        </label>
        <div className="field-pair">
          <MoneyField label="Cost" value={whatIfAmount} onChange={setWhatIfAmount} />
          <label className="field">
            <span className="field__label">When</span>
            <input
              className="input"
              type="date"
              min={today}
              value={whatIfDate}
              onChange={(event) => setWhatIfDate(event.target.value)}
            />
          </label>
        </div>
        {whatIfOutside && (
          <p className="field__hint">That date is outside the {days}-day forecast.</p>
        )}
        {scenario && !whatIfOutside && (
          <dl className="facts">
            <div>
              <dt>Lowest balance</dt>
              <dd className="num">
                {money(plan.lowest.balanceCents)} → {money(scenario.lowest.balanceCents)}
              </dd>
            </div>
            <div>
              <dt>In {days} days</dt>
              <dd className="num">
                {money(plan.endBalanceCents)} → {money(scenario.endBalanceCents)}
              </dd>
            </div>
          </dl>
        )}
        {whatIfAmount !== '' && (
          <button type="button" className="btn btn--secondary" onClick={() => setWhatIfAmount('')}>
            Clear what-if
          </button>
        )}
      </section>

      <section className="card stack" aria-labelledby="forecast-events">
        <h2 id="forecast-events" className="card__title">
          Scheduled in the next {days} days
        </h2>
        {eventDays.length === 0 ? (
          <p className="field__hint">
            Nothing scheduled. <a href="#/plan">Add bills and paydays in Plan.</a>
          </p>
        ) : (
          <div className="table-wrap">
            <table className="table num">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Item</th>
                  <th scope="col" className="table__num">
                    Balance after
                  </th>
                </tr>
              </thead>
              <tbody>
                {eventDays.flatMap((point) =>
                  point.events.map((event, i) => (
                    <tr key={`${point.date}-${i}`}>
                      <td>{i === 0 ? dayLabel(point.date, today).replace(/^\w{3}, /, '') : ''}</td>
                      <td>
                        <span className="table__item">{event.name}</span>
                        <span className="table__amount">{signed(event.amountCents)}</span>
                      </td>
                      <td className="table__num">
                        {i === point.events.length - 1 ? money(point.balanceCents) : ''}
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
