import { useState } from 'preact/hooks';
import { fmtDate, money, S } from '../../copy/strings';
import { sparkPath } from '../../domain/accountInsights';
import type { AccountType, CardFace as CardFaceT, Category, Cents, Compounding, Transaction } from '../../domain/types';
import { CardFace, CardPicker, useCatalog } from '../cards';
import { CardMenu } from '../CardMenu';
import { accountInsights, createAccount, listAccounts, removeAccount, reorderAccounts, restoreAccount, updateAccount, type AccountView } from '../../services/accounts';
import { Carousel } from '../Carousel';
import { Amount, monogram, MoneyInput, PageHeader } from '../components';
import { ArrangeIcon, PencilIcon, PlusIcon, SwapIcon, TrashIcon } from '../Icons';
import { useApp, useLoad } from '../hooks';
import { useTween } from '../motion';
import { RearrangeGrid } from '../RearrangeGrid';
import { useRoute } from '../router';
import { Sheet } from '../Sheet';
import { toast } from '../toast';
import { useLongPress } from '../useLongPress';

export function Accounts() {
  const { app, bump } = useApp();
  const views = useLoad(listAccounts);
  const txs = useLoad((a) => a.repos.transactions.all());
  const categories = useLoad((a) => a.repos.categories.all());
  const catalog = useCatalog();
  const wanted = useRoute().params.get('id'); // card tapped in Home's wallet
  const [index, setIndex] = useState(0);
  // Hold a card → menu; the menu leads to edit, rearrange (jiggle mode) or remove.
  const [menu, setMenu] = useState<{ view: AccountView; rect: DOMRect } | null>(null);
  const [editing, setEditing] = useState<AccountView | null>(null);
  const [removing, setRemoving] = useState<AccountView | null>(null);
  const [rearranging, setRearranging] = useState(false);
  const hold = useLongPress((el) => {
    const v = views?.[index];
    if (v) setMenu({ view: v, rect: el.getBoundingClientRect() });
  });
  if (!views || !txs) return <div class="placeholder" />;
  const initial = Math.max(0, views.findIndex((v) => v.account.id === wanted));
  const count = views.length + 1; // last slide: add an account
  const current = views[index];

  const remove = async (v: AccountView) => {
    setRemoving(null);
    const removed = await removeAccount(app, v.account.id);
    bump();
    toast(S.accounts.removed(v.account.name), {
      label: S.common.undo,
      run: async () => {
        await restoreAccount(app, removed);
        bump();
      },
    });
  };

  if (rearranging)
    return (
      <section>
        <PageHeader title={S.accounts.rearrangeTitle} />
        <RearrangeGrid
          accounts={views.map((v) => v.account)}
          catalog={catalog}
          hint={S.accounts.rearrangeHint}
          doneLabel={S.common.done}
          onDone={async (ids) => {
            setRearranging(false);
            await reorderAccounts(app, ids);
            bump();
          }}
        />
      </section>
    );

  return (
    <section>
      <PageHeader
        title={S.accounts.title}
        action={
          <a class="icon-btn icon-btn--plain" href="#/add?type=transfer" aria-label={S.accounts.transfer}>
            <SwapIcon />
          </a>
        }
      />
      <Carousel
        key={wanted ?? ''}
        initial={initial}
        count={count}
        label={S.accounts.title}
        prevLabel={S.accounts.prev}
        nextLabel={S.accounts.next}
        onChange={setIndex}
        renderSlide={(i, active) =>
          i < views.length ? (
            <div class="slide-hold" {...(active ? hold : {})}>
              <CardFace account={views[i]!.account} catalog={catalog} />
            </div>
          ) : (
            <div class="cardface cardface--new">
              <PlusIcon />
              <span>{S.accounts.add}</span>
            </div>
          )
        }
      />
      {current && <p class="hold-hint">{S.accounts.holdHint}</p>}
      <div class="account-panel" key={current?.account.id ?? 'new'}>
        {current ? <AccountDetails v={current} txs={txs} categories={categories ?? []} /> : <NewAccountForm onDone={bump} />}
      </div>

      {menu && (
        <CardMenu
          rect={menu.rect}
          card={<CardFace account={menu.view.account} catalog={catalog} />}
          onClose={() => setMenu(null)}
          items={[
            { label: S.accounts.menu.edit, icon: <PencilIcon />, run: () => setEditing(menu.view) },
            { label: S.accounts.menu.rearrange, icon: <ArrangeIcon />, run: () => setRearranging(true) },
            { label: S.accounts.menu.remove, icon: <TrashIcon />, destructive: true, run: () => setRemoving(menu.view) },
          ]}
        />
      )}
      {editing && (
        <Sheet label={S.accounts.menu.edit} onClose={() => setEditing(null)}>
          <EditAccount
            v={editing}
            onDone={() => {
              setEditing(null);
              bump();
            }}
          />
        </Sheet>
      )}
      {removing && (
        <Sheet label={S.accounts.removeTitle(removing.account.name)} onClose={() => setRemoving(null)}>
          <div class="confirm">
            <h2>{S.accounts.removeTitle(removing.account.name)}</h2>
            <p class="muted">{S.accounts.removeBody}</p>
            {headlineOf(removing) !== 0 && <p class="note">{S.accounts.removeBalance(Math.abs(headlineOf(removing)), removing.account.type === 'credit_card')}</p>}
            <button type="button" class="primary block" onClick={() => remove(removing)}>
              {S.accounts.removeConfirm}
            </button>
            <button type="button" class="link" onClick={() => setRemoving(null)}>
              {S.accounts.keep}
            </button>
          </div>
        </Sheet>
      )}
    </section>
  );
}

/** The figure an account leads with: amount owing for cards, contributions for investing, else balance. */
const headlineOf = (v: AccountView) =>
  v.account.type === 'credit_card' ? (v.owingCents ?? 0) : v.account.type === 'investing' ? (v.netContributedCents ?? 0) : v.balanceCents;

function AccountDetails({ v, txs, categories }: { v: AccountView; txs: Transaction[]; categories: Category[] }) {
  const a = v.account;
  const insights = useLoad((app) => accountInsights(app, a.id), [a.id]);
  const headline = headlineOf(v);
  // Rolls from the previous card's figure to this one's (the panel remounts per card).
  const shownHeadline = useTween(headline, 'account-panel', 800);
  const headlineLabel =
    a.type === 'credit_card' ? (v.owingCents ? S.accounts.owingLabel : S.accounts.inCreditLabel) : a.type === 'investing' ? S.accounts.contributedLabel : S.accounts.balance;
  const catName = (id?: string) => categories.find((c) => c.id === id)?.name;
  const recent = txs
    .filter((t) => (t.accountId === a.id || t.toAccountId === a.id) && t.status !== 'skipped')
    .sort((x, y) => y.date.localeCompare(x.date))
    .slice(0, 4);

  // The trend follows the headline: amount owing for cards, otherwise the balance.
  const series = (insights?.trend.series ?? []).map((d) => (a.type === 'credit_card' ? Math.max(0, -d.balanceCents) : d.balanceCents));
  const change = series.length > 1 ? series[series.length - 1]! - series[0]! : 0;

  const tiles: TileProps[] = [];
  const i = insights;
  if (a.type === 'credit_card' && i?.card) {
    tiles.push({
      label: S.accounts.tiles.due,
      value: S.accounts.dueIn(i.card.daysToDue),
      sub: fmtDate(i.card.due),
      strong: (v.owingCents ?? 0) > 0 && i.card.daysToDue <= 5,
    });
    tiles.push({ label: S.accounts.tiles.statement, value: fmtDate(i.card.statement), sub: S.accounts.tiles.statementSub });
    if (i.creditUsed !== undefined) tiles.push({ label: S.accounts.tiles.creditUsed, value: `${Math.round(i.creditUsed * 100)}%`, bar: i.creditUsed });
    if ((a.card?.monthlyFeeCents ?? 0) > 0) tiles.push({ label: S.accounts.monthlyFee, value: <Amount c={a.card!.monthlyFeeCents} />, sub: S.accounts.tiles.perMonth });
  }
  if (a.type === 'savings' && a.interest) {
    tiles.push({ label: S.accounts.rate, value: `${(a.interest.rateBps / 100).toFixed(2)}%`, sub: a.interest.kind.toUpperCase() });
    tiles.push({ label: S.accounts.tiles.thisMonth, value: <Amount c={v.interestAccruedCents ?? 0} sign="+" />, sub: S.accounts.tiles.building });
    if (i?.nextInterest) tiles.push({ label: S.accounts.tiles.nextInterest, value: fmtDate(i.nextInterest), sub: S.accounts.tiles.paidIn });
    tiles.push({ label: S.accounts.interestEarned, value: <Amount c={v.interestEarnedCents ?? 0} />, sub: S.accounts.tiles.soFar });
  }
  if ((a.type === 'chequing' || a.type === 'cash') && i) {
    tiles.push({ label: S.accounts.tiles.in, value: <Amount c={i.flows.inCents} sign="+" />, sub: S.accounts.tiles.thisMonthSub });
    tiles.push({ label: S.accounts.tiles.out, value: <Amount c={-i.flows.outCents} />, sub: S.accounts.tiles.thisMonthSub });
  }
  if (a.type === 'investing' && i) {
    tiles.push({ label: S.accounts.tiles.thisYear, value: <Amount c={i.yearContributedCents ?? 0} sign="+" />, sub: S.accounts.tiles.contributed });
  }
  if (v.pendingCents !== 0) tiles.push({ label: S.status.pending, value: <Amount c={v.pendingCents} />, sub: S.accounts.tiles.awaiting });
  if (a.face?.last4) tiles.push({ label: S.cards.last4Short, value: `•••• ${a.face.last4}` });

  return (
    <div class="acct">
      <div class="acct__head">
        <p class="eyebrow">{S.accountType[a.type]}</p>
        <h2>{a.name}</h2>
        <p class="acct__amount">
          <Amount c={shownHeadline} />
        </p>
        <p class="acct__sub">
          {headlineLabel}
          {series.length > 1 && change !== 0 && (
            <span class="chip-change">
              {change > 0 ? '↑' : '↓'} {money(Math.abs(change))} · {S.accounts.days(series.length)}
            </span>
          )}
        </p>
      </div>

      {series.length > 1 && <Sparkline values={series} label={S.accounts.trendLabel(series.length)} />}

      {tiles.length > 0 && (
        <div class="tiles">
          {tiles.map((t) => (
            <Tile key={t.label} {...t} />
          ))}
        </div>
      )}

      {insights && insights.upcoming.length > 0 && (
        <>
          <div class="section-head">
            <h2>{S.accounts.comingUp}</h2>
          </div>
          <ul class="txlist">
            {insights.upcoming.map((u) => (
              <li key={`${u.name}${u.date}`}>
                <span class="avatar" aria-hidden="true">
                  {monogram(u.name)}
                </span>
                <span class="txlist__main">
                  <span class="txlist__title">{u.name}</span>
                  <span class="txlist__meta">{fmtDate(u.date)}</span>
                </span>
                <span class="txlist__amt">
                  <Amount c={u.income ? u.amountCents : -u.amountCents} sign={u.income ? '+' : undefined} />
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <div class="section-head">
        <h2>{S.home.recent}</h2>
        <a href="#/transactions">{S.home.viewAll}</a>
      </div>
      {recent.length === 0 ? (
        <p class="muted">{S.common.none}</p>
      ) : (
        <ul class="txlist">
          {recent.map((t) => {
            const out = t.type === 'expense' || (t.type === 'transfer' && t.accountId === a.id);
            const title = t.merchant ?? catName(t.categoryId) ?? S.txType[t.type];
            return (
              <li key={t.id}>
                <span class="avatar" aria-hidden="true">
                  {t.type === 'transfer' ? <SwapIcon /> : monogram(title)}
                </span>
                <span class="txlist__main">
                  <span class="txlist__title">{title}</span>
                  <span class="txlist__meta">{fmtDate(t.date)}</span>
                </span>
                <span class="txlist__amt">
                  <Amount c={out ? -t.amountCents : t.amountCents} sign={out ? undefined : '+'} />
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

interface TileProps {
  label: string;
  value: preact.ComponentChildren;
  sub?: string;
  strong?: boolean; // inverted: something that wants a glance soon
  bar?: number; // 0..1
}

function Tile({ label, value, sub, strong, bar }: TileProps) {
  return (
    <div class={`tile${strong ? ' tile--strong' : ''}`}>
      <span class="tile__label">{label}</span>
      <span class="tile__value">{value}</span>
      {bar !== undefined ? (
        <span class="tile__bar">
          <span style={{ width: `${Math.round(bar * 100)}%` }} />
        </span>
      ) : (
        sub && <span class="tile__sub">{sub}</span>
      )}
    </div>
  );
}

/** A soft line of the last few weeks, drawn in on mount. */
function Sparkline({ values, label }: { values: number[]; label: string }) {
  const W = 320;
  const H = 64;
  const { line, area } = sparkPath(values, W, H);
  return (
    <figure class="spark-line" aria-label={label}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="currentColor" stop-opacity="0.16" />
            <stop offset="1" stop-color="currentColor" stop-opacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#spark-fill)" class="spark-line__area" />
        <path d={line} fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke" pathLength={1} class="spark-line__line" />
      </svg>
      <figcaption>{label}</figcaption>
    </figure>
  );
}

function EditAccount({ v, onDone }: { v: AccountView; onDone: () => void }) {
  const { app } = useApp();
  const a = v.account;
  const [name, setName] = useState(a.name);
  const [rate, setRate] = useState(String((a.interest?.rateBps ?? 0) / 100));
  const [fee, setFee] = useState<Cents | undefined>(a.card?.monthlyFeeCents);
  const [face, setFace] = useState<CardFaceT | undefined>(a.face);
  const isCard = a.type === 'credit_card' || a.type === 'chequing';
  const save = async () => {
    await updateAccount(app, a.id, {
      name: name.trim() || a.name,
      ...(isCard ? { face } : {}),
      ...(a.interest ? { interest: { ...a.interest, rateBps: Math.round(Number(rate) * 100) || 0 } } : {}),
      ...(a.card ? { card: { ...a.card, monthlyFeeCents: fee ?? 0 } } : {}),
    });
    onDone();
  };
  return (
    <div class="edit-account">
      <h2>{S.accounts.menu.edit}</h2>
      <label>
        {S.common.name} <input value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
      </label>
      {a.interest && (
        <label>
          {S.accounts.rate} <input inputMode="decimal" value={rate} onInput={(e) => setRate((e.target as HTMLInputElement).value)} />
        </label>
      )}
      {a.card && <MoneyInput label={S.accounts.monthlyFee} value={fee} onChange={setFee} />}
      {isCard && <CardPicker value={face} onChange={setFace} kind={a.type === 'credit_card' ? 'credit' : 'debit'} fallbackName={name || a.name} />}
      <div class="sheet__actions">
        <button type="button" class="primary block" onClick={save}>
          {S.common.save}
        </button>
      </div>
    </div>
  );
}

function NewAccountForm({ onDone }: { onDone: () => void }) {
  const { app } = useApp();
  const [type, setType] = useState<AccountType>('chequing');
  const [name, setName] = useState('');
  const [balance, setBalance] = useState<Cents>();
  const [rate, setRate] = useState('');
  const [rateKind, setRateKind] = useState<'apy' | 'apr'>('apy');
  const [compounding, setCompounding] = useState<Compounding>('monthly');
  const [fee, setFee] = useState<Cents>();
  const [statementDay, setStatementDay] = useState('1');
  const [dueDay, setDueDay] = useState('22');
  const [face, setFace] = useState<CardFaceT>();
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        await createAccount(app, {
          name: name || S.accountType[type],
          type,
          openingBalanceCents: type === 'credit_card' ? -(balance ?? 0) : (balance ?? 0),
          ...(type === 'savings' ? { interest: { rateBps: Math.round(Number(rate) * 100) || 0, kind: rateKind, compounding } } : {}),
          ...(type === 'credit_card' ? { card: { monthlyFeeCents: fee ?? 0, statementDay: Number(statementDay) || 1, dueDay: Number(dueDay) || 22 } } : {}),
          ...(face && (type === 'credit_card' || type === 'chequing') ? { face } : {}),
        });
        setFace(undefined);
        setName('');
        setBalance(undefined);
        onDone();
      }}
    >
      <h2>{S.accounts.addTitle}</h2>
      <label>
        {S.add.type}{' '}
        <select value={type} onChange={(e) => setType((e.target as HTMLSelectElement).value as AccountType)}>
          {(Object.keys(S.accountType) as AccountType[]).map((t) => (
            <option key={t} value={t}>{S.accountType[t]}</option>
          ))}
        </select>
      </label>
      <label>{S.common.name} <input value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} /></label>
      <MoneyInput label={type === 'credit_card' ? S.accounts.openingOwing : S.accounts.openingBalance} value={balance} onChange={setBalance} />
      {type === 'savings' && (
        <>
          <label>{S.accounts.rate} <input inputMode="decimal" value={rate} onInput={(e) => setRate((e.target as HTMLInputElement).value)} /></label>
          <label>
            {S.accounts.rateKind}{' '}
            <select value={rateKind} onChange={(e) => setRateKind((e.target as HTMLSelectElement).value as 'apy' | 'apr')}>
              <option value="apy">{S.accounts.apy}</option>
              <option value="apr">{S.accounts.apr}</option>
            </select>
          </label>
          <label>
            {S.accounts.compounding}{' '}
            <select value={compounding} onChange={(e) => setCompounding((e.target as HTMLSelectElement).value as Compounding)}>
              {(['daily', 'monthly', 'quarterly', 'annually'] as const).map((c) => (
                <option key={c} value={c}>{S.accounts.compoundingOpt[c]}</option>
              ))}
            </select>
          </label>
        </>
      )}
      {type === 'credit_card' && (
        <>
          <MoneyInput label={S.accounts.monthlyFee} value={fee} onChange={setFee} />
          <label>{S.accounts.statementDay} <input type="number" min="1" max="31" value={statementDay} onInput={(e) => setStatementDay((e.target as HTMLInputElement).value)} /></label>
          <label>{S.accounts.dueDay} <input type="number" min="1" max="31" value={dueDay} onInput={(e) => setDueDay((e.target as HTMLInputElement).value)} /></label>
        </>
      )}
      {(type === 'credit_card' || type === 'chequing') && (
        <CardPicker value={face} onChange={setFace} kind={type === 'credit_card' ? 'credit' : 'debit'} fallbackName={name || S.accountType[type]} />
      )}
      <button type="submit">{S.common.add}</button>
    </form>
  );
}
