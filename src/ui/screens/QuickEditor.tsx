// Set up or edit a quick-add slot: icon, label, price, category, vendor, account (or ask).

import { useEffect, useState } from 'preact/hooks';
import { money, S } from '../../copy/strings';
import { isBudgetCategory } from '../../domain/defaults';
import { quickLabel } from '../../domain/quick';
import type { Cents } from '../../domain/types';
import { clearQuick, QuickValidationError, saveQuick } from '../../services/quick';
import { ChipSelect, MoneyInput } from '../components';
import { useApp, useLoad } from '../hooks';
import { QUICK_ICON_KEYS, QuickIcon } from '../quickIcons';
import { orderedAccounts } from '../../services/accounts';

export function QuickEditor({ slot, onDone }: { slot: number; onDone: () => void }) {
  const { app, bump } = useApp();
  const existing = useLoad((a) => a.repos.quickActions.all())?.find((q) => q.slot === slot);
  const accounts = useLoad(orderedAccounts)?.filter((a) => !a.archived && a.type !== 'investing') ?? [];
  const categories = useLoad((a) => a.repos.categories.all())?.filter(isBudgetCategory).sort((a, b) => a.sortOrder - b.sortOrder) ?? [];

  const [icon, setIcon] = useState('coffee');
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState<Cents>();
  const [categoryId, setCategoryId] = useState<string>();
  const [merchant, setMerchant] = useState('');
  const [accountId, setAccountId] = useState<string>('ask');
  const [error, setError] = useState<string>();

  // Load the slot's current preset once it arrives.
  useEffect(() => {
    if (!existing) return;
    setIcon(existing.icon);
    setLabel(existing.label);
    setAmount(existing.amountCents);
    setCategoryId(existing.categoryId);
    setMerchant(existing.merchant ?? '');
    setAccountId(existing.accountId);
  }, [existing?.id]);

  const save = async (e: Event) => {
    e.preventDefault();
    try {
      await saveQuick(app, { slot, icon, label, amountCents: amount ?? 0, ...(categoryId ? { categoryId } : {}), merchant, accountId });
      bump();
      onDone();
    } catch (err) {
      setError(err instanceof QuickValidationError ? err.errors.map((x) => S.quick.errors[x]).join(' ') : String(err));
    }
  };
  const remove = async () => {
    await clearQuick(app, slot);
    bump();
    onDone();
  };

  const preview = quickLabel({ label, merchant }) || S.quick.icons[icon] || '';

  return (
    <form class="quick-editor" onSubmit={save}>
      <div class="quick-editor__preview">
        <span class="quick__disc quick__disc--lg">
          <QuickIcon name={icon} />
        </span>
        <strong>{preview}</strong>
        <span class="muted num">{amount ? money(amount) : '—'}</span>
      </div>

      <p class="field-label">{S.quick.icon}</p>
      <div class="icon-grid" role="radiogroup" aria-label={S.quick.icon}>
        {QUICK_ICON_KEYS.map((k) => (
          <button type="button" key={k} role="radio" aria-checked={icon === k} aria-label={S.quick.icons[k]} class={icon === k ? 'on' : ''} onClick={() => setIcon(k)}>
            <QuickIcon name={k} />
          </button>
        ))}
      </div>

      <label>
        {S.quick.label}
        <input value={label} placeholder={S.quick.icons[icon] ?? S.quick.labelHint} onInput={(e) => setLabel((e.target as HTMLInputElement).value)} />
      </label>
      <MoneyInput label={S.quick.price} value={amount} onChange={setAmount} />
      <label>
        {S.quick.vendor} {S.common.optional}
        <input value={merchant} placeholder={S.quick.vendorHint} onInput={(e) => setMerchant((e.target as HTMLInputElement).value)} />
      </label>

      <p class="field-label">{S.common.category}</p>
      <ChipSelect label={S.common.category} options={categories.map((c) => ({ value: c.id, label: c.name }))} value={categoryId} onChange={setCategoryId} />

      <p class="field-label">{S.quick.from}</p>
      <ChipSelect
        label={S.quick.from}
        options={[{ value: 'ask', label: S.quick.ask }, ...accounts.map((a) => ({ value: a.id, label: a.name }))]}
        value={accountId}
        onChange={setAccountId}
      />

      <p class="muted">
        <small>{S.quick.hint}</small>
      </p>
      <div class="sheet__actions">
        {error && <p class="entry__error">{error}</p>}
        <button type="submit" class="block">
          {S.common.save}
        </button>
        {existing && (
          <button type="button" class="link quick-editor__remove" onClick={remove}>
            {S.quick.clear}
          </button>
        )}
      </div>
    </form>
  );
}
