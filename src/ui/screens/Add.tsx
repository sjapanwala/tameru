// Fast entry, presented as a sheet: type the amount on the keypad (or keyboard);
// category and account are already picked by the suggestion engine. One tap to save.

import { useEffect, useState } from 'preact/hooks';
import { S } from '../../copy/strings';
import { entryDisplay, entryToCents, keyFromKeyboard, pressKey, type KeypadKey } from '../../domain/amountEntry';
import { isBudgetCategory } from '../../domain/defaults';
import { centsToDecimal } from '../../domain/money';
import type { Split, TransactionType } from '../../domain/types';
import { suggestFor, type Suggestion } from '../../services/categorise';
import { addTransaction, TxValidationError } from '../../services/transactions';
import { CategorySelect, ChipSelect, MoneyInput } from '../components';
import { useApp, useLoad } from '../hooks';
import { Keypad } from '../Keypad';
import { haptic } from '../motion';
import { takeAddPrefill } from '../prefill';
import { toast } from '../toast';
import { orderedAccounts } from '../../services/accounts';

const TYPES = ['expense', 'income', 'refund', 'transfer'] as const;

export function Add({ onDone, initialType = 'expense' }: { onDone: () => void; initialType?: TransactionType }) {
  const { app, bump } = useApp();
  const accounts = useLoad(orderedAccounts)?.filter((a) => !a.archived) ?? [];
  const categories = useLoad((a) => a.repos.categories.all())?.filter(isBudgetCategory).sort((a, b) => a.sortOrder - b.sortOrder) ?? [];
  const goals = useLoad((a) => a.repos.goals.all())?.filter((g) => !g.archived) ?? [];

  // A scanned receipt (or other caller) can hand over a draft to confirm.
  const [prefill] = useState(takeAddPrefill);
  const [entry, setEntry] = useState(prefill?.amountCents ? centsToDecimal(prefill.amountCents).replace(/\.00$/, '') : '');
  const amount = entryToCents(entry);
  const [type, setType] = useState<TransactionType>(initialType);
  const [categoryId, setCategoryId] = useState<string>();
  const [accountId, setAccountId] = useState<string | undefined>(prefill?.accountId);
  const [toAccountId, setToAccountId] = useState<string>();
  const [merchant, setMerchant] = useState(prefill?.merchant ?? '');
  const [note, setNote] = useState(prefill?.note ?? '');
  const [date, setDate] = useState(prefill?.date ?? app.clock.today());
  const [splits, setSplits] = useState<Split[]>([]);
  const [goalId, setGoalId] = useState<string>();
  const [touched, setTouched] = useState({ category: false, account: !!prefill?.accountId });
  const [suggestion, setSuggestion] = useState<Suggestion>();
  const [error, setError] = useState<string>();
  const [shake, setShake] = useState(0);

  // Re-suggest as the amount or merchant changes, without overriding what the user picked.
  useEffect(() => {
    if (type === 'transfer') return;
    const t = setTimeout(() => {
      suggestFor(app, { amountCents: amount, merchant: merchant || undefined, type }).then((s) => {
        setSuggestion(s);
        if (!touched.category && s.categoryId) setCategoryId(s.categoryId);
        if (!touched.account && s.accountId) setAccountId(s.accountId);
      });
    }, 200);
    return () => clearTimeout(t);
  }, [amount, merchant, type, accounts.length]);

  const press = (k: KeypadKey) => {
    setError(undefined);
    setEntry((e) => pressKey(e, k));
  };

  const save = async () => {
    if (!amount) {
      setShake((n) => n + 1);
      haptic(20);
      return setError(S.errors.amountNeeded);
    }
    try {
      const realSplits = splits.filter((s) => s.amountCents > 0 && s.categoryId);
      await addTransaction(app, {
        amountCents: amount,
        type,
        date,
        accountId,
        ...(type === 'transfer' ? { toAccountId, ...(goalId ? { goalId } : {}) } : realSplits.length ? { splits: realSplits } : categoryId ? { categoryId } : {}),
        merchant,
        note,
      });
      haptic(12);
      toast(S.add.saved(amount));
      bump();
      onDone();
    } catch (err) {
      setShake((n) => n + 1);
      setError(err instanceof TxValidationError ? err.errors.map((x) => S.errors.tx[x]).join(' ') : String(err));
    }
  };

  // Hardware keyboard: digits, dot, backspace, Enter — unless typing in a text field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('input, select, textarea')) return;
      if (e.key === 'Enter') return void save();
      const k = keyFromKeyboard(e.key);
      if (k) {
        e.preventDefault();
        press(k);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const splitTotal = splits.reduce((s, x) => s + x.amountCents, 0);
  const hint = suggestion ? S.add.suggested(suggestion.source) : '';
  const accountChoices = accounts.filter((a) => type === 'transfer' || a.type !== 'investing');
  const pref = suggestion?.preferredAccountIds ?? [];
  const accountOptions = [...accountChoices].sort((a, b) => (pref.indexOf(a.id) + 1 || 99) - (pref.indexOf(b.id) + 1 || 99));
  const shown = entryDisplay(entry);

  return (
    <div class="add">
      <div class="segmented" role="radiogroup" aria-label={S.add.type}>
        <span class="segmented__thumb" style={{ width: `calc((100% - 6px) / ${TYPES.length})`, transform: `translateX(${TYPES.indexOf(type) * 100}%)` }} />
        {TYPES.map((t) => (
          <button type="button" role="radio" aria-checked={type === t} key={t} onClick={() => setType(t)}>
            {S.txType[t]}
          </button>
        ))}
      </div>

      <p class={`entry${entry ? '' : ' entry--empty'}${shake ? ' entry--shake' : ''}`} key={shake} aria-live="polite">
        <span class="entry__cur">$</span>
        {shown.whole}
        {shown.frac !== null && <span class="entry__frac">{shown.frac}</span>}
        <span class="entry__caret" />
      </p>
      <p class="entry__error">{error ?? ' '}</p>

      {type !== 'transfer' && splits.length === 0 && (
        <>
          <p class="field-label">
            {S.common.category} {!touched.category && hint && <span class="hint">{hint}</span>}
          </p>
          <ChipSelect row
            label={S.common.category}
            options={categories.map((c) => ({ value: c.id, label: c.name }))}
            value={categoryId}
            onChange={(id) => (setCategoryId(id), setTouched((t) => ({ ...t, category: true })))}
          />
        </>
      )}
      <p class="field-label">{type === 'transfer' ? S.accounts.from : S.common.account}</p>
      <ChipSelect row
        label={S.common.account}
        options={accountOptions.map((a) => ({ value: a.id, label: a.name }))}
        value={accountId}
        onChange={(id) => (setAccountId(id), setTouched((t) => ({ ...t, account: true })))}
      />
      {type === 'transfer' && (
        <>
          <p class="field-label">{S.add.toAccount}</p>
          <ChipSelect row
            label={S.add.toAccount}
            options={accounts.filter((a) => a.id !== accountId).map((a) => ({ value: a.id, label: a.name }))}
            value={toAccountId}
            onChange={setToAccountId}
          />
          {goals.length > 0 && (
            <>
              <p class="field-label">{S.add.goal}</p>
              <ChipSelect row
                label={S.add.goal}
                options={[{ value: '', label: '—' }, ...goals.map((g) => ({ value: g.id, label: g.name }))]}
                value={goalId ?? ''}
                onChange={(v) => setGoalId(v || undefined)}
              />
            </>
          )}
        </>
      )}

      <details class="add__more">
        <summary>{S.add.moreOptions}</summary>
        <label>
          {S.common.merchant} <input value={merchant} onChange={(e) => setMerchant((e.target as HTMLInputElement).value)} placeholder={S.common.optional} />
        </label>
        <label>
          {S.common.note} <input value={note} onInput={(e) => setNote((e.target as HTMLInputElement).value)} placeholder={S.common.optional} />
        </label>
        <label>
          {S.common.date} <input type="date" value={date} onInput={(e) => setDate((e.target as HTMLInputElement).value)} />
        </label>
        {type !== 'transfer' && (
          <fieldset>
            <legend>{S.add.split}</legend>
            {splits.map((sp, k) => (
              <div class="split" key={k}>
                <CategorySelect categories={categories} value={sp.categoryId} allowNone={false} onChange={(id) => setSplits(splits.map((x, j) => (j === k ? { ...x, categoryId: id ?? '' } : x)))} />
                <MoneyInput value={sp.amountCents || undefined} onChange={(c) => setSplits(splits.map((x, j) => (j === k ? { ...x, amountCents: c ?? 0 } : x)))} />
                <button type="button" class="link" onClick={() => setSplits(splits.filter((_, j) => j !== k))}>
                  {S.common.remove}
                </button>
              </div>
            ))}
            <button type="button" onClick={() => setSplits([...splits, { categoryId: categoryId ?? categories[0]?.id ?? '', amountCents: Math.max(0, amount - splitTotal) }])}>
              {S.add.addSplit}
            </button>
            {splits.length > 0 && splitTotal !== amount && <p class="muted">{S.errors.tx.split_mismatch}</p>}
          </fieldset>
        )}
      </details>

      <Keypad onKey={press} backLabel={S.add.backspace} />
      <div class="sheet__actions">
        <button type="button" class="primary block" onClick={save}>
          {S.common.save}
        </button>
      </div>
    </div>
  );
}
