import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import {
  addCategory,
  addTransaction,
  deleteTransaction,
  listRules,
  listTransactions,
  updateTransaction,
} from '../db/repo';
import { topCategories } from '../domain/activity';
import { centsToEntry, entryToCents, PAD_KEYS, pressKey, type PadKey } from '../domain/amountEntry';
import { isISODate, todayISO } from '../domain/dates';
import { PRESET_CATEGORIES } from '../domain/defaults';
import { cleanMerchant, matchRule, suggestRule, type RuleSuggestion } from '../domain/merchant';
import { currencySymbol, minorUnitDigits } from '../domain/money';
import type { Category, NewRecord, Transaction } from '../domain/types';
import { CategoryIcon } from './CategoryIcon';
import { useApp } from './context';
import { BackspaceIcon, CheckIcon, CloseIcon, PlusIcon, SearchIcon } from './Icons';
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

interface Option {
  name: string;
  /** Null for a preset or new name that hasn't been created yet. */
  id: string | null;
}

const RECENT_WINDOW = 300;
const QUICK_CATEGORIES = 3;

export function TransactionSheet({ tx, onClose, onSaved, onDeleted }: Props) {
  const { settings, accounts, categories: liveCategories } = useApp();
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
  // merchant's rule, if it has one.
  const [categoryTouched, setCategoryTouched] = useState(tx !== undefined);
  const [pickedCategoryId, setPickedCategoryId] = useState<string | null>(tx?.categoryId ?? null);
  // Categories created from the menu, usable before the live query catches up.
  const [created, setCreated] = useState<Category[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [needsReview, setNeedsReview] = useState(tx?.needsReview ?? false);
  const [saving, setSaving] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const rules = useLiveQuery(listRules, []) ?? [];
  const recentTxs = useLiveQuery(() => listTransactions(RECENT_WINDOW), []) ?? [];

  const categories = useMemo(
    () => [...liveCategories, ...created.filter((c) => !liveCategories.some((l) => l.id === c.id))],
    [liveCategories, created],
  );

  const cleaned = useMemo(() => (merchant.trim() ? cleanMerchant(merchant) : ''), [merchant]);
  const rule = useMemo(() => (cleaned ? matchRule(cleaned, rules) : null), [cleaned, rules]);

  const wantedCategoryId = categoryTouched ? pickedCategoryId : (rule?.categoryId ?? null);
  const category = categories.find((c) => c.id === wantedCategoryId) ?? null;
  const categoryId = category?.id ?? null;

  // Three most-used categories; the selected one always has a circle.
  const quick = useMemo(() => {
    const top = topCategories(recentTxs, categories, QUICK_CATEGORIES);
    if (category && top.length > 0 && !top.some((c) => c.id === category.id)) {
      top[top.length - 1] = category;
    }
    return top;
  }, [recentTxs, categories, category]);

  // Menu: the user's categories, then presets they haven't added yet.
  const options = useMemo<Option[]>(() => {
    const own = categories.map((c) => ({ name: c.name, id: c.id }));
    const taken = new Set(own.map((o) => o.name.toLowerCase()));
    const presets = PRESET_CATEGORIES.filter((name) => !taken.has(name.toLowerCase()));
    return [...own, ...presets.map((name) => ({ name, id: null }))];
  }, [categories]);
  const typed = query.replace(/\s+/g, ' ').trim();
  const needle = typed.toLowerCase();
  const matches = needle ? options.filter((o) => o.name.toLowerCase().includes(needle)) : options;
  const exact = options.some((o) => o.name.toLowerCase() === needle);

  const cents = entryToCents(entry, decimals);
  const canSave = cents > 0 && accountId !== '' && isISODate(date) && !saving;

  function press(key: PadKey) {
    setEntry((current) => pressKey(current, key, decimals));
  }

  function choose(id: string | null) {
    setCategoryTouched(true);
    setPickedCategoryId(id);
    if (id) setNeedsReview(false);
  }

  function closeMenu() {
    setMenuOpen(false);
    setQuery('');
    moreRef.current?.focus();
  }

  async function chooseOption(option: Option) {
    let id = option.id;
    if (!id) {
      const added = await addCategory(option.name);
      setCreated((list) => [...list, added]);
      id = added.id;
    }
    choose(id);
    closeMenu();
  }

  async function save() {
    if (!canSave) return;
    setSaving(true);

    const typedMerchant = merchant.trim();
    const merchantChanged = !tx || typedMerchant !== tx.merchant;
    const finalMerchant = !typedMerchant
      ? ''
      : merchantChanged
        ? rule?.cleanName || cleaned || typedMerchant
        : tx.merchant;
    const fields: NewRecord<Transaction> = {
      date,
      amountCents: kind === 'expense' ? -cents : cents,
      accountId,
      categoryId,
      merchant: finalMerchant,
      rawDescriptor: tx && !merchantChanged ? tx.rawDescriptor : typedMerchant,
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
    if (menuOpen && event.key === 'Escape') {
      event.preventDefault();
      closeMenu();
      return;
    }
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
    if (!menuOpen) void save();
  }

  const title = tx ? 'Edit transaction' : kind === 'expense' ? 'Add expense' : 'Add income';
  const symbol = currencySymbol(settings.currency);

  return (
    <Sheet label={title} onClose={onClose} onKeyDown={onKeyDown}>
      <form className="quick" onSubmit={onSubmit}>
        <div className="quick__tabs">
          <div className="subtabs" role="group" aria-label="Type">
            {(['expense', 'income'] as const).map((value) => (
              <button
                key={value}
                type="button"
                className="subtabs__tab"
                aria-pressed={kind === value}
                onClick={() => setKind(value)}
              >
                {value === 'expense' ? 'Expense' : 'Income'}
              </button>
            ))}
          </div>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <CloseIcon size={18} />
          </button>
        </div>

        <div className="quick__amount-row">
          <div>
            <span className="field__label">Amount</span>
            <p
              className={`quick__amount${entry === '' ? ' quick__amount--empty' : kind === 'income' ? ' quick__amount--in' : ''}`}
              aria-live="polite"
            >
              <span className="visually-hidden">{title}: </span>
              <span className="quick__digits">
                {kind === 'income' ? '+' : ''}
                {symbol}
                {entry === '' ? '0' : entry}
              </span>
              <span className="quick__caret" aria-hidden="true" />
            </p>
          </div>
          <span className="quick__currency">{settings.currency}</span>
        </div>

        <div className="quick__category">
          <div className="quick__category-head">
            <span>Category</span>
            <span>{category?.name ?? 'None'}</span>
          </div>
          <div className="cats" role="group" aria-label="Category">
            {quick.map((item) => (
              <button
                key={item.id}
                type="button"
                className="cat"
                aria-pressed={categoryId === item.id}
                onClick={() => choose(categoryId === item.id ? null : item.id)}
              >
                <span className="cat__circle">
                  <CategoryIcon name={item.name} />
                </span>
                <span className="cat__name">{item.name}</span>
              </button>
            ))}
            <button
              ref={moreRef}
              type="button"
              className="cat cat--more"
              aria-expanded={menuOpen}
              aria-haspopup="dialog"
              onClick={() => (menuOpen ? closeMenu() : setMenuOpen(true))}
            >
              <span className="cat__circle">
                <SearchIcon size={20} />
              </span>
              <span className="cat__name">More</span>
            </button>
          </div>

          {menuOpen && (
            <div className="catmenu" role="dialog" aria-label="All categories">
              <label className="catmenu__search">
                <SearchIcon size={18} />
                <span className="visually-hidden">Search categories</span>
                <input
                  ref={searchRef}
                  className="catmenu__input"
                  type="text"
                  placeholder="Search or name a new one"
                  autoComplete="off"
                  autoCapitalize="words"
                  maxLength={30}
                  autoFocus
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return;
                    event.preventDefault();
                    const first = matches[0];
                    if (first) void chooseOption(first);
                    else if (typed) void chooseOption({ name: typed, id: null });
                  }}
                />
              </label>
              {matches.length > 0 ? (
                <>
                  <p className="catmenu__count">Categories · {matches.length}</p>
                  <ul className="catmenu__list">
                    {matches.map((option) => (
                      <li key={option.name}>
                        <button
                          type="button"
                          className="catmenu__item"
                          onClick={() => void chooseOption(option)}
                        >
                          <span className="catmenu__icon">
                            <CategoryIcon name={option.name} size={16} />
                          </span>
                          <span className="catmenu__label">{option.name}</span>
                          {option.id !== null && option.id === categoryId && (
                            <span className="catmenu__check">
                              <CheckIcon size={16} />
                              <span className="visually-hidden">Selected</span>
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                  {typed && !exact ? (
                    <button
                      type="button"
                      className="catmenu__item catmenu__new"
                      onClick={() => void chooseOption({ name: typed, id: null })}
                    >
                      <span className="catmenu__icon">
                        <PlusIcon size={14} />
                      </span>
                      <span className="catmenu__label">Add “{typed}”</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="catmenu__item catmenu__new"
                      onClick={() => searchRef.current?.focus()}
                    >
                      <span className="catmenu__icon">
                        <PlusIcon size={14} />
                      </span>
                      <span className="catmenu__label">New category</span>
                    </button>
                  )}
                </>
              ) : (
                <>
                  <p className="catmenu__none">No category called “{typed}”.</p>
                  <button
                    type="button"
                    className="catmenu__item catmenu__new catmenu__new--match"
                    onClick={() => void chooseOption({ name: typed, id: null })}
                  >
                    <span className="catmenu__icon">
                      <PlusIcon size={14} />
                    </span>
                    <span className="catmenu__label">Add “{typed}” as a category</span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {menuOpen && (
          <button
            type="button"
            className="catmenu-veil"
            aria-label="Close category menu"
            tabIndex={-1}
            onClick={closeMenu}
          />
        )}

        <div className="quick__scroll">
          <label className="kv">
            <span className="kv__label">Merchant</span>
            <input
              className="kv__input"
              type="text"
              placeholder="Optional"
              autoComplete="off"
              autoCapitalize="words"
              enterKeyHint="done"
              value={merchant}
              onChange={(event) => setMerchant(event.target.value)}
            />
          </label>

          <label className="kv">
            <span className="kv__label">Note</span>
            <input
              className="kv__input"
              type="text"
              placeholder="Optional"
              autoComplete="off"
              enterKeyHint="done"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>

          <label className="kv">
            <span className="kv__label">Date</span>
            <input
              className="kv__input kv__input--date"
              type="date"
              required
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>

          {accounts.length > 1 && (
            <label className="kv">
              <span className="kv__label">Account</span>
              <select
                className="kv__input"
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
            <label className="kv">
              <span className="kv__label">Needs review</span>
              <input
                type="checkbox"
                checked={needsReview}
                onChange={(event) => setNeedsReview(event.target.checked)}
              />
            </label>
          )}
        </div>

        <div className="quick__fixed">
          <div className="pad" role="group" aria-label="Number pad">
            {PAD_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                className="pad__key"
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
              {tx ? 'Save changes' : kind === 'expense' ? 'Save expense' : 'Save income'}
            </button>
          </div>
        </div>
      </form>
    </Sheet>
  );
}
