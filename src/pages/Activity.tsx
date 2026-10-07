import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { listTransactions } from '../db/repo';
import { filterTransactions, groupByDay } from '../domain/activity';
import { dayLabel, todayISO } from '../domain/dates';
import { formatMoney, minorUnitDigits } from '../domain/money';
import type { Transaction } from '../domain/types';
import { useApp } from '../ui/context';
import { AlertIcon, CloseIcon, SearchIcon } from '../ui/Icons';
import { PageHeader } from '../ui/PageHeader';

const PAGE_SIZE = 150;

export function Activity() {
  const { settings, categories, openAdd, openEdit } = useApp();
  const [query, setQuery] = useState('');
  const [needsReviewOnly, setNeedsReviewOnly] = useState(false);
  const [shown, setShown] = useState(PAGE_SIZE);

  const transactions = useLiveQuery(() => listTransactions(), []);
  const categoryNames = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);

  const reviewCount = useMemo(
    () => (transactions ?? []).filter((tx) => tx.needsReview).length,
    [transactions],
  );
  const filtered = useMemo(
    () =>
      filterTransactions(
        transactions ?? [],
        { query, needsReviewOnly },
        categoryNames,
        minorUnitDigits(settings.currency),
      ),
    [transactions, query, needsReviewOnly, categoryNames, settings.currency],
  );
  const groups = useMemo(() => groupByDay(filtered.slice(0, shown)), [filtered, shown]);

  const today = todayISO();
  const money = (cents: number) => formatMoney(cents, settings.currency, { signed: true });
  const filtering = query.trim() !== '' || needsReviewOnly;

  function row(tx: Transaction) {
    const category = tx.categoryId ? categoryNames.get(tx.categoryId) : undefined;
    const title = tx.merchant || category || (tx.amountCents > 0 ? 'Income' : 'Expense');
    const detail = [
      tx.merchant ? (category ?? (tx.amountCents > 0 ? 'Income' : 'Uncategorised')) : null,
      tx.note,
    ]
      .filter(Boolean)
      .join(' · ');
    return (
      <li key={tx.id}>
        <button type="button" className="tx" onClick={() => openEdit(tx)}>
          <span className="tx__main">
            <span className="tx__title">{title}</span>
            {detail && <span className="tx__detail">{detail}</span>}
            {tx.needsReview && (
              <span className="badge badge--warn">
                <AlertIcon size={14} />
                Needs review
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
        <SearchIcon size={20} />
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

      <div className="chip-row" role="group" aria-label="Filter">
        <button
          type="button"
          className="chip"
          aria-pressed={!needsReviewOnly}
          onClick={() => setNeedsReviewOnly(false)}
        >
          All
        </button>
        <button
          type="button"
          className="chip"
          aria-pressed={needsReviewOnly}
          onClick={() => setNeedsReviewOnly(true)}
        >
          <AlertIcon size={16} />
          Needs review
          <span className="chip__count num">{reviewCount}</span>
        </button>
      </div>

      {transactions === undefined ? null : groups.length === 0 ? (
        <section className="card empty">
          {filtering ? (
            <>
              <p className="card__text">
                {needsReviewOnly && query.trim() === ''
                  ? 'Nothing needs review. All caught up.'
                  : 'No transactions match.'}
              </p>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => {
                  setQuery('');
                  setNeedsReviewOnly(false);
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
              <ul className="card card--list">{group.items.map(row)}</ul>
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
