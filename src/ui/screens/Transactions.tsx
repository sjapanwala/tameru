// Activity: every transaction, grouped by day, with search, a type filter, and a
// summary of this period. Tap a row for details. Upload or photograph a receipt to scan it.

import { useMemo, useRef, useState } from 'preact/hooks';
import { fmtDate, fmtWeekday, money, S } from '../../copy/strings';
import { addDays, diffDays } from '../../domain/dates';
import { isBudgetCategory } from '../../domain/defaults';
import { merchantKey } from '../../domain/merchant';
import { RECEIPT_TYPES } from '../../domain/receipt';
import type { Account, Category, Cents, Split, Transaction } from '../../domain/types';
import { currentPeriod } from '../../services/plan';
import { confirmTransaction, deleteTransaction, listByDay, recategorise, restoreTransaction, TxValidationError, updateTransaction } from '../../services/transactions';
import { Amount, CategorySelect, Message, monogram, MoneyInput, PageHeader } from '../components';
import { useApp, useLoad } from '../hooks';
import { ArrowDownLeft, CameraIcon, PencilIcon, PlusIcon, SearchIcon, SwapIcon, TrashIcon, UploadIcon } from '../Icons';
import { ReceiptScanner } from '../ReceiptScanner';
import { Sheet } from '../Sheet';
import { SwipeRow } from '../SwipeRow';
import { toast } from '../toast';
import { orderedAccounts } from '../../services/accounts';

type Filter = 'all' | 'spent' | 'income' | 'transfer';
const FILTERS: Filter[] = ['all', 'spent', 'income', 'transfer'];

const matchesFilter = (t: Transaction, f: Filter) =>
  f === 'all' || (f === 'spent' ? t.type === 'expense' || t.type === 'refund' : f === 'income' ? t.type === 'income' : t.type === 'transfer');

export function Transactions() {
  const { app, bump } = useApp();
  const [days, setDays] = useState(60);
  const today = app.clock.today();
  const groups = useLoad((a) => listByDay(a, addDays(today, -days), addDays(today, 31)), [days]);
  const period = useLoad(currentPeriod);
  const periodTxs = useLoad(async (a) => (period ? a.repos.transactions.inRange(period.start, today) : []), [period?.start]);
  const accounts = useLoad(orderedAccounts) ?? [];
  const categories = useLoad((a) => a.repos.categories.all()) ?? [];
  const budgetCats = categories.filter(isBudgetCategory).sort((a, b) => a.sortOrder - b.sortOrder);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string>();
  const [editing, setEditing] = useState(false); // opened by swiping right: straight to the edit form
  const [msg, setMsg] = useState<string>();
  const [scanning, setScanning] = useState<File | null>(null);
  const lastSource = useRef<'upload' | 'camera'>('upload');
  const uploadRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

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
              matchesFilter(t, filter) &&
              (!q || merchantKey(`${t.merchant ?? ''} ${catName(t.categoryId) ?? ''} ${acct(t.accountId)} ${t.note ?? ''}`).includes(q)),
          ),
        }))
        .filter((g) => g.transactions.length > 0),
    [groups, filter, q, categories.length, accounts.length],
  );

  // This period's totals and a 14-day spending sparkline for the summary card.
  const summary = useMemo(() => {
    const txs = (periodTxs ?? []).filter((t) => t.status === 'posted');
    const spent = txs.reduce((s, t) => s + (t.type === 'expense' ? t.amountCents : t.type === 'refund' ? -t.amountCents : 0), 0);
    const received = txs.reduce((s, t) => s + (t.type === 'income' ? t.amountCents : 0), 0);
    const bars = Array.from({ length: 14 }, (_, i) => {
      const d = addDays(today, i - 13);
      return (groups ?? []).find((g) => g.date === d)?.spentCents ?? 0;
    });
    return { spent, received, bars, max: Math.max(1, ...bars) };
  }, [periodTxs, groups, today]);

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

  const onReceipt = (input: HTMLInputElement | null, source: 'upload' | 'camera') => {
    const file = input?.files?.[0];
    if (!file) return;
    input!.value = '';
    lastSource.current = source;
    setScanning(file);
  };
  const pickAgain = () => {
    setScanning(null);
    (lastSource.current === 'camera' ? cameraRef : uploadRef).current?.click();
  };

  const selected = open ? groups?.flatMap((g) => g.transactions).find((t) => t.id === open) : undefined;
  if (!groups) return <div class="placeholder" />;

  return (
    <section class="activity">
      <PageHeader
        title={S.transactions.title}
        action={
          <div class="head-actions">
            <button type="button" class="icon-btn icon-btn--soft" aria-label={S.transactions.upload} onClick={() => uploadRef.current?.click()}>
              <UploadIcon />
            </button>
            <button type="button" class="icon-btn icon-btn--soft" aria-label={S.transactions.photo} onClick={() => cameraRef.current?.click()}>
              <CameraIcon />
            </button>
            <a class="icon-btn icon-btn--plain" href="#/add" aria-label={S.nav.add}>
              <PlusIcon />
            </a>
          </div>
        }
      />
      <input ref={uploadRef} type="file" accept={RECEIPT_TYPES} hidden onChange={(e) => onReceipt(e.target as HTMLInputElement, 'upload')} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => onReceipt(e.target as HTMLInputElement, 'camera')} />

      <div class="summary-card">
        <div class="summary-card__nums">
          <div>
            <p class="summary-card__label">{S.transactions.periodSpent}</p>
            <p class="summary-card__amount">
              <Amount c={summary.spent} />
            </p>
          </div>
          <div class="summary-card__in">
            <p class="summary-card__label">{S.transactions.periodIn}</p>
            <p class="num">+{money(summary.received)}</p>
          </div>
        </div>
        <div class="spark" aria-hidden="true">
          {summary.bars.map((v, i) => (
            <span key={i} class={i === 13 ? 'today' : ''} style={{ height: `${Math.max(6, (v / summary.max) * 100)}%`, animationDelay: `${i * 25}ms` }} />
          ))}
        </div>
      </div>

      <label class="search">
        <SearchIcon />
        <input type="search" value={query} placeholder={S.transactions.search} aria-label={S.transactions.search} onInput={(e) => setQuery((e.target as HTMLInputElement).value)} />
      </label>

      <div class="segmented segmented--filters" role="radiogroup" aria-label={S.transactions.title}>
        <span class="segmented__thumb" style={{ width: `calc((100% - 6px) / ${FILTERS.length})`, transform: `translateX(${FILTERS.indexOf(filter) * 100}%)` }} />
        {FILTERS.map((f) => (
          <button type="button" role="radio" aria-checked={filter === f} key={f} onClick={() => setFilter(f)}>
            {S.transactions.filters[f]}
          </button>
        ))}
      </div>

      <Message text={msg} />
      {shown.length === 0 && <p class="muted empty">{query || filter !== 'all' ? S.transactions.noMatch : S.common.none}</p>}

      {shown.map((g) => (
        <div class="day" key={g.date}>
          <div class="day__head">
            <span>{dayLabel(g.date, today)}</span>
            <span>{S.transactions.dayTotal(g.spentCents, g.inCents)}</span>
          </div>
          <ul class="txlist">
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

      {scanning && (
        <Sheet label={S.receipt.title} onClose={() => setScanning(null)}>
          <ReceiptScanner key={scanning.name + scanning.size + scanning.lastModified} file={scanning} onClose={() => setScanning(null)} onRetake={pickAgain} />
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
