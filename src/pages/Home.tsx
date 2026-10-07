import { useLiveQuery } from 'dexie-react-hooks';
import { listTransactions } from '../db/repo';
import { todayISO } from '../domain/dates';
import { formatMoney } from '../domain/money';
import { useApp } from '../ui/context';
import { PageHeader } from '../ui/PageHeader';

export function Home() {
  const { settings, accounts, openAdd } = useApp();
  const transactions = useLiveQuery(() => listTransactions(), []);

  const month = todayISO().slice(0, 7);
  const balanceCents =
    accounts.reduce((sum, account) => sum + account.startingBalanceCents, 0) +
    (transactions ?? []).reduce((sum, tx) => sum + tx.amountCents, 0);
  const spentCents = (transactions ?? [])
    .filter((tx) => tx.amountCents < 0 && tx.date.startsWith(month))
    .reduce((sum, tx) => sum - tx.amountCents, 0);
  const money = (cents: number) => formatMoney(cents, settings.currency);

  return (
    <>
      <PageHeader title="Tameru" />
      <section className="card card--hero" aria-labelledby="safe-title">
        <h2 id="safe-title" className="card__eyebrow">
          Safe to spend today
        </h2>
        <p className="hero-number num" aria-label="Not available yet">
          —
        </p>
        <p className="card__hint">
          Coming next: your income, bills and goals turned into one daily number.
        </p>
      </section>

      <div className="stat-grid">
        <section className="card">
          <h2 className="card__eyebrow">Balance</h2>
          <p className="stat num">{transactions ? money(balanceCents) : '…'}</p>
        </section>
        <section className="card">
          <h2 className="card__eyebrow">Spent this month</h2>
          <p className="stat num">{transactions ? money(spentCents) : '…'}</p>
        </section>
      </div>

      {transactions?.length === 0 && (
        <section className="card empty">
          <p className="card__text">Nothing logged yet. Your first expense takes a few seconds.</p>
          <button type="button" className="btn btn--primary" onClick={openAdd}>
            Add an expense
          </button>
        </section>
      )}
    </>
  );
}
