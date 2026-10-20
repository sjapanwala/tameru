// Upcoming (the bell on Home): what needs a look (bills waiting to be confirmed, repeats
// spotted in spending), a timeline of the next two weeks of bills and paydays, and every
// recurring item, each opening a sheet. Adding one is a sheet too.

import { useState } from 'preact/hooks';
import { fmtDate, fmtWeekday, S } from '../../copy/strings';
import { diffDays } from '../../domain/dates';
import { isBudgetCategory } from '../../domain/defaults';
import type { Cents, Frequency, RecurringItem, RecurringKind } from '../../domain/types';
import { orderedAccounts } from '../../services/accounts';
import { acceptDetection, detectedSuggestions, dismissDetection } from '../../services/detection';
import { archiveRecurring, createRecurring, listRecurring, pendingRecurring, upcoming } from '../../services/recurring';
import { confirmTransaction, deleteTransaction } from '../../services/transactions';
import { Amount, CategorySelect, ChipSelect, Message, monogram, MoneyInput, PageHeader, Switch } from '../components';
import { addAllToCalendar, googleCalendarLink, saveToCalendar } from '../calendar';
import { calendarItems } from '../../services/calendar';
import { useApp, useLoad } from '../hooks';
import { ArrowDownLeft, CalendarIcon, ChevronRight, PlusIcon } from '../Icons';
import { Sheet } from '../Sheet';

const DAYS_AHEAD = 14;
type Tab = 'bills' | 'income';

export function Recurring() {
  const { app, bump } = useApp();
  const items = useLoad(listRecurring);
  const pending = useLoad(pendingRecurring) ?? [];
  const detected = useLoad(detectedSuggestions) ?? [];
  const soon = useLoad((a) => upcoming(a, DAYS_AHEAD, ['bill', 'subscription', 'income'])) ?? [];
  const [tab, setTab] = useState<Tab>('bills');
  const [open, setOpen] = useState<string | 'new' | null>(null);
  const [msg, setMsg] = useState<string>();
  if (!items) return <div class="placeholder" />;
  const today = app.clock.today();
  const name = (id?: string) => items.find((x) => x.item.id === id)?.item.name;

  const out = soon.filter((u) => u.item.kind !== 'income').reduce((s, u) => s + u.amountCents, 0);
  const inn = soon.filter((u) => u.item.kind === 'income').reduce((s, u) => s + u.amountCents, 0);
  const byDay = new Map<string, typeof soon>();
  for (const u of soon) byDay.set(u.date, [...(byDay.get(u.date) ?? []), u]);
  const listed = items.filter((x) => (tab === 'income' ? x.item.kind === 'income' : x.item.kind !== 'income')).sort((a, b) => (a.next ?? '9').localeCompare(b.next ?? '9'));
  const selected = items.find((x) => x.item.id === open);
  const dayLabel = (d: string) => {
    const n = diffDays(today, d);
    return n === 0 ? S.home.today : n === 1 ? S.upcoming.tomorrow : n < 7 ? fmtWeekday(d) : fmtDate(d);
  };

  return (
    <section class="upcoming">
      <PageHeader
        eyebrow={S.upcoming.eyebrow}
        title={S.upcoming.title}
        action={
          <button type="button" class="icon-btn icon-btn--plain" aria-label={S.recurring.add} onClick={() => setOpen('new')}>
            <PlusIcon />
          </button>
        }
      />

      {(pending.length > 0 || detected.length > 0) && (
        <>
          <div class="section-head">
            <h2>{S.upcoming.needsLook}</h2>
          </div>
          <div class="notice-list">
            {pending.map((t) => (
              <div class="notice-card" key={t.id}>
                <span class="notice-card__text">
                  <strong>{name(t.recurringId) ?? t.merchant}</strong>
                  <small>{S.upcoming.pendingLine(t.amountCents, t.date)}</small>
                </span>
                <span class="notice-card__actions">
                  <button type="button" class="primary" onClick={() => confirmTransaction(app, t.id).then(bump)}>
                    {S.common.confirm}
                  </button>
                  <button type="button" onClick={() => deleteTransaction(app, t.id).then(bump)}>
                    {S.upcoming.skip}
                  </button>
                </span>
              </div>
            ))}
            {detected.map((d) => (
              <div class="notice-card" key={d.merchantKey}>
                <span class="notice-card__text">
                  <strong>{d.merchant}</strong>
                  <small>{S.upcoming.detectedLine(d.amountCents, S.freq[d.freq], d.occurrences)}</small>
                </span>
                <span class="notice-card__actions">
                  <button type="button" class="primary" onClick={() => acceptDetection(app, d).then(bump)}>
                    {S.recurring.track}
                  </button>
                  <button type="button" onClick={() => dismissDetection(app, d.merchantKey).then(bump)}>
                    {S.upcoming.notRepeat}
                  </button>
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <div class="summary-card upcoming-card">
        <p class="summary-card__label">{S.upcoming.nextDays(DAYS_AHEAD)}</p>
        <div class="upcoming-card__nums">
          <p>
            <span class="upcoming-card__k">{S.upcoming.goingOut}</span>
            <Amount c={out} />
          </p>
          <p>
            <span class="upcoming-card__k">{S.upcoming.comingIn}</span>
            <Amount c={inn} sign="+" />
          </p>
        </div>
      </div>

      <button type="button" class="calendar-row" onClick={async () => setMsg(await addAllToCalendar(app))}>
        <CalendarIcon />
        <span>
          <strong>{S.calendar.addAll}</strong>
          <small>{S.calendar.addAllSub}</small>
        </span>
        <ChevronRight />
      </button>
      <Message text={msg} />

      {soon.length === 0 ? (
        <p class="muted empty">{S.upcoming.nothingSoon}</p>
      ) : (
        [...byDay].map(([date, list]) => (
          <div class="day" key={date}>
            <div class="day__head">
              <span>{dayLabel(date)}</span>
              <span>
                {S.upcoming.dayTotal(
                  list.filter((u) => u.item.kind !== 'income').reduce((s, u) => s + u.amountCents, 0),
                  list.filter((u) => u.item.kind === 'income').reduce((s, u) => s + u.amountCents, 0),
                )}
              </span>
            </div>
            <ul class="txlist">
              {list.map((u) => (
                <li key={`${u.item.id}:${u.date}`}>
                  <button type="button" class="txrow" onClick={() => setOpen(u.item.id)}>
                    <span class="avatar" aria-hidden="true">
                      {u.item.kind === 'income' ? <ArrowDownLeft /> : monogram(u.item.name)}
                    </span>
                    <span class="txlist__main">
                      <span class="txlist__title">{u.item.name}</span>
                      <span class="txlist__meta">{S.recurring.kind[u.item.kind]}</span>
                    </span>
                    <span class="txlist__amt">
                      <Amount c={u.item.kind === 'income' ? u.amountCents : -u.amountCents} sign={u.item.kind === 'income' ? '+' : undefined} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}

      <div class="section-head">
        <h2>{S.upcoming.allRecurring}</h2>
      </div>
      <div class="segmented" role="radiogroup" aria-label={S.upcoming.allRecurring}>
        <span class="segmented__thumb" style={{ width: 'calc((100% - 6px) / 2)', transform: `translateX(${tab === 'income' ? 100 : 0}%)` }} />
        {(['bills', 'income'] as const).map((t) => (
          <button type="button" role="radio" aria-checked={tab === t} key={t} onClick={() => setTab(t)}>
            {t === 'bills' ? S.recurring.bills : S.recurring.income}
          </button>
        ))}
      </div>
      <ul class="plan-list upcoming-list">
        {listed.length === 0 && <p class="muted">{S.common.none}</p>}
        {listed.map(({ item, next, amountCents }) => (
          <li key={item.id}>
            <button type="button" class="plan-row" onClick={() => setOpen(item.id)}>
              <span class="plan-row__main">
                <strong>{item.name}</strong>
                <small>
                  {S.freq[item.schedule.freq]} · {S.recurring.next(next)}
                </small>
              </span>
              <span class="plan-row__amt">
                <Amount c={amountCents} />
                {'minCents' in item.amount && <small>{S.upcoming.range(item.amount.minCents, item.amount.maxCents)}</small>}
              </span>
              <ChevronRight />
            </button>
          </li>
        ))}
      </ul>

      {open && (
        <Sheet label={S.upcoming.title} onClose={() => setOpen(null)}>
          <div class="onb-sheet">
            {open === 'new' ? (
              <NewRecurringForm onDone={() => (setOpen(null), bump())} />
            ) : (
              selected && <RecurringDetails item={selected.item} next={selected.next} amountCents={selected.amountCents} onStop={() => archiveRecurring(app, selected.item.id).then(() => (setOpen(null), bump()))} />
            )}
          </div>
        </Sheet>
      )}
    </section>
  );
}

function RecurringDetails(props: { item: RecurringItem; next?: string; amountCents: Cents; onStop: () => void }) {
  const { item } = props;
  const accounts = useLoad(orderedAccounts) ?? [];
  const categories = useLoad((a) => a.repos.categories.all()) ?? [];
  const cal = useLoad((a) => calendarItems(a, item.id), [item.id])?.[0];
  const rows: [string, string][] = [
    [S.add.type, S.recurring.kind[item.kind]],
    [S.recurring.howOften, S.freq[item.schedule.freq]],
    [S.recurring.nextDate, props.next ? fmtWeekday(props.next) : '—'],
    ...('minCents' in item.amount ? ([[S.recurring.range, S.upcoming.range(item.amount.minCents, item.amount.maxCents)]] as [string, string][]) : []),
    ...(item.kind !== 'income' ? ([[S.common.category, categories.find((c) => c.id === item.categoryId)?.name ?? '—']] as [string, string][]) : []),
    [item.kind === 'income' ? S.upcoming.depositTo : S.upcoming.paidFrom, item.accountIds.map((id) => accounts.find((a) => a.id === id)?.name).filter(Boolean).join(', ') || '—'],
  ];
  return (
    <div class="tx-details">
      <p class="eyebrow">{S.recurring.kind[item.kind]}</p>
      <h2>{item.name}</h2>
      <p class="tx-details__amount">
        <Amount c={item.kind === 'income' ? props.amountCents : -props.amountCents} sign={item.kind === 'income' ? '+' : undefined} />
      </p>
      <ul class="receipt">
        {rows.map(([k, v]) => (
          <li key={k}>
            <span>{k}</span>
            <span class="leader" />
            <span>{v}</span>
          </li>
        ))}
      </ul>
      {cal && (
        <div class="calendar-actions">
          <button type="button" class="block" onClick={() => saveToCalendar([cal], `${item.name.replace(/[^\w-]+/g, '-').toLowerCase() || 'reminder'}.ics`)}>
            <CalendarIcon /> {S.calendar.addOne}
          </button>
          <a class="link" href={googleCalendarLink(cal)} target="_blank" rel="noopener">
            {S.calendar.google}
          </a>
        </div>
      )}
      {item.system ? (
        <p class="muted">{S.recurring.feeNote}</p>
      ) : (
        <div class="sheet__actions">
          <button type="button" class="link" onClick={props.onStop}>
            {S.recurring.stop}
          </button>
        </div>
      )}
    </div>
  );
}

const FREQS: Frequency[] = ['weekly', 'biweekly', 'semimonthly', 'monthly', 'yearly', 'irregular'];

function NewRecurringForm({ onDone }: { onDone: () => void }) {
  const { app } = useApp();
  const accounts = useLoad(orderedAccounts)?.filter((a) => !a.archived && a.type !== 'investing') ?? [];
  const categories = useLoad((a) => a.repos.categories.all())?.filter(isBudgetCategory) ?? [];
  const [name, setName] = useState('');
  const [kind, setKind] = useState<RecurringKind>('bill');
  const [varies, setVaries] = useState(false);
  const [amount, setAmount] = useState<Cents>();
  const [max, setMax] = useState<Cents>();
  const [freq, setFreq] = useState<Frequency>('monthly');
  const [nextDate, setNextDate] = useState(app.clock.today());
  const [categoryId, setCategoryId] = useState<string>();
  const [payFrom, setPayFrom] = useState<string[]>([]);
  const ok = name.trim() && amount !== undefined && (!varies || max !== undefined);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!ok) return;
        const ids = payFrom.length ? payFrom : accounts[0] ? [accounts[0].id] : [];
        await createRecurring(app, {
          name,
          kind,
          ...(varies && amount !== undefined && max !== undefined ? { range: { minCents: Math.min(amount, max), maxCents: Math.max(amount, max) } } : { amountCents: amount ?? 0 }),
          freq,
          nextDate,
          accountIds: ids,
          merchant: name,
          ...(categoryId && kind !== 'income' ? { categoryId } : {}),
          ...(freq === 'irregular' ? { irregularMonthlyCents: amount ?? 0 } : {}),
        });
        onDone();
      }}
    >
      <h2>{S.recurring.add}</h2>
      <ChipSelect label={S.add.type} options={(['bill', 'subscription', 'income'] as const).map((k) => ({ value: k, label: S.recurring.kind[k] }))} value={kind} onChange={setKind} />
      <label class="field">
        {S.common.name}
        <input value={name} autoFocus autoCapitalize="words" placeholder={kind === 'income' ? S.onboarding.incomeNamePlaceholder : S.upcoming.namePlaceholder} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
      </label>
      <div class={`field-pair${varies ? ' field-pair--two' : ''}`}>
        <label class="field field--money">
          {varies ? S.recurring.min : S.common.amount}
          <span class="field__box">
            <span class="field__cur">$</span>
            <MoneyInput value={amount} onChange={setAmount} />
          </span>
        </label>
        {varies && (
          <label class="field field--money">
            {S.recurring.max}
            <span class="field__box">
              <span class="field__cur">$</span>
              <MoneyInput value={max} onChange={setMax} />
            </span>
          </label>
        )}
      </div>
      <Switch label={S.recurring.range} checked={varies} onChange={setVaries} />
      <p class="field-label">{S.recurring.howOften}</p>
      <ChipSelect label={S.recurring.howOften} options={FREQS.map((f) => ({ value: f, label: S.freq[f] }))} value={freq} onChange={setFreq} />
      <label class="field">
        {S.recurring.nextDate}
        <input type="date" value={nextDate} onInput={(e) => setNextDate((e.target as HTMLInputElement).value)} />
      </label>
      {kind !== 'income' && (
        <label class="field">
          {S.common.category}
          <CategorySelect categories={categories} value={categoryId} onChange={setCategoryId} />
        </label>
      )}
      {accounts.length > 1 && (
        <>
          <p class="field-label">{kind === 'income' ? S.upcoming.depositTo : S.recurring.payFrom}</p>
          <div class="chip-select">
            {accounts.map((a) => {
              const on = payFrom.includes(a.id);
              return (
                <button type="button" key={a.id} class={`chip${on ? ' on' : ''}`} aria-pressed={on} onClick={() => setPayFrom(on ? payFrom.filter((x) => x !== a.id) : [...payFrom, a.id])}>
                  {a.name}
                  {payFrom[0] === a.id && payFrom.length > 1 && <small> {S.recurring.defaultMark}</small>}
                </button>
              );
            })}
          </div>
        </>
      )}
      <div class="sheet__actions">
        <button type="submit" class="primary block" disabled={!ok}>
          {S.common.add}
        </button>
      </div>
    </form>
  );
}
