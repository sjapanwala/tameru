import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { listTransactions } from '../db/repo';
import { filterTransactions, groupByDay, monthTotals } from '../domain/activity';
import { dayLabel, parseISODate, todayISO } from '../domain/dates';
import { formatMoney, minorUnitDigits } from '../domain/money';
import type { Transaction } from '../domain/types';
import { useApp } from '../ui/context';
import { CloseIcon, SearchIcon } from '../ui/Icons';
import { PageHeader } from '../ui/PageHeader';

const PAGE_SIZE = 150;

type Filter = 'all' | 'review' | 'expense' | 'income';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'review', label: 'Needs review' },
  { value: 'expense', label: 'Expenses' },
  { value: 'income', label: 'Income' },
];

export function Activity() {
  const { settings, categories, openAdd, openEdit } = useApp();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [shown, setShown] = useState(PAGE_SIZE);

  const transactions = useLiveQuery(() => listTransactions(), []);
  const categoryNames = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);

  const today = todayISO();
  const reviewCount = useMemo(
    () => (transactions ?? []).filter((tx) => tx.needsReview).length,
    [transactions],
  );
  const totals = useMemo(
    () => monthTotals(transactions ?? [], today.slice(0, 7)),
    [transactions, today],
  );
  const filtered = useMemo(
    () =>
      filterTransactions(
        transactions ?? [],
        {
          query,
          needsReviewOnly: filter === 'review',
          kind: filter === 'expense' || filter === 'income' ? filter : undefined,
        },
        categoryNames,
        minorUnitDigits(settings.currency),
      ),
    [transactions, query, filter, categoryNames, settings.currency],
  );
  const groups = useMemo(() => groupByDay(filtered.slice(0, shown)), [filtered, shown]);

  // A real minus sign and an explicit plus, so direction never rests on colour.
  const money = (cents: number) =>
    formatMoney(cents, settings.currency, { signed: true }).replace('-', '−');
  const filtering = query.trim() !== '' || filter !== 'all';
  const monthShort = new Intl.DateTimeFormat(undefined, { month: 'short' }).format(
    parseISODate(today),
  );

  function row(tx: Transaction) {
    const category = tx.categoryId ? categoryNames.get(tx.categoryId) : undefined;
    const fallback = tx.amountCents > 0 ? 'Income' : 'Uncategorised';
    const title = tx.merchant || category || (tx.amountCents > 0 ? 'Income' : 'Expense');
    const detail = [
      tx.merchant ? (category ?? fallback) : category ? null : fallback,
      tx.needsReview ? 'needs review' : null,
      tx.note || null,
    ]
      .filter(Boolean)
      .join(' · ');
    return (
      <li key={tx.id}>
        <button type="button" className="tx" onClick={() => openEdit(tx)}>
          <span className="tx__main">
            <span className="tx__title">{title}</span>
            {detail && (
              <span className={`tx__detail${tx.needsReview ? ' tx__detail--review' : ''}`}>
                {detail}
              </span>
            )}
          </span>
          <span className={`tx__amount num${tx.amountCents > 0 ? ' tx__amount--in' : ''}`}>
            {money(tx.amountCents)}
          </span>
        </button>
      </li>
    );
  }

  return (
    <>
      <PageHeader title="Activity" />

      <div className="search">
        <SearchIcon size={18} />
        <label className="visually-hidden" htmlFor="activity-search">
          Search transactions
        </label>
        <input
          id="activity-search"
          className="search__input"
          type="search"
          placeholder="Search merchant, note, amount"
          autoComplete="off"
          enterKeyHint="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setShown(PAGE_SIZE);
          }}
        />
        {query !== '' && (
          <button
            type="button"
            className="icon-btn icon-btn--small"
            aria-label="Clear search"
            onClick={() => setQuery('')}
          >
            <CloseIcon size={18} />
          </button>
        )}
      </div>

      <dl className="totals num">
        <div>
          <dt>In · {monthShort}</dt>
          <dd className="is-in">{money(totals.inCents)}</dd>
        </div>
        <div>
          <dt>Out</dt>
          <dd>{money(-totals.outCents)}</dd>
        </div>
        <div>
          <dt>Net</dt>
          <dd>{money(totals.netCents)}</dd>
        </div>
      </dl>

      <div className="chip-row" role="group" aria-label="Filter">
        {FILTERS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            className="chip"
            aria-pressed={filter === value}
            onClick={() => {
              setFilter(value);
              setShown(PAGE_SIZE);
            }}
          >
            {label}
            {value === 'review' && (
              <span className={`chip__count${reviewCount === 0 ? ' chip__count--zero' : ''}`}>
                {reviewCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {transactions === undefined ? null : groups.length === 0 ? (
        <section className="card empty">
          {filtering ? (
            <>
              <p className="card__text">
                {filter === 'review' && query.trim() === ''
                  ? 'Nothing needs review. All caught up.'
                  : 'No transactions match.'}
              </p>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => {
                  setQuery('');
                  setFilter('all');
                }}
              >
                Show everything
              </button>
            </>
          ) : (
            <>
              <p className="card__text">No transactions yet.</p>
              <button type="button" className="btn btn--primary" onClick={openAdd}>
                Add an expense
              </button>
            </>
          )}
        </section>
      ) : (
        <>
          {groups.map((group) => (
            <section key={group.date} className="day" aria-labelledby={`day-${group.date}`}>
              <div className="day__head">
                <h2 id={`day-${group.date}`} className="day__label">
                  {dayLabel(group.date, today)}
                </h2>
                <span className="day__total num">{money(group.totalCents)}</span>
              </div>
              <ul>{group.items.map(row)}</ul>
            </section>
          ))}
          {filtered.length > shown && (
            <button
              type="button"
              className="btn btn--secondary btn--block"
              onClick={() => setShown(shown + PAGE_SIZE)}
            >
              Show older ({filtered.length - shown} more)
            </button>
          )}
        </>
      )}
    </>
  );
}
