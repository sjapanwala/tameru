import { useState } from 'preact/hooks';
import { fmtDate, money, S } from '../../copy/strings';
import { isBudgetCategory } from '../../domain/defaults';
import type { Cents, Frequency, RecurringKind } from '../../domain/types';
import { acceptDetection, detectedSuggestions, dismissDetection } from '../../services/detection';
import { archiveRecurring, createRecurring, listRecurring, pendingRecurring } from '../../services/recurring';
import { confirmTransaction, deleteTransaction } from '../../services/transactions';
import { CategorySelect, MoneyInput, PageHeader } from '../components';
import { useApp, useLoad } from '../hooks';
import { orderedAccounts } from '../../services/accounts';

export function Recurring() {
  const { app, bump } = useApp();
  const items = useLoad(listRecurring);
  const pending = useLoad(pendingRecurring);
  const detected = useLoad(detectedSuggestions);
  if (!items) return <div class="placeholder" />;
  const section = (kinds: RecurringKind[]) =>
    items
      .filter((x) => kinds.includes(x.item.kind))
      .map(({ item, next, amountCents }) => (
        <li key={item.id}>
          {item.name} · {money(amountCents)}
          {'minCents' in item.amount && ` (${money(item.amount.minCents)}–${money(item.amount.maxCents)})`} · {S.freq[item.schedule.freq]} · {S.recurring.next(next)}{' '}
          {item.system ? <small>{S.recurring.feeNote}</small> : <button type="button" onClick={() => archiveRecurring(app, item.id).then(bump)}>{S.recurring.stop}</button>}
        </li>
      ));
  return (
    <section>
      <PageHeader title={S.recurring.title} />
      {pending && pending.length > 0 && (
        <>
          <h2>{S.recurring.pending}</h2>
          <ul>
            {pending.map((t) => (
              <li key={t.id}>
                {fmtDate(t.date)} · {items.find((x) => x.item.id === t.recurringId)?.item.name ?? t.merchant} · {money(t.amountCents)}{' '}
                <button type="button" onClick={() => confirmTransaction(app, t.id).then(bump)}>{S.common.confirm}</button>{' '}
                <button type="button" onClick={() => deleteTransaction(app, t.id).then(bump)}>{S.transactions.skip}</button>
              </li>
            ))}
          </ul>
        </>
      )}
      <h2>{S.recurring.income}</h2>
      <ul>{section(['income'])}</ul>
      <h2>{S.recurring.bills}</h2>
      <ul>{section(['bill', 'subscription'])}</ul>
      {detected && detected.length > 0 && (
        <>
          <h2>{S.recurring.detected}</h2>
          <ul>
            {detected.map((d) => (
              <li key={d.merchantKey}>
                {S.recurring.detectedLine(d.merchant, d.amountCents, S.freq[d.freq], d.occurrences)}{' '}
                <button type="button" onClick={() => acceptDetection(app, d).then(bump)}>{S.recurring.track}</button>{' '}
                <button type="button" onClick={() => dismissDetection(app, d.merchantKey).then(bump)}>{S.recurring.notRecurring}</button>
              </li>
            ))}
          </ul>
        </>
      )}
      <NewRecurringForm onDone={bump} />
    </section>
  );
}

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
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const ids = payFrom.length ? payFrom : accounts[0] ? [accounts[0].id] : [];
        await createRecurring(app, {
          name,
          kind,
          ...(varies && amount !== undefined && max !== undefined ? { range: { minCents: Math.min(amount, max), maxCents: Math.max(amount, max) } } : { amountCents: amount ?? 0 }),
          freq,
          nextDate,
          accountIds: ids,
          merchant: name,
          ...(categoryId ? { categoryId } : {}),
          ...(freq === 'irregular' ? { irregularMonthlyCents: amount ?? 0 } : {}),
        });
        setName('');
        setAmount(undefined);
        setMax(undefined);
        onDone();
      }}
    >
      <h2>{S.recurring.add}</h2>
      <label>
        {S.add.type}{' '}
        <select value={kind} onChange={(e) => setKind((e.target as HTMLSelectElement).value as RecurringKind)}>
          {(['bill', 'subscription', 'income'] as const).map((k) => (
            <option key={k} value={k}>{S.recurring.kind[k]}</option>
          ))}
        </select>
      </label>
      <label>{S.common.name} <input value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} /></label>
      <label>
        <input type="checkbox" checked={varies} onChange={(e) => setVaries((e.target as HTMLInputElement).checked)} /> {S.recurring.range}
      </label>
      <MoneyInput label={varies ? S.recurring.min : S.common.amount} value={amount} onChange={setAmount} />
      {varies && <MoneyInput label={S.recurring.max} value={max} onChange={setMax} />}
      <label>
        {S.recurring.howOften}{' '}
        <select value={freq} onChange={(e) => setFreq((e.target as HTMLSelectElement).value as Frequency)}>
          {(Object.keys(S.freq) as Frequency[]).map((f) => (
            <option key={f} value={f}>{S.freq[f]}</option>
          ))}
        </select>
      </label>
      <label>{S.recurring.nextDate} <input type="date" value={nextDate} onInput={(e) => setNextDate((e.target as HTMLInputElement).value)} /></label>
      {kind !== 'income' && (
        <label>{S.common.category} <CategorySelect categories={categories} value={categoryId} onChange={setCategoryId} /></label>
      )}
      <fieldset>
        <legend>{S.recurring.payFrom}</legend>
        {accounts.map((a) => (
          <label key={a.id}>
            <input
              type="checkbox"
              checked={payFrom.includes(a.id)}
              onChange={(e) => setPayFrom((e.target as HTMLInputElement).checked ? [...payFrom, a.id] : payFrom.filter((x) => x !== a.id))}
            />{' '}
            {a.name}
            {payFrom[0] === a.id && ` ${S.recurring.defaultMark}`}
          </label>
        ))}
      </fieldset>
      <button type="submit">{S.common.add}</button>
    </form>
  );
}
