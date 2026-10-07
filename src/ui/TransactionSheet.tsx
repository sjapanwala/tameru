import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState, type FormEvent, type KeyboardEvent } from 'react';
import {
  addTransaction,
  deleteTransaction,
  listRules,
  listTransactions,
  updateTransaction,
} from '../db/repo';
import { recentMerchants } from '../domain/activity';
import { centsToEntry, entryToCents, PAD_KEYS, pressKey, type PadKey } from '../domain/amountEntry';
import { isISODate, todayISO } from '../domain/dates';
import { cleanMerchant, matchRule, suggestRule, type RuleSuggestion } from '../domain/merchant';
import { currencySymbol, minorUnitDigits } from '../domain/money';
import type { NewRecord, Transaction } from '../domain/types';
import { useApp } from './context';
import { BackspaceIcon, CheckIcon, CloseIcon } from './Icons';
import { Sheet } from './Sheet';

export interface SavedResult {
  tx: Transaction;
  isNew: boolean;
  /** A merchant rule worth offering, given what the user just chose. */
  suggestion: RuleSuggestion | null;
}

interface Props {
  /** Present when editing; absent for Quick Add. */
  tx?: Transaction;
  onClose(): void;
  onSaved(result: SavedResult): void;
  onDeleted(tx: Transaction): void;
}

const RECENT_WINDOW = 300;

export function TransactionSheet({ tx, onClose, onSaved, onDeleted }: Props) {
  const { settings, accounts, categories } = useApp();
  const decimals = minorUnitDigits(settings.currency);

  const [entry, setEntry] = useState(() => (tx ? centsToEntry(tx.amountCents, decimals) : ''));
  const [kind, setKind] = useState<'expense' | 'income'>(
    tx && tx.amountCents > 0 ? 'income' : 'expense',
  );
  const [merchant, setMerchant] = useState(tx?.merchant ?? '');
  const [note, setNote] = useState(tx?.note ?? '');
  const [date, setDate] = useState(tx?.date ?? todayISO());
  const [accountId, setAccountId] = useState(
    tx?.accountId ?? settings.defaultAccountId ?? accounts[0]?.id ?? '',
  );
  // Category: once the user picks one it sticks; until then it follows the
  // merchant (rule first, then whatever that merchant was last filed under).
  const [categoryTouched, setCategoryTouched] = useState(tx !== undefined);
  const [pickedCategoryId, setPickedCategoryId] = useState<string | null>(tx?.categoryId ?? null);
  const [chipCategoryId, setChipCategoryId] = useState<string | null>(null);
  const [needsReview, setNeedsReview] = useState(tx?.needsReview ?? false);
  const [saving, setSaving] = useState(false);

  const rules = useLiveQuery(listRules, []) ?? [];
  const recents =
    useLiveQuery(async () => recentMerchants(await listTransactions(RECENT_WINDOW)), []) ?? [];

  const cleaned = useMemo(() => (merchant.trim() ? cleanMerchant(merchant) : ''), [merchant]);
  const rule = useMemo(() => (cleaned ? matchRule(cleaned, rules) : null), [cleaned, rules]);

  const autoCategoryId = rule?.categoryId ?? chipCategoryId;
  const wantedCategoryId = categoryTouched ? pickedCategoryId : autoCategoryId;
  const categoryId = categories.some((c) => c.id === wantedCategoryId) ? wantedCategoryId : null;

  const cents = entryToCents(entry, decimals);
  const canSave = cents > 0 && accountId !== '' && isISODate(date) && !saving;

  function press(key: PadKey) {
    setEntry((current) => pressKey(current, key, decimals));
  }

  function pickCategory(id: string) {
    const next = categoryId === id ? null : id;
    setCategoryTouched(true);
    setPickedCategoryId(next);
    if (next) setNeedsReview(false);
  }

  async function save() {
    if (!canSave) return;
    setSaving(true);

    const typed = merchant.trim();
    const merchantChanged = !tx || typed !== tx.merchant;
    const finalMerchant = !typed
      ? ''
      : merchantChanged
        ? rule?.cleanName || cleaned || typed
        : tx.merchant;
    const fields: NewRecord<Transaction> = {
      date,
      amountCents: kind === 'expense' ? -cents : cents,
      accountId,
      categoryId,
      merchant: finalMerchant,
      rawDescriptor: tx && !merchantChanged ? tx.rawDescriptor : typed,
      note: note.trim(),
      // New expenses without a category are flagged for a later look.
      needsReview: tx ? needsReview : kind === 'expense' && categoryId === null,
    };

    try {
      const saved = tx
        ? (await updateTransaction(tx.id, fields), { ...tx, ...fields })
        : await addTransaction(fields);
      const categoryChanged = !tx || tx.categoryId !== categoryId;
      onSaved({
        tx: saved,
        isNew: !tx,
        suggestion:
          categoryChanged || merchantChanged ? suggestRule(finalMerchant, categoryId, rules) : null,
      });
    } catch (error) {
      console.error(error);
      setSaving(false);
    }
  }

  async function remove() {
    if (!tx) return;
    setSaving(true);
    await deleteTransaction(tx.id);
    onDeleted(tx);
  }

  // Hardware keyboards can drive the pad when focus isn't in a text field.
  function onKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    const target = event.target as HTMLElement;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (/^[0-9.]$/.test(event.key)) {
      event.preventDefault();
      press(event.key as PadKey);
    } else if (event.key === 'Backspace') {
      event.preventDefault();
      press('back');
    } else if (event.key === 'Enter' && target.tagName !== 'BUTTON') {
      event.preventDefault();
      void save();
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void save();
  }

  const title = tx ? 'Edit transaction' : kind === 'expense' ? 'Add expense' : 'Add income';
  const symbol = currencySymbol(settings.currency);

  return (
    <Sheet label={title} onClose={onClose} onKeyDown={onKeyDown}>
      <form className="quick" onSubmit={onSubmit}>
        <div className="quick__top">
          <div className="segmented" role="group" aria-label="Type">
            {(['expense', 'income'] as const).map((value) => (
              <button
                key={value}
                type="button"
                className="segmented__option"
                aria-pressed={kind === value}
                onClick={() => setKind(value)}
              >
                {value === 'expense' ? 'Expense' : 'Income'}
              </button>
            ))}
          </div>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <p className="quick__amount num" aria-live="polite">
          <span className="visually-hidden">{title}: </span>
          <span className="quick__sign">{kind === 'expense' ? '' : '+'}</span>
          <span className="quick__symbol">{symbol}</span>
          <span className={entry === '' ? 'quick__digits quick__digits--empty' : 'quick__digits'}>
            {entry === '' ? '0' : entry}
          </span>
        </p>

        <div className="quick__scroll">
          <label className="visually-hidden" htmlFor="quick-merchant">
            Merchant
          </label>
          <input
            id="quick-merchant"
            className="input"
            type="text"
            placeholder="Merchant (optional)"
            autoComplete="off"
            autoCapitalize="words"
            enterKeyHint="done"
            value={merchant}
            onChange={(event) => {
              setMerchant(event.target.value);
              setChipCategoryId(null);
            }}
          />

          {recents.length > 0 && (
            <div className="chip-row" role="group" aria-label="Recent merchants">
              {recents.map((recent) => (
                <button
                  key={recent.name}
                  type="button"
                  className="chip"
                  aria-pressed={merchant === recent.name}
                  onClick={() => {
                    setMerchant(recent.name);
                    setChipCategoryId(recent.categoryId);
                  }}
                >
                  {recent.name}
                </button>
              ))}
            </div>
          )}

          <div className="chip-wrap" role="group" aria-label="Category">
            {categories.map((category) => {
              const selected = categoryId === category.id;
              return (
                <button
                  key={category.id}
                  type="button"
                  className="chip chip--category"
                  aria-pressed={selected}
                  onClick={() => pickCategory(category.id)}
                >
                  {selected && <CheckIcon size={16} />}
                  {category.name}
                </button>
              );
            })}
          </div>

          <div className="quick__details">
            <label className="visually-hidden" htmlFor="quick-note">
              Note
            </label>
            <input
              id="quick-note"
              className="input"
              type="text"
              placeholder="Note (optional)"
              autoComplete="off"
              enterKeyHint="done"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
            <label className="visually-hidden" htmlFor="quick-date">
              Date
            </label>
            <input
              id="quick-date"
              className="input input--date"
              type="date"
              required
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>

          {accounts.length > 1 && (
            <label className="field-inline">
              <span>Account</span>
              <select
                className="input"
                value={accountId}
                onChange={(event) => setAccountId(event.target.value)}
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {tx && (
            <label className="check">
              <input
                type="checkbox"
                checked={needsReview}
                onChange={(event) => setNeedsReview(event.target.checked)}
              />
              <span>Needs review</span>
            </label>
          )}
        </div>

        <div className="quick__fixed">
          <div className="pad" role="group" aria-label="Number pad">
            {PAD_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                className="pad__key num"
                aria-label={
                  key === 'back' ? 'Delete digit' : key === '.' ? 'Decimal point' : undefined
                }
                disabled={key === '.' && decimals === 0}
                onClick={() => press(key)}
              >
                {key === 'back' ? <BackspaceIcon /> : key}
              </button>
            ))}
          </div>

          <div className="quick__actions">
            {tx && (
              <button
                type="button"
                className="btn btn--danger-quiet"
                onClick={() => void remove()}
                disabled={saving}
              >
                Delete
              </button>
            )}
            <button type="submit" className="btn btn--primary btn--grow" disabled={!canSave}>
              {tx ? 'Save changes' : 'Save'}
            </button>
          </div>
        </div>
      </form>
    </Sheet>
  );
}
