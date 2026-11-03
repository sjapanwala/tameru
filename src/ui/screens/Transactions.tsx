// Activity: the last 14 days' spending (scrub the chart to pick a day), the cards to
// scope it to, then every transaction grouped by day with a type filter and search.
// Tap a row for details. Upload or photograph a receipt to scan it.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { fmtDate, fmtWeekday, S } from '../../copy/strings';
import { addDays, diffDays } from '../../domain/dates';
import { isBudgetCategory } from '../../domain/defaults';
import { merchantKey } from '../../domain/merchant';
import type { Account, Category, Cents, Split, Transaction } from '../../domain/types';
import { confirmTransaction, deleteTransaction, listByDay, recategorise, restoreTransaction, TxValidationError, updateTransaction } from '../../services/transactions';
import { Amount, CategorySelect, Message, monogram, MoneyInput, PageHeader } from '../components';
import { useApp, useLoad } from '../hooks';
import { ArrowDownLeft, CameraIcon, ChevronRight, PencilIcon, PlusIcon, SearchIcon, SwapIcon, TrashIcon, UploadIcon } from '../Icons';
import { useRoute } from '../router';
import { scanReceipt } from '../scan';
import { Sheet } from '../Sheet';
import { SpendPanel } from '../SpendPanel';
import { CardFace, useCatalog } from '../cards';
import { isCard } from '../../services/home';
import { SwipeRow } from '../SwipeRow';
import { toast } from '../toast';
import { orderedAccounts } from '../../services/accounts';

const CARDS_OPEN_KEY = 'tameru-activity-cards';

type Filter = 'all' | 'spent' | 'income' | 'transfer';
const FILTERS: Filter[] = ['all', 'spent', 'income', 'transfer'];

const matchesFilter = (t: Transaction, f: Filter) =>
  f === 'all' || (f === 'spent' ? t.type === 'expense' || t.type === 'refund' : f === 'income' ? t.type === 'income' : t.type === 'transfer');

export function Transactions() {
  const { app, bump } = useApp();
  const route = useRoute();
  const [days, setDays] = useState(60);
  const today = app.clock.today();
  const groups = useLoad((a) => listByDay(a, addDays(today, -days), addDays(today, 31)), [days]);
  const accounts = useLoad(orderedAccounts) ?? [];
  const categories = useLoad((a) => a.repos.categories.all()) ?? [];
  const catalog = useCatalog();
  const cards = accounts.filter(isCard);
  const budgetCats = categories.filter(isBudgetCategory).sort((a, b) => a.sortOrder - b.sortOrder);
  // Home's See more can arrive with a type already picked (#/transactions?type=spent).
  const [filter, setFilter] = useState<Filter>(() => {
    const t = route.params.get('type') as Filter | null;
    return t && FILTERS.includes(t) ? t : 'all';
  });
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (searching) setTimeout(() => searchRef.current?.focus(), 120);
  }, [searching]);
  // The card the page is scoped to (Home's See more can pass one), and a picked day.
  const [cardId, setCardId] = useState<string>(() => route.params.get('card') ?? 'all');
  const [day, setDay] = useState<string | null>(null);
  // The Cards row folds away; remembered on this device.
  const [cardsOpen, setCardsOpen] = useState(() => {
    try {
      return localStorage.getItem(CARDS_OPEN_KEY) !== '0';
    } catch {
      return true;
    }
  });
  const toggleCards = () => {
    const next = !cardsOpen;
    setCardsOpen(next);
    try {
      localStorage.setItem(CARDS_OPEN_KEY, next ? '1' : '0');
    } catch {
      // private mode: it just won't be remembered
    }
  };
  // Keep the picked card in view in its row (sideways only: never scroll the page).
  const cardRow = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = cardRow.current;
    const el = row?.querySelector<HTMLElement>('.act-card.on');
    if (!row || !el) return;
    const left = el.offsetLeft - row.offsetLeft;
    if (left < row.scrollLeft || left + el.offsetWidth > row.scrollLeft + row.clientWidth) row.scrollTo({ left: Math.max(0, left - 24), behavior: 'smooth' });
  }, [cardId, accounts.length, cardsOpen]);
  const card = cards.find((c) => c.id === cardId);
  const onCard = (t: Transaction) => !card || t.accountId === card.id || t.toAccountId === card.id;
  const [open, setOpen] = useState<string>();
  const [editing, setEditing] = useState(false); // opened by swiping right: straight to the edit form
  const [msg, setMsg] = useState<string>();

  const catName = (id?: string) => categories.find((c) => c.id === id)?.name;
  const acct = (id?: string) => accounts.find((a) => a.id === id)?.name ?? '';
  const title = (t: Transaction) =>
    t.type === 'transfer' ? `${acct(t.accountId)} → ${acct(t.toAccountId)}` : (t.merchant ?? catName(t.categoryId) ?? S.txType[t.type]);

  // Search matches merchant, category, account and note (normalised like merchants).
  const q = merchantKey(query);
  const shown = useMemo(
    () =>
      (groups ?? [])
        .map((g) => ({
          ...g,
          transactions: g.transactions.filter(
            (t) =>
              onCard(t) &&
              (!day || t.date === day) &&
              matchesFilter(t, filter) &&
              (!q || merchantKey(`${t.merchant ?? ''} ${catName(t.categoryId) ?? ''} ${acct(t.accountId)} ${t.note ?? ''}`).includes(q)),
          ),
        }))
        .filter((g) => g.transactions.length > 0),
    [groups, filter, q, day, card?.id, categories.length, accounts.length],
  );

  const run = async (fn: () => Promise<unknown>, done?: string) => {
    try {
      await fn();
      setMsg(done);
      bump();
    } catch (e) {
      setMsg(e instanceof TxValidationError ? e.errors.map((x) => S.errors.tx[x]).join(' ') : String(e));
    }
  };

  const swipeDelete = async (t: Transaction) => {
    const before = await deleteTransaction(app, t.id);
    bump();
    if (before)
      toast(t.originKey ? S.transactions.skipped : S.transactions.deleted, {
        label: S.common.undo,
        run: async () => {
          await restoreTransaction(app, before);
          bump();
        },
      });
  };

  const selected = open ? groups?.flatMap((g) => g.transactions).find((t) => t.id === open) : undefined;
  if (!groups) return <div class="placeholder" />;

  return (
    <section class="activity">
      <PageHeader
        title={S.transactions.title}
        action={
          <div class="head-actions">
            <button type="button" class="icon-btn icon-btn--soft" aria-label={S.transactions.upload} onClick={() => scanReceipt('upload')}>
              <UploadIcon />
            </button>
            <button type="button" class="icon-btn icon-btn--soft" aria-label={S.transactions.photo} onClick={() => scanReceipt('camera')}>
              <CameraIcon />
            </button>
            <a class="icon-btn icon-btn--plain" href="#/add" aria-label={S.nav.add}>
              <PlusIcon />
            </a>
          </div>
        }
      />

      <SpendPanel
        transactions={groups.flatMap((g) => g.transactions).filter(onCard)}
        dates={Array.from({ length: 14 }, (_, i) => addDays(today, i - 13))}
        selected={day}
        onSelect={setDay}
        catName={catName}
        dayLabel={(d) => dayLabel(d, today)}
      />

      {cards.length > 0 && (
        <>
          {/* Tap the header to fold the row of cards away; the picked card stays named in it. */}
          <h2 class="act-fold-head">
            <button type="button" class="act-fold" aria-expanded={cardsOpen} aria-controls="act-cards" onClick={() => toggleCards()}>
              <span class="act-fold__title">{S.transactions.cards}</span>
              <span class="section-head__note">
                {card ? (card.face?.cardName ?? card.name) : S.home.allAccounts}
                <ChevronRight />
              </span>
            </button>
          </h2>
          <div class="act-cards-wrap" data-on={cardsOpen} inert={!cardsOpen}>
          {/* a row of mini cards to swipe through, All first; picking one scopes the page */}
          <div class="act-cards" id="act-cards" ref={cardRow} role="radiogroup" aria-label={S.transactions.cards}>
            {[undefined, ...cards].map((c) => {
              const id = c?.id ?? 'all';
              const on = cardId === id;
              return (
                <button
                  type="button"
                  role="radio"
                  key={id}
                  aria-checked={on}
                  class={`act-card${on ? ' on' : ''}`}
                  onClick={() => (setCardId(id), setDay(null))}
                >
                  <span class="act-card__face">
                    {c ? <CardFace account={c} catalog={catalog} /> : <span class="act-card__all">{S.transactions.filters.all}</span>}
                    {c?.face?.last4 && <span class="act-card__last4">•• {c.face.last4}</span>}
                  </span>
                  <span class="act-card__name">{c ? (c.face?.cardName ?? c.name) : S.home.allAccounts}</span>
                </button>
              );
            })}
          </div>
          </div>
        </>
      )}

      <div class={`act-tools${searching ? ' act-tools--search' : ''}`}>
        <div class="act-tools__main">
          <div class="segmented segmented--filters" role="radiogroup" aria-label={S.transactions.title}>
            <span class="segmented__thumb" style={{ width: `calc((100% - 4px) / ${FILTERS.length})`, transform: `translateX(${FILTERS.indexOf(filter) * 100}%)` }} />
            {FILTERS.map((f) => (
              <button type="button" role="radio" aria-checked={filter === f} key={f} tabIndex={searching ? -1 : undefined} onClick={() => setFilter(f)}>
                {S.transactions.filters[f]}
              </button>
            ))}
          </div>
          <button type="button" class="icon-btn icon-btn--soft act-tools__find" aria-label={S.transactions.search} tabIndex={searching ? -1 : undefined} onClick={() => setSearching(true)}>
            <SearchIcon />
          </button>
        </div>
        <div class="act-tools__search" aria-hidden={!searching}>
          <label class="search">
            <SearchIcon />
            <input
              ref={searchRef}
              type="search"
              value={query}
              placeholder={S.transactions.search}
              aria-label={S.transactions.search}
              tabIndex={searching ? undefined : -1}
              onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
            />
          </label>
          <button type="button" class="linkbtn linkbtn--accent" tabIndex={searching ? undefined : -1} onClick={() => (setSearching(false), setQuery(''))}>
            {S.common.cancel}
          </button>
        </div>
      </div>

      <Message text={msg} />
      {shown.length === 0 && <p class="muted empty">{query || filter !== 'all' || day || card ? S.transactions.noMatch : S.common.none}</p>}

      {shown.map((g) => (
        <div class="day" key={g.date}>
          <div class="day__head">
            <span>{dayLabel(g.date, today)}</span>
            <span>{S.transactions.dayTotal(...dayTotals(groups.find((x) => x.date === g.date)!.transactions.filter(onCard)))}</span>
          </div>
          <ul class="txlist txlist--group">
            {g.transactions.map((t) => (
              <li key={t.id}>
                <SwipeRow
                  onDelete={() => swipeDelete(t)}
                  onEdit={t.status !== 'skipped' ? () => (setEditing(true), setOpen(t.id)) : undefined}
                  deleteLabel={t.originKey ? S.transactions.skip : S.common.delete}
                  editLabel={S.common.edit}
                  deleteIcon={<TrashIcon />}
                  editIcon={<PencilIcon />}
                >
                <button type="button" class={`txrow${t.status === 'pending' ? ' txrow--pending' : ''}`} onClick={() => setOpen(t.id)}>
                  <span class="avatar" aria-hidden="true">
                    {t.type === 'transfer' ? <SwapIcon /> : t.type === 'income' ? <ArrowDownLeft /> : monogram(title(t))}
                  </span>
                  <span class="txlist__main">
                    <span class="txlist__title">
                      {title(t)}
                      {t.needsReview && <span class="dot" title={S.transactions.review} />}
                    </span>
                    <span class="txlist__meta">{meta(t, catName, acct)}</span>
                  </span>
                  <span class="txlist__amt">
                    <Amount c={t.type === 'expense' ? -t.amountCents : t.amountCents} sign={t.type === 'income' || t.type === 'refund' ? '+' : undefined} />
                  </span>
                </button>
                </SwipeRow>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <button type="button" class="link show-earlier" onClick={() => setDays(days + 60)}>
        {S.transactions.showEarlier}
      </button>

      {selected && (
        <Sheet label={S.transactions.details} onClose={() => (setOpen(undefined), setEditing(false))}>
          <TxDetails
            t={selected}
            startEditing={editing}
            title={title(selected)}
            categories={budgetCats}
            accounts={accounts}
            catName={catName}
            onAction={(fn, done) => run(fn, done).then(() => (setOpen(undefined), setEditing(false)))}
          />
        </Sheet>
      )}
    </section>
  );
}

function TxDetails(props: {
  t: Transaction;
  startEditing?: boolean;
  title: string;
  categories: Category[];
  accounts: Account[];
  catName: (id?: string) => string | undefined;
  onAction: (fn: () => Promise<unknown>, done?: string) => void;
}) {
  const { app } = useApp();
  const { t } = props;
  const [editing, setEditing] = useState(!!props.startEditing);
  const acct = (id?: string) => props.accounts.find((a) => a.id === id)?.name ?? '';
  if (editing)
    return (
      <EditTx
        tx={t}
        categories={props.categories}
        onDone={() => setEditing(false)}
        onSave={async (p) => props.onAction(() => updateTransaction(app, t.id, p))}
      />
    );
  const rows: [string, preact.ComponentChildren][] = [
    [S.transactions.date, fmtWeekday(t.date)],
    [t.type === 'transfer' ? S.accounts.from : S.transactions.account, acct(t.accountId)],
    ...(t.toAccountId ? ([[S.accounts.to, acct(t.toAccountId)]] as [string, string][]) : []),
    ...(t.splits?.length
      ? t.splits.map((s) => [props.catName(s.categoryId) ?? '', <Amount c={s.amountCents} />] as [string, preact.ComponentChildren])
      : []),
    ...(t.status !== 'posted' ? ([[S.transactions.status, S.status[t.status]]] as [string, string][]) : []),
    ...(t.note ? ([[S.transactions.note, t.note]] as [string, string][]) : []),
  ];
  return (
    <div class="tx-details">
      <p class="eyebrow">{S.txType[t.type]}</p>
      <h2>{props.title}</h2>
      <p class="tx-details__amount">
        <Amount c={t.type === 'expense' ? -t.amountCents : t.amountCents} sign={t.type === 'income' || t.type === 'refund' ? '+' : undefined} />
      </p>
      <ul class="receipt">
        {rows.map(([k, v], i) => (
          <li key={i}>
            <span>{k}</span>
            <span class="leader" />
            <span>{v}</span>
          </li>
        ))}
      </ul>
      {t.type !== 'transfer' && !t.splits?.length && (
        <label>
          {t.needsReview ? S.transactions.review : S.transactions.category}
          <CategorySelect categories={props.categories} value={t.categoryId} onChange={(id) => id && props.onAction(() => recategorise(app, t.id, id))} />
        </label>
      )}
      {t.status === 'pending' && (
        <button type="button" class="primary block" onClick={() => props.onAction(() => confirmTransaction(app, t.id))}>
          {S.transactions.confirm}
        </button>
      )}
      <div class="tx-details__actions">
        {t.status !== 'skipped' && (
          <button type="button" onClick={() => setEditing(true)}>
            {S.common.edit}
          </button>
        )}
        <button type="button" onClick={() => props.onAction(() => deleteTransaction(app, t.id), S.transactions.deleted)}>
          {t.originKey ? S.transactions.skip : S.common.delete}
        </button>
      </div>
    </div>
  );
}

/** A day's spending (expenses less refunds) and money in, counting posted entries only. */
function dayTotals(txs: Transaction[]): [spent: Cents, inc: Cents] {
  let spent = 0;
  let inc = 0;
  for (const t of txs) {
    if (t.status !== 'posted') continue;
    if (t.type === 'expense') spent += t.amountCents;
    if (t.type === 'refund') spent -= t.amountCents;
    if (t.type === 'income') inc += t.amountCents;
  }
  return [spent, inc];
}

function dayLabel(date: string, today: string): string {
  const d = diffDays(date, today);
  if (d === 0) return S.home.today;
  if (d === 1) return S.home.yesterday;
  return d > 0 && d < 7 ? fmtWeekday(date) : fmtDate(date);
}

function meta(t: Transaction, catName: (id?: string) => string | undefined, acct: (id?: string) => string): string {
  const time = t.enteredAt && t.enteredAt.slice(0, 10) === t.date ? new Date(t.enteredAt).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
  const what = t.type === 'transfer' ? S.txType.transfer : t.splits?.length ? t.splits.map((x) => catName(x.categoryId)).join(' + ') : t.merchant ? catName(t.categoryId) : undefined;
  return [what, t.type !== 'transfer' ? acct(t.accountId) : undefined, t.status === 'pending' ? S.status.pending : undefined, time].filter(Boolean).join(' · ');
}


function EditTx(props: {
  tx: Transaction;
  categories: Category[];
  onSave: (p: { amountCents: Cents; date: string; merchant: string; note: string; categoryId?: string; splits: Split[] }) => Promise<void>;
  onDone: () => void;
}) {
  const t = props.tx;
  const [amount, setAmount] = useState<Cents | undefined>(t.amountCents);
  const [date, setDate] = useState(t.date);
  const [merchant, setMerchant] = useState(t.merchant ?? '');
  const [note, setNote] = useState(t.note ?? '');
  const [categoryId, setCategoryId] = useState(t.categoryId);
  const [splits, setSplits] = useState<Split[]>(t.splits ?? []);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!amount) return;
        await props.onSave({ amountCents: amount, date, merchant, note, ...(categoryId ? { categoryId } : {}), splits: splits.filter((s) => s.amountCents > 0) });
        props.onDone();
      }}
    >
      <MoneyInput label={S.common.amount} value={amount} onChange={setAmount} />
      <label>{S.common.date} <input type="date" value={date} onInput={(e) => setDate((e.target as HTMLInputElement).value)} /></label>
      <label>{S.common.merchant} <input value={merchant} onInput={(e) => setMerchant((e.target as HTMLInputElement).value)} /></label>
      <label>{S.common.note} <input value={note} onInput={(e) => setNote((e.target as HTMLInputElement).value)} /></label>
      {t.type !== 'transfer' && (
        <>
          {splits.length === 0 && (
            <label>{S.common.category} <CategorySelect categories={props.categories} value={categoryId} onChange={setCategoryId} /></label>
          )}
          <fieldset>
            <legend>{S.transactions.split}</legend>
            {splits.map((sp, k) => (
              <div key={k}>
                <CategorySelect categories={props.categories} value={sp.categoryId} allowNone={false} onChange={(id) => setSplits(splits.map((x, j) => (j === k ? { ...x, categoryId: id ?? '' } : x)))} />{' '}
                <MoneyInput value={sp.amountCents || undefined} onChange={(c) => setSplits(splits.map((x, j) => (j === k ? { ...x, amountCents: c ?? 0 } : x)))} />{' '}
                <button type="button" onClick={() => setSplits(splits.filter((_, j) => j !== k))}>{S.common.remove}</button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setSplits([...splits, { categoryId: categoryId ?? props.categories[0]?.id ?? '', amountCents: Math.max(0, (amount ?? 0) - splits.reduce((s, x) => s + x.amountCents, 0)) }])}
            >
              {S.add.addSplit}
            </button>
          </fieldset>
        </>
      )}
      <button type="submit">{S.common.save}</button> <button type="button" onClick={props.onDone}>{S.common.cancel}</button>
    </form>
  );
}
