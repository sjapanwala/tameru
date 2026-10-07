// Screens for the setup stage (chapters 0–5). One question per screen; each
// saves its own answer before moving on, so quitting part-way loses nothing.

import { useEffect, useState, type FormEvent } from 'react';
import {
  deleteAccount,
  finishOnboarding,
  newId,
  removeRecurringByOrigin,
  saveAccount,
  saveRecurring,
  setSetting,
  upsertRecurring,
} from '../db/repo';
import { centsToEntry, entryToCents } from '../domain/amountEntry';
import { daysInMonth, todayISO } from '../domain/dates';
import { CURRENCIES } from '../domain/defaults';
import { centsToInput, parseMoneyInput } from '../domain/money';
import { FREQUENCY_LABELS, monthlyEquivalent } from '../domain/recurring';
import { safeToSpend } from '../domain/safeToSpend';
import type { Account, ISODate, Recurring, Schedule } from '../domain/types';
import { useApp } from '../ui/context';
import { ImportBackup } from '../ui/ImportBackup';
import { Sheet } from '../ui/Sheet';
import {
  AllocationBar,
  AmountDisplay,
  AmountPad,
  Chips,
  CountUpMoney,
  DateStrip,
  DayGrid,
  Option,
  Options,
  Screen,
  SWATCHES,
  Swatches,
  useFlow,
  type Slice,
} from './kit';
import { startCard, startDreams, startIncome, type AccountKind } from './machine';
import { celebrate } from './motion';

const ACCOUNT_KINDS: { kind: AccountKind; label: string; hint: string }[] = [
  { kind: 'chequing', label: 'Chequing', hint: 'Everyday spending' },
  { kind: 'savings', label: 'Savings', hint: 'Set aside' },
  { kind: 'cash', label: 'Cash', hint: 'In your wallet' },
  { kind: 'investing', label: 'Investments', hint: 'Long term' },
];

const kindLabel = (kind: AccountKind) => ACCOUNT_KINDS.find((k) => k.kind === kind)!.label;

/** Accounts a paycheque can land in or a card can be paid from. */
export const isDeposit = (account: Account) =>
  account.type === 'chequing' || account.type === 'savings' || account.type === 'cash';

const INCOME_ORIGIN = 'income:main';

/** The account the current accounts.* screen is about (one per kind). */
function useCurrentAccount() {
  const { state, accounts } = useFlow();
  const kind = state.accountKinds[state.accountIndex] ?? 'chequing';
  return { kind, account: accounts.find((a) => a.type === kind) };
}

function useCard() {
  const { state, accounts } = useFlow();
  return accounts.find((a) => a.id === state.cardId && a.type === 'credit');
}

function useIncome(): Recurring | undefined {
  return useFlow().recurring.find((item) => item.origin === INCOME_ORIGIN);
}

/** A percentage typed by hand; null when blank or not a sensible number. */
function parsePercent(text: string): number | null {
  const value = Number(text.trim().replace(',', '.'));
  return text.trim() !== '' && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
}

// ---- hello ------------------------------------------------------------------

export function HelloIntro() {
  const flow = useFlow();
  return (
    <Screen
      title="Welcome to Tameru"
      lede="A few quick questions and you'll know what you can safely spend each day. Everything stays on this phone."
      primary={{ label: 'Get started', onClick: () => flow.next() }}
    >
      <div className="ob__alt">
        <p>Moving from another device?</p>
        <ImportBackup
          label="Restore from a backup file"
          className="btn btn--quiet"
          onImported={() => {}}
        />
      </div>
    </Screen>
  );
}

export function HelloName() {
  const flow = useFlow();
  const { settings } = useApp();
  const [name, setName] = useState(settings.userName);

  async function save() {
    await setSetting('userName', name.trim());
    flow.next();
  }

  return (
    <Screen
      title="What should we call you?"
      lede="Only used to greet you. It never leaves this phone."
      primary={{ label: 'Continue', onClick: save }}
      onSkip={() => flow.next()}
    >
      <form
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          void save();
        }}
      >
        <label className="field">
          <span className="field__label">Your name</span>
          <input
            className="input"
            type="text"
            maxLength={40}
            autoComplete="given-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
      </form>
    </Screen>
  );
}

export function HelloCurrency() {
  const flow = useFlow();
  return (
    <Screen
      title="Which currency do you use?"
      lede={CURRENCIES.find((c) => c.code === flow.currency)?.label}
      primary={{ label: 'Continue', onClick: () => flow.next() }}
    >
      <Chips
        label="Currency"
        options={CURRENCIES.map(({ code }) => ({ value: code, label: code }))}
        value={flow.currency}
        onChange={(code) => void setSetting('currency', code)}
      />
    </Screen>
  );
}

// ---- accounts ---------------------------------------------------------------

export function AccountsPick() {
  const flow = useFlow();
  const [picked, setPicked] = useState<AccountKind[]>(flow.state.accountKinds);

  const toggle = (kind: AccountKind) =>
    setPicked((current) =>
      current.includes(kind) ? current.filter((k) => k !== kind) : [...current, kind],
    );

  async function save() {
    // Un-picking a kind after filling it in takes its account away again.
    for (const account of flow.accounts) {
      if (account.type !== 'credit' && !picked.includes(account.type)) {
        await deleteAccount(account.id);
      }
    }
    const accountKinds = ACCOUNT_KINDS.map((k) => k.kind).filter((kind) => picked.includes(kind));
    flow.next({ accountKinds, accountIndex: 0 });
  }

  return (
    <Screen
      title="Where does your money live?"
      lede="Pick every kind you have. You can add more later."
      primary={{ label: 'Continue', onClick: save, disabled: picked.length === 0 }}
      onSkip={() => flow.next({ accountKinds: [] })}
    >
      <Options label="Account types">
        {ACCOUNT_KINDS.map(({ kind, label, hint }) => (
          <Option
            key={kind}
            label={label}
            hint={hint}
            selected={picked.includes(kind)}
            onClick={() => toggle(kind)}
          />
        ))}
      </Options>
    </Screen>
  );
}

export function AccountName() {
  const flow = useFlow();
  const { kind, account } = useCurrentAccount();
  const [name, setName] = useState(account?.name ?? kindLabel(kind));
  const [color, setColor] = useState(
    account?.color ?? SWATCHES[flow.state.accountIndex % SWATCHES.length]!.value,
  );

  async function save() {
    const clean = name.trim() || kindLabel(kind);
    await saveAccount(
      account?.id ?? null,
      account
        ? { name: clean, color }
        : { name: clean, type: kind, color, startingBalanceCents: 0 },
    );
    flow.next();
  }

  return (
    <Screen
      title={`Name your ${kindLabel(kind).toLowerCase()}`}
      lede="Whatever you'd call it. The colour helps you spot it."
      primary={{ label: 'Continue', onClick: save }}
    >
      <label className="field">
        <span className="field__label">Account name</span>
        <input
          className="input"
          type="text"
          maxLength={40}
          autoComplete="off"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <Swatches value={color} onChange={setColor} />
    </Screen>
  );
}

export function AccountBalance() {
  const flow = useFlow();
  const { kind, account } = useCurrentAccount();
  const [entry, setEntry] = useState(
    centsToEntry(account?.startingBalanceCents ?? 0, flow.decimals),
  );

  async function save() {
    if (!account) return;
    await saveAccount(account.id, { startingBalanceCents: entryToCents(entry, flow.decimals) });
    const { celebrated } = flow.state;
    if (!celebrated.account) void celebrate('account');
    flow.next({ celebrated: { ...celebrated, account: true } });
  }

  return (
    <Screen
      title={`How much is in ${account?.name ?? kindLabel(kind)} right now?`}
      lede="A rough figure is fine. You can leave it at zero."
      dock={<AmountPad entry={entry} onChange={setEntry} />}
      primary={{ label: 'Continue', onClick: save, disabled: !account }}
    >
      <AmountDisplay entry={entry} label="Balance" />
    </Screen>
  );
}

export function AccountRate() {
  const flow = useFlow();
  const { account } = useCurrentAccount();
  const [rate, setRate] = useState(
    account?.interestRatePct != null ? String(account.interestRatePct) : '',
  );
  const parsed = parsePercent(rate);

  async function save(value: number | null) {
    if (account) await saveAccount(account.id, { interestRatePct: value });
    flow.next();
  }

  return (
    <Screen
      title="Does it earn interest?"
      lede="The yearly rate, if you know it."
      primary={{ label: 'Continue', onClick: () => save(parsed), disabled: parsed === null }}
      onSkip={() => void save(null)}
      skipLabel="Not sure"
    >
      <label className="field">
        <span className="field__label">Interest rate, % a year</span>
        <input
          className="input num"
          type="text"
          inputMode="decimal"
          placeholder="2.5"
          autoComplete="off"
          value={rate}
          onChange={(event) => setRate(event.target.value)}
        />
      </label>
    </Screen>
  );
}

export function AccountContributed() {
  const flow = useFlow();
  const { account } = useCurrentAccount();
  const [entry, setEntry] = useState(centsToEntry(account?.contributedCents ?? 0, flow.decimals));

  async function save(value: number | null) {
    if (account) await saveAccount(account.id, { contributedCents: value });
    flow.next();
  }

  return (
    <Screen
      title="How much have you put in?"
      lede="What you've contributed yourself, not what it has grown to."
      dock={<AmountPad entry={entry} onChange={setEntry} />}
      primary={{ label: 'Continue', onClick: () => save(entryToCents(entry, flow.decimals)) }}
      onSkip={() => void save(null)}
      skipLabel="Not sure"
    >
      <AmountDisplay entry={entry} label="Contributed" />
    </Screen>
  );
}

export function AccountFee() {
  const flow = useFlow();
  const { kind, account } = useCurrentAccount();
  const origin = `fee:${account?.id ?? ''}`;
  const existing = flow.recurring.find((item) => item.origin === origin);
  const [entry, setEntry] = useState(centsToEntry(existing?.amountCents ?? 0, flow.decimals));
  const name = account?.name ?? kindLabel(kind);

  async function save(cents: number) {
    if (account) {
      if (cents > 0) {
        await upsertRecurring(origin, {
          name: `${name} fee`,
          amountCents: cents,
          schedule: existing?.schedule ?? { freq: 'monthly', anchorDate: todayISO() },
          kind: 'bill',
          categoryId: null,
          accountId: account.id,
        });
      } else {
        await removeRecurringByOrigin(origin);
      }
    }
    flow.next();
  }

  return (
    <Screen
      title={`Does ${name} have a monthly fee?`}
      lede="Tameru sets it aside so it never surprises you."
      dock={<AmountPad entry={entry} onChange={setEntry} />}
      primary={{ label: 'Continue', onClick: () => save(entryToCents(entry, flow.decimals)) }}
      onSkip={() => void save(0)}
      skipLabel="No fee"
    >
      <AmountDisplay entry={entry} label="Monthly fee" />
    </Screen>
  );
}

// ---- credit cards -----------------------------------------------------------

const NEW_CARD = 'new';

export function CardsAsk() {
  const flow = useFlow();
  const cards = flow.accounts.filter((a) => a.type === 'credit');
  const add = () => flow.go(startCard(flow.state, NEW_CARD));

  if (cards.length === 0) {
    return (
      <Screen
        title="Do you have a credit card?"
        lede="Adding it lets Tameru keep the payment in view."
        primary={{ label: 'Add a card', onClick: add }}
        onSkip={() => flow.next()}
        skipLabel="No cards"
      />
    );
  }

  return (
    <Screen
      title="Your credit cards"
      lede="Tap a card to change it."
      primary={{ label: 'Continue', onClick: () => flow.next() }}
    >
      <ul className="ob-rows">
        {cards.map((card) => (
          <li key={card.id}>
            <button
              type="button"
              className="ob-row"
              onClick={() => flow.go(startCard(flow.state, card.id))}
            >
              <span className="ob-row__dot" style={{ background: card.color }} aria-hidden="true" />
              <span className="ob-row__name">{card.name}</span>
              <span className="mono">{flow.money(-card.startingBalanceCents)} owed</span>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="btn btn--secondary btn--block" onClick={add}>
        Add another card
      </button>
    </Screen>
  );
}

export function CardName() {
  const flow = useFlow();
  const card = useCard();
  const [name, setName] = useState(card?.name ?? '');
  const [color, setColor] = useState(card?.color ?? SWATCHES[5]!.value);

  async function save() {
    const clean = name.trim() || 'Credit card';
    const id = await saveAccount(
      card?.id ?? null,
      card
        ? { name: clean, color }
        : { name: clean, type: 'credit', color, startingBalanceCents: 0 },
    );
    flow.next({ cardId: id });
  }

  return (
    <Screen
      title="What's the card called?"
      lede="The bank or the card's name, like “Visa”."
      primary={{ label: 'Continue', onClick: save }}
    >
      <label className="field">
        <span className="field__label">Card name</span>
        <input
          className="input"
          type="text"
          maxLength={40}
          autoComplete="off"
          placeholder="Credit card"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <Swatches value={color} onChange={setColor} />
    </Screen>
  );
}

export function CardBalance() {
  const flow = useFlow();
  const card = useCard();
  const [entry, setEntry] = useState(centsToEntry(card?.startingBalanceCents ?? 0, flow.decimals));

  async function save() {
    if (!card) return;
    // Owed money is a negative balance.
    await saveAccount(card.id, { startingBalanceCents: -entryToCents(entry, flow.decimals) });
    flow.next();
  }

  return (
    <Screen
      title={`How much do you owe on ${card?.name ?? 'it'}?`}
      lede="The balance today. Leave it at zero if it's paid off."
      dock={<AmountPad entry={entry} onChange={setEntry} />}
      primary={{ label: 'Continue', onClick: save, disabled: !card }}
    >
      <AmountDisplay entry={entry} label="Amount owed" />
    </Screen>
  );
}

export function CardDays() {
  const flow = useFlow();
  const card = useCard();
  const [day, setDay] = useState<number | null>(card?.dueDay ?? null);

  async function save() {
    if (card) await saveAccount(card.id, { dueDay: day });
    flow.next();
  }

  return (
    <Screen
      title="What day is the payment due?"
      lede="The day of the month on your statement."
      primary={{ label: 'Continue', onClick: save, disabled: day === null }}
      onSkip={() => flow.next()}
      skipLabel="Not sure"
    >
      <DayGrid label="Payment due day" value={day} onChange={setDay} />
    </Screen>
  );
}

export function CardExtras() {
  const flow = useFlow();
  const card = useCard();
  const payFrom = flow.accounts.filter(isDeposit);
  const [limit, setLimit] = useState(
    card?.limitCents != null ? centsToInput(card.limitCents, flow.currency) : '',
  );
  const [apr, setApr] = useState(card?.aprPct != null ? String(card.aprPct) : '');
  const [payFromId, setPayFromId] = useState<string | null>(card?.payFromAccountId ?? null);

  async function save() {
    if (card) {
      await saveAccount(card.id, {
        limitCents: limit.trim() === '' ? null : parseMoneyInput(limit, flow.currency),
        aprPct: parsePercent(apr),
        payFromAccountId: payFromId,
      });
    }
    flow.next();
  }

  return (
    <Screen
      title="A few optional details"
      lede="They sharpen the payoff plan. Fill in what you know."
      primary={{ label: 'Continue', onClick: save }}
      onSkip={() => flow.next()}
    >
      <label className="field">
        <span className="field__label">Credit limit</span>
        <input
          className="input num"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={limit}
          onChange={(event) => setLimit(event.target.value)}
        />
      </label>
      <label className="field">
        <span className="field__label">Interest rate (APR), %</span>
        <input
          className="input num"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={apr}
          onChange={(event) => setApr(event.target.value)}
        />
      </label>
      {payFrom.length > 0 && (
        <div className="field">
          <span className="field__label">Paid from</span>
          <Chips<string>
            label="Paid from"
            options={payFrom.map((a) => ({ value: a.id, label: a.name }))}
            value={payFromId}
            onChange={setPayFromId}
          />
        </div>
      )}
    </Screen>
  );
}

export function CardMore() {
  const flow = useFlow();
  const card = useCard();
  return (
    <Screen
      title={`${card?.name ?? 'Card'} added`}
      lede="Have another card? Add it now, or carry on."
      primary={{ label: 'Continue', onClick: () => flow.next() }}
    >
      <button
        type="button"
        className="btn btn--secondary btn--block"
        onClick={() => flow.go(startCard(flow.state, NEW_CARD))}
      >
        Add another card
      </button>
    </Screen>
  );
}

// ---- payday -----------------------------------------------------------------

type PayChoice = Exclude<Schedule['freq'], 'yearly'> | 'varies';

const PAY_CHOICES: { value: PayChoice; label: string; hint?: string }[] = [
  { value: 'weekly', label: 'Every week' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'semimonthly', label: 'Twice a month' },
  { value: 'monthly', label: 'Once a month' },
  { value: 'varies', label: 'It varies', hint: 'Freelance, tips, shifts' },
];

export function PaydaySchedule() {
  const flow = useFlow();
  const income = useIncome();
  const [choice, setChoice] = useState<PayChoice | null>(
    income ? (flow.state.incomeVaries ? 'varies' : (income.schedule.freq as PayChoice)) : null,
  );

  async function save() {
    if (!choice) return;
    const varies = choice === 'varies';
    const id = await upsertRecurring(INCOME_ORIGIN, {
      name: income?.name ?? 'Paycheque',
      amountCents: income?.amountCents ?? 0,
      schedule: {
        freq: varies ? 'monthly' : choice,
        anchorDate: income?.schedule.anchorDate ?? todayISO(),
      },
      kind: 'income',
      categoryId: null,
      accountId: income?.accountId ?? null,
      // Coming back to a regular schedule keeps "the amount changes" as it was.
      variable: varies || (!flow.state.incomeVaries && (income?.variable ?? false)),
    });
    flow.go(startIncome(flow.state, id, varies));
  }

  return (
    <Screen
      title="How often do you get paid?"
      lede="Your safe-to-spend number is built on this."
      primary={{ label: 'Continue', onClick: save, disabled: choice === null }}
    >
      <Options label="Pay schedule">
        {PAY_CHOICES.map(({ value, label, hint }) => (
          <Option
            key={value}
            label={label}
            hint={hint}
            selected={choice === value}
            onClick={() => setChoice(value)}
          />
        ))}
      </Options>
    </Screen>
  );
}

export function PaydayAmount() {
  const flow = useFlow();
  const income = useIncome();
  const noSchedule = flow.state.incomeVaries;
  const [entry, setEntry] = useState(centsToEntry(income?.amountCents ?? 0, flow.decimals));
  const [changes, setChanges] = useState(!noSchedule && (income?.variable ?? false));
  const cents = entryToCents(entry, flow.decimals);

  async function save() {
    if (!income) return;
    await saveRecurring(income.id, { amountCents: cents, variable: noSchedule || changes });
    flow.next();
  }

  return (
    <Screen
      title={
        noSchedule
          ? 'What do you make in a slow month?'
          : changes
            ? 'What does a low paycheque look like?'
            : 'How much is each paycheque?'
      }
      lede={
        noSchedule || changes
          ? 'Tameru plans on this figure, then asks what really arrived each payday. Anything above it raises your daily number.'
          : 'What lands in your account, after tax.'
      }
      dock={<AmountPad entry={entry} onChange={setEntry} />}
      primary={{ label: 'Continue', onClick: save, disabled: !income || cents === 0 }}
    >
      <AmountDisplay entry={entry} label="Pay" />
      {!noSchedule && (
        <Options label="Pay amount">
          <Option
            label="The amount changes each time"
            hint="Hourly, tips, commission"
            selected={changes}
            onClick={() => setChanges((current) => !current)}
          />
        </Options>
      )}
    </Screen>
  );
}

export function PaydayDate() {
  const flow = useFlow();
  const income = useIncome();
  const today = todayISO();
  const saved = income?.schedule.anchorDate;
  const [date, setDate] = useState<ISODate>(saved && saved >= today ? saved : today);

  async function save() {
    if (!income) return;
    await saveRecurring(income.id, { schedule: { ...income.schedule, anchorDate: date } });
    flow.next();
  }

  return (
    <Screen
      title="When is your next payday?"
      lede="Tameru counts forward from this date."
      primary={{ label: 'Continue', onClick: save, disabled: !income }}
    >
      <DateStrip today={today} value={date} onChange={setDate} />
    </Screen>
  );
}

export function PaydayAccount() {
  const flow = useFlow();
  const income = useIncome();
  const options = flow.accounts.filter(isDeposit);
  const [accountId, setAccountId] = useState<string | null>(
    income?.accountId ?? options[0]?.id ?? null,
  );

  async function save() {
    if (income) await saveRecurring(income.id, { accountId });
    flow.next();
  }

  return (
    <Screen
      title="Where does it land?"
      lede="The account your pay is deposited into."
      primary={{ label: 'Continue', onClick: save }}
    >
      <Chips<string>
        label="Deposit account"
        options={options.map((a) => ({ value: a.id, label: a.name }))}
        value={accountId}
        onChange={setAccountId}
      />
    </Screen>
  );
}

export function PaydayDone() {
  const flow = useFlow();
  const income = useIncome();
  const { celebrated } = flow.state;

  useEffect(() => {
    if (!celebrated.payday) void celebrate('payday');
    // Once, when the screen appears.
  }, []);

  return (
    <Screen
      title="Payday is set"
      lede="Now for what goes out."
      primary={{
        label: 'Continue',
        onClick: () => flow.next({ celebrated: { ...celebrated, payday: true } }),
      }}
    >
      {income && (
        <dl className="ob-facts">
          <div>
            <dt>
              {flow.state.incomeVaries
                ? 'A slow month'
                : `${FREQUENCY_LABELS[income.schedule.freq]}${income.variable ? ', at least' : ''}`}
            </dt>
            <dd className="mono ob-pos">+{flow.money(income.amountCents)}</dd>
          </div>
          <div>
            <dt>About each month</dt>
            <dd className="mono ob-pos">+{flow.money(monthlyEquivalent(income))}</dd>
          </div>
        </dl>
      )}
    </Screen>
  );
}

// ---- bills ------------------------------------------------------------------

const BILLS = [
  { key: 'rent', name: 'Rent or mortgage' },
  { key: 'phone', name: 'Phone' },
  { key: 'internet', name: 'Internet' },
  { key: 'utilities', name: 'Utilities' },
  { key: 'insurance', name: 'Insurance' },
  { key: 'transit', name: 'Transit pass' },
  { key: 'streaming', name: 'Streaming' },
  { key: 'gym', name: 'Gym' },
];

const CUSTOM_BILL = 'bill:custom:';

/** The bill being added or edited in the sheet. */
interface BillDraft {
  origin: string;
  name: string;
  /** The user's own bill: its name can be typed. */
  custom: boolean;
}

/** This month's date for a day of the month, clamped to the month's length. */
function dateThisMonth(today: ISODate, day: number): ISODate {
  const last = daysInMonth(Number(today.slice(0, 4)), Number(today.slice(5, 7)));
  return `${today.slice(0, 8)}${String(Math.min(day, last)).padStart(2, '0')}`;
}

function BillSheet({
  bill,
  existing,
  onClose,
}: {
  bill: BillDraft;
  existing: Recurring | undefined;
  onClose(): void;
}) {
  const flow = useFlow();
  const [name, setName] = useState(existing?.name ?? bill.name);
  const [amount, setAmount] = useState(
    existing ? centsToInput(existing.amountCents, flow.currency) : '',
  );
  const [day, setDay] = useState(existing ? Number(existing.schedule.anchorDate.slice(8)) : 1);
  const cents = parseMoneyInput(amount, flow.currency);
  const valid = name.trim() !== '' && cents !== null && cents > 0;
  const title = bill.custom ? (existing ? 'Edit bill' : 'Add a bill') : bill.name;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!valid) return;
    await upsertRecurring(bill.origin, {
      name: name.trim(),
      amountCents: cents,
      schedule: { freq: 'monthly', anchorDate: dateThisMonth(todayISO(), day) },
      kind: 'bill',
      categoryId: null,
    });
    onClose();
  }

  async function remove() {
    await removeRecurringByOrigin(bill.origin);
    onClose();
  }

  return (
    <Sheet label={title} onClose={onClose}>
      <form className="stack" onSubmit={(event) => void save(event)}>
        <h2 className="dialog__title">{title}</h2>
        {bill.custom && (
          <label className="field">
            <span className="field__label">Name</span>
            <input
              className="input"
              type="text"
              maxLength={40}
              autoComplete="off"
              autoFocus={!existing}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
        )}
        <label className="field">
          <span className="field__label">Amount each month</span>
          <input
            className="input num"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            autoFocus={!bill.custom || existing !== undefined}
            placeholder="0.00"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </label>
        <label className="field">
          <span className="field__label">Due on day</span>
          <select
            className="input"
            value={day}
            onChange={(event) => setDay(Number(event.target.value))}
          >
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <div className="dialog__actions">
          {existing ? (
            <button type="button" className="btn btn--quiet" onClick={() => void remove()}>
              Remove
            </button>
          ) : (
            <button type="button" className="btn btn--quiet" onClick={onClose}>
              Cancel
            </button>
          )}
          <button type="submit" className="btn btn--primary" disabled={!valid}>
            Save
          </button>
        </div>
      </form>
    </Sheet>
  );
}

export function BillsPick() {
  const flow = useFlow();
  const [open, setOpen] = useState<BillDraft | null>(null);
  const saved = (origin: string) => flow.recurring.find((item) => item.origin === origin);
  const own = flow.recurring.filter((item) => item.origin?.startsWith(CUSTOM_BILL));
  const rows: BillDraft[] = [
    ...BILLS.map(({ key, name }) => ({ origin: `bill:${key}`, name, custom: false })),
    ...own.map((item) => ({ origin: item.origin!, name: item.name, custom: true })),
  ];
  const total = rows.reduce((sum, row) => sum + (saved(row.origin)?.amountCents ?? 0), 0);

  return (
    <Screen
      title="Which regular bills do you pay?"
      lede="Tap one to add its amount. Tameru keeps that money out of your daily number."
      primary={{ label: 'Continue', onClick: () => flow.next() }}
    >
      <Options label="Bills">
        {rows.map((row) => {
          const item = saved(row.origin);
          return (
            <Option
              key={row.origin}
              label={row.name}
              hint={item && <span className="mono">{flow.money(item.amountCents)}</span>}
              selected={item !== undefined}
              onClick={() => setOpen(row)}
            />
          );
        })}
        <button
          type="button"
          className="ob-option ob-option--add"
          onClick={() => setOpen({ origin: CUSTOM_BILL + newId(), name: '', custom: true })}
        >
          Add another bill
        </button>
      </Options>
      {total > 0 && (
        <dl className="ob-facts ob-facts--plain">
          <div className="ob-facts__total">
            <dt>Bills each month</dt>
            <dd className="mono">{flow.money(total)}</dd>
          </div>
        </dl>
      )}
      {open && (
        <BillSheet
          // Remount per bill so the form starts from that bill's values.
          key={open.origin}
          bill={open}
          existing={saved(open.origin)}
          onClose={() => setOpen(null)}
        />
      )}
    </Screen>
  );
}

// ---- reveal -----------------------------------------------------------------

export function Reveal() {
  const flow = useFlow();
  const { celebrated } = flow.state;
  const result = safeToSpend({
    today: todayISO(),
    recurring: flow.recurring,
    goals: flow.goals,
    transactions: flow.transactions,
  });
  const slices: Slice[] = [
    { key: 'bills', label: 'Bills', cents: result.billsCents },
    { key: 'goals', label: 'Goals', cents: result.goalsCents },
    { key: 'spent', label: 'Spent so far', cents: result.spentCents },
    { key: 'free', label: 'Free to spend', cents: Math.max(0, result.remainingCents) },
  ];

  useEffect(() => {
    if (!celebrated.reveal) void celebrate('reveal');
    // Once, when the screen appears.
  }, []);

  async function setGoals() {
    await finishOnboarding();
    flow.go(startDreams(flow.state));
  }

  return (
    <Screen
      title="You can safely spend"
      primary={{ label: 'Start using Tameru', onClick: () => flow.next() }}
    >
      <p className="ob-reveal">
        <CountUpMoney cents={result.perDayCents} className="ob-reveal__figure mono" />
        <span className="ob-reveal__unit">a day, for the next {result.daysLeft} days</span>
      </p>
      {result.hasIncome ? (
        <AllocationBar slices={slices} total={result.incomeCents} />
      ) : (
        <p className="ob__lede">Add a payday in Plan and this number will fill in.</p>
      )}
      <button
        type="button"
        className="btn btn--secondary btn--block"
        onClick={() => void setGoals()}
      >
        Set savings goals first
      </button>
    </Screen>
  );
}
