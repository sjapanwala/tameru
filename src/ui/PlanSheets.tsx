import { useState, type FormEvent, type ReactNode } from 'react';
import {
  deleteGoal,
  deleteRecurring,
  restoreGoal,
  restoreRecurring,
  saveGoal,
  saveRecurring,
  setBudget,
} from '../db/repo';
import { isISODate, todayISO } from '../domain/dates';
import { centsToInput, parseMoneyInput } from '../domain/money';
import { FREQUENCY_LABELS } from '../domain/recurring';
import type { Budget, Category, Goal, Recurring, Schedule } from '../domain/types';
import { useApp } from './context';
import { CloseIcon } from './Icons';
import { Sheet } from './Sheet';

interface FormSheetProps {
  title: string;
  onClose(): void;
  onSubmit(): void | Promise<void>;
  onDelete?(): void | Promise<void>;
  deleteLabel?: string;
  error: string | null;
  children: ReactNode;
}

/** Bottom sheet with a titled form, Save, and an optional destructive action. */
function FormSheet({
  title,
  onClose,
  onSubmit,
  onDelete,
  deleteLabel = 'Delete',
  error,
  children,
}: FormSheetProps) {
  const [busy, setBusy] = useState(false);

  async function run(action: () => void | Promise<void>, event?: FormEvent) {
    event?.preventDefault();
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet label={title} onClose={onClose}>
      <form className="form-sheet" onSubmit={(event) => void run(onSubmit, event)}>
        <div className="form-sheet__head">
          <h2 className="dialog__title">{title}</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        <div className="form-sheet__fields">{children}</div>
        {error && (
          <p className="field__error" role="alert">
            {error}
          </p>
        )}
        <div className="quick__actions">
          {onDelete && (
            <button
              type="button"
              className="btn btn--danger-quiet"
              disabled={busy}
              onClick={() => void run(onDelete)}
            >
              {deleteLabel}
            </button>
          )}
          <button type="submit" className="btn btn--primary btn--grow" disabled={busy}>
            Save
          </button>
        </div>
      </form>
    </Sheet>
  );
}

interface MoneyFieldProps {
  label: string;
  value: string;
  onChange(value: string): void;
  hint?: string;
  autoFocus?: boolean;
}

export function MoneyField({ label, value, onChange, hint, autoFocus }: MoneyFieldProps) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <input
        className="input num"
        type="text"
        inputMode="decimal"
        placeholder="0.00"
        autoComplete="off"
        autoFocus={autoFocus}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint && <span className="field__hint">{hint}</span>}
    </label>
  );
}

// ---- budget --------------------------------------------------------------

export function BudgetSheet({
  category,
  budget,
  onClose,
}: {
  category: Category;
  budget?: Budget;
  onClose(): void;
}) {
  const { settings } = useApp();
  const [amount, setAmount] = useState(centsToInput(budget?.monthlyCents ?? 0, settings.currency));
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const cents = amount.trim() === '' ? 0 : parseMoneyInput(amount, settings.currency);
    if (cents === null || cents < 0) return setError('Enter the budget as a number, like 400');
    await setBudget(category.id, cents);
    onClose();
  }

  return (
    <FormSheet
      title={`${category.name} budget`}
      onClose={onClose}
      onSubmit={submit}
      onDelete={
        budget
          ? async () => {
              await setBudget(category.id, 0);
              onClose();
            }
          : undefined
      }
      deleteLabel="Remove"
      error={error}
    >
      <MoneyField label="Monthly budget" value={amount} onChange={setAmount} autoFocus />
    </FormSheet>
  );
}

// ---- recurring bill / income ---------------------------------------------

interface RecurringSheetProps {
  item?: Recurring;
  kind: Recurring['kind'];
  onClose(): void;
}

export function RecurringSheet({ item, kind: initialKind, onClose }: RecurringSheetProps) {
  const { settings, categories, showToast } = useApp();
  const [kind, setKind] = useState(item?.kind ?? initialKind);
  const [name, setName] = useState(item?.name ?? '');
  const [amount, setAmount] = useState(centsToInput(item?.amountCents ?? 0, settings.currency));
  const [freq, setFreq] = useState<Schedule['freq']>(
    item?.schedule.freq ?? (initialKind === 'income' ? 'biweekly' : 'monthly'),
  );
  const [anchorDate, setAnchorDate] = useState(item?.schedule.anchorDate ?? todayISO());
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? '');
  const [variable, setVariable] = useState(item?.variable ?? false);
  const [error, setError] = useState<string | null>(null);
  const varies = kind === 'income' && variable;

  async function submit() {
    const cents = parseMoneyInput(amount, settings.currency);
    if (!name.trim()) return setError('Give it a name.');
    if (cents === null || cents <= 0) return setError('Enter an amount greater than zero.');
    if (!isISODate(anchorDate)) return setError('Pick a date.');
    await saveRecurring(item?.id ?? null, {
      name: name.trim(),
      amountCents: cents,
      kind,
      schedule: { freq, anchorDate },
      categoryId: kind === 'bill' && categoryId ? categoryId : null,
      variable: varies,
    });
    onClose();
  }

  async function remove() {
    if (!item) return;
    await deleteRecurring(item.id);
    onClose();
    showToast({
      message: `${item.name} removed.`,
      actionLabel: 'Undo',
      onAction: () => restoreRecurring(item.id),
    });
  }

  const noun = kind === 'bill' ? 'bill' : 'income';
  return (
    <FormSheet
      title={item ? `Edit ${noun}` : `Add ${noun}`}
      onClose={onClose}
      onSubmit={submit}
      onDelete={item ? remove : undefined}
      error={error}
    >
      <div className="segmented segmented--block" role="group" aria-label="Type">
        {(['bill', 'income'] as const).map((value) => (
          <button
            key={value}
            type="button"
            className="segmented__option"
            aria-pressed={kind === value}
            onClick={() => setKind(value)}
          >
            {value === 'bill' ? 'Bill' : 'Income'}
          </button>
        ))}
      </div>
      <label className="field">
        <span className="field__label">Name</span>
        <input
          className="input"
          type="text"
          maxLength={40}
          autoComplete="off"
          placeholder={kind === 'bill' ? 'Rent, phone, insurance…' : 'Paycheque'}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <MoneyField
        label={
          kind === 'bill'
            ? 'Amount each time'
            : varies
              ? 'A low take-home amount'
              : 'Take-home amount each time'
        }
        value={amount}
        onChange={setAmount}
      />
      {kind === 'income' && (
        <label className="check">
          <input
            type="checkbox"
            checked={variable}
            onChange={(event) => setVariable(event.target.checked)}
          />
          <span>
            The amount changes each time
            <span className="field__hint check__hint">
              Tameru plans on the low amount and asks what arrived on payday.
            </span>
          </span>
        </label>
      )}
      <div className="field-pair">
        <label className="field">
          <span className="field__label">Repeats</span>
          <select
            className="input"
            value={freq}
            onChange={(event) => setFreq(event.target.value as Schedule['freq'])}
          >
            {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Next date</span>
          <input
            className="input"
            type="date"
            required
            value={anchorDate}
            onChange={(event) => setAnchorDate(event.target.value)}
          />
        </label>
      </div>
      {kind === 'bill' && (
        <label className="field">
          <span className="field__label">Category (optional)</span>
          <select
            className="input"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
          >
            <option value="">None</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </FormSheet>
  );
}

// ---- goal ----------------------------------------------------------------

export function GoalSheet({ goal, onClose }: { goal?: Goal; onClose(): void }) {
  const { settings, showToast } = useApp();
  const input = (cents: number | undefined) => centsToInput(cents ?? 0, settings.currency);
  const [name, setName] = useState(goal?.name ?? '');
  const [target, setTarget] = useState(input(goal?.targetCents));
  const [saved, setSaved] = useState(input(goal?.savedCents));
  const [monthly, setMonthly] = useState(input(goal?.monthlyContributionCents));
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? '');
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const parse = (text: string) =>
      text.trim() === '' ? 0 : parseMoneyInput(text, settings.currency);
    const [targetCents, savedCents, monthlyCents] = [parse(target), parse(saved), parse(monthly)];
    if (!name.trim()) return setError('Give the goal a name.');
    if (targetCents === null || targetCents <= 0)
      return setError('Enter a target greater than zero.');
    if (savedCents === null || savedCents < 0 || monthlyCents === null || monthlyCents < 0) {
      return setError('Amounts must be numbers, zero or more.');
    }
    await saveGoal(goal?.id ?? null, {
      name: name.trim(),
      targetCents,
      savedCents,
      monthlyContributionCents: monthlyCents,
      targetDate: isISODate(targetDate) ? targetDate : null,
    });
    onClose();
  }

  async function remove() {
    if (!goal) return;
    await deleteGoal(goal.id);
    onClose();
    showToast({
      message: `${goal.name} removed.`,
      actionLabel: 'Undo',
      onAction: () => restoreGoal(goal.id),
    });
  }

  return (
    <FormSheet
      title={goal ? 'Edit goal' : 'Add goal'}
      onClose={onClose}
      onSubmit={submit}
      onDelete={goal ? remove : undefined}
      error={error}
    >
      <label className="field">
        <span className="field__label">Name</span>
        <input
          className="input"
          type="text"
          maxLength={40}
          autoComplete="off"
          placeholder="Emergency fund, trip…"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <div className="field-pair">
        <MoneyField label="Target" value={target} onChange={setTarget} />
        <MoneyField label="Saved so far" value={saved} onChange={setSaved} />
      </div>
      <MoneyField
        label="Set aside each month"
        value={monthly}
        onChange={setMonthly}
        hint="Held back from your safe-to-spend number."
      />
      <label className="field">
        <span className="field__label">Target date (optional)</span>
        <input
          className="input"
          type="date"
          value={targetDate}
          onChange={(event) => setTargetDate(event.target.value)}
        />
      </label>
    </FormSheet>
  );
}
