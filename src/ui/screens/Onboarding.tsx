// Onboarding conversation: renders one question at a time from the pure state machine.
// Progress is saved after every step so quitting resumes on the same question.
// Every step shares one frame (back · progress · skip, a big question, a pinned
// Continue) and slides in from the side it came from.

import { useEffect, useRef, useState } from 'preact/hooks';
import { money, reasonText, S } from '../../copy/strings';
import {
  ACCOUNT_LABEL_DEFAULTS,
  answer,
  back,
  currentStep,
  defaultAccount,
  defaultNextPayday,
  goalTempId,
  HABIT_PICKS,
  isComplete,
  isFullName,
  pickMidpoint,
  skip,
  steps,
  type AccountAnswer,
  type AccountChoice,
  type Answer,
  type BillAnswer,
  type GoalAnswer,
  type IncomeAnswer,
  type OnboardingState,
  type StepId,
} from '../../domain/onboarding';
import type { GeneratedPlan } from '../../domain/planGenerator';
import type { Cents, Frequency } from '../../domain/types';
import { finishOnboarding, loadProgress, previewPlan, saveProgress } from '../../services/onboarding';
import { CardPicker } from '../cards';
import { Amount, ChipSelect, MoneyInput, MonthlyDayInput } from '../components';
import { useApp, useLoad } from '../hooks';
import { BankIcon, CardIcon, CashIcon, CheckIcon, ChevronLeft, ChevronRight, JarIcon, PlusIcon, TrendIcon } from '../Icons';
import { haptic } from '../motion';
import { Sheet } from '../Sheet';

const ACCOUNT_CHOICES: AccountChoice[] = ['chequing', 'savings', 'credit_card', 'investing', 'cash'];
const ACCOUNT_ICONS: Record<AccountChoice, () => preact.JSX.Element> = {
  chequing: BankIcon,
  savings: JarIcon,
  credit_card: CardIcon,
  investing: TrendIcon,
  cash: CashIcon,
};
const FREQS: Frequency[] = ['weekly', 'biweekly', 'semimonthly', 'monthly', 'irregular'];

const sectionOf = (step: StepId): string | undefined => {
  switch (step.id) {
    case 'income':
    case 'more_income':
      return S.onboarding.section.income;
    case 'account_types':
    case 'account_detail':
      return S.onboarding.section.accounts;
    case 'bills':
      return S.onboarding.section.bills;
    case 'habit':
      return S.onboarding.section.habits;
    case 'goals':
      return S.onboarding.section.goals;
    case 'period':
      return S.onboarding.section.period;
    case 'review':
      return S.onboarding.section.review;
    default:
      return undefined;
  }
};

export function Onboarding({ onDone }: { onDone: () => void }) {
  const { app } = useApp();
  const [state, setState] = useState<OnboardingState>();
  const dir = useRef<'fwd' | 'back'>('fwd');
  useEffect(() => {
    loadProgress(app).then(setState);
  }, []);
  useEffect(() => window.scrollTo({ top: 0 }), [state?.index]);
  if (!state) return <div class="placeholder" />;
  if (isComplete(state)) return null;

  const move = (next: OnboardingState) => {
    dir.current = next.index < state.index ? 'back' : 'fwd';
    setState(next);
    saveProgress(app, next);
  };
  const go = (a: Answer) => {
    haptic(6);
    move(answer(state, a));
  };
  const step = currentStep(state);
  const today = app.clock.today();
  const total = steps(state.answers).length;
  const skippable = step.id !== 'welcome' && step.id !== 'review';
  const eyebrow = sectionOf(step);

  const body = (() => {
    switch (step.id) {
      case 'welcome':
        return <Welcome initialName={state.answers.name} onStart={(name) => go({ step: 'welcome', name })} />;
      case 'income':
        return (
          <IncomeForm
            today={today}
            initial={state.answers.incomes[0]}
            head={<Head eyebrow={eyebrow} title={S.onboarding.incomeQ} sub={S.onboarding.incomeSub} />}
            submitLabel={S.onboarding.continue}
            onSubmit={(income) => go({ step: 'income', income })}
          />
        );
      case 'more_income':
        return <MoreIncome eyebrow={eyebrow} incomes={state.answers.incomes} today={today} onAdd={(income) => go({ step: 'more_income', income })} onDone={() => go({ step: 'more_income' })} />;
      case 'account_types':
        return <AccountTypes eyebrow={eyebrow} initial={state.answers.accountTypes} onSubmit={(types) => go({ step: 'account_types', types })} />;
      case 'account_detail':
        return (
          <AccountDetail
            key={step.type}
            eyebrow={eyebrow}
            today={today}
            initial={state.answers.accounts.find((a) => a.type === step.type) ?? defaultAccount(step.type)}
            onSubmit={(account) => go({ step: 'account_detail', account })}
          />
        );
      case 'bills':
        return <Bills eyebrow={eyebrow} today={today} initial={state.answers.bills} accountTypes={state.answers.accountTypes} onSubmit={(bills) => go({ step: 'bills', bills })} />;
      case 'habit':
        return <Habit key={step.key} eyebrow={eyebrow} habit={step.key} initial={state.answers.habitsWeekly[step.key]} onSubmit={(weeklyCents) => go({ step: 'habit', key: step.key, weeklyCents })} />;
      case 'goals':
        return <Goals eyebrow={eyebrow} today={today} initial={state.answers.goals} onSubmit={(goals) => go({ step: 'goals', goals })} />;
      case 'period':
        return (
          <section>
            <Head eyebrow={eyebrow} title={S.onboarding.periodQ} />
            <div class="onb-options">
              <OptionCard title={S.onboarding.periodMonth} sub={S.onboarding.periodMonthSub} on={state.answers.periodAlignment === 'month'} onClick={() => go({ step: 'period', alignment: 'month' })} />
              {state.answers.incomes.some((i) => i.freq !== 'irregular') && (
                <OptionCard title={S.onboarding.periodPayday} sub={S.onboarding.periodPaydaySub} on={state.answers.periodAlignment === 'payday'} onClick={() => go({ step: 'period', alignment: 'payday' })} />
              )}
            </div>
          </section>
        );
      case 'review':
        return (
          <Review
            eyebrow={eyebrow}
            state={state}
            today={today}
            onAccept={async (plan) => {
              await finishOnboarding(app, state.answers, plan);
              onDone();
            }}
          />
        );
    }
  })();

  return (
    <div class={`onb${step.id === 'welcome' ? ' onb--welcome' : ''}`}>
      {step.id !== 'welcome' && (
        <header class="onb__bar">
          <button type="button" class="icon-btn icon-btn--soft onb__back" aria-label={S.common.back} onClick={() => move(back(state))}>
            <ChevronLeft />
          </button>
          <div class="onb__progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={state.index + 1} aria-label={`${state.index + 1} / ${total}`}>
            <span style={{ width: `${((state.index + 1) / total) * 100}%` }} />
          </div>
          <button type="button" class="onb__skip" style={{ visibility: skippable ? 'visible' : 'hidden' }} onClick={() => move(skip(state))}>
            {S.common.skip}
          </button>
        </header>
      )}
      <div class={`onb__step onb__step--${dir.current}`} key={`${state.index}:${step.id}`}>
        {body}
      </div>
    </div>
  );
}

// ---------- shared pieces ----------

function Head(props: { eyebrow?: string; title: string; sub?: string }) {
  return (
    <div class="onb-head">
      {props.eyebrow && <p class="eyebrow">{props.eyebrow}</p>}
      <h1>{props.title}</h1>
      {props.sub && <p class="onb-head__sub">{props.sub}</p>}
    </div>
  );
}

/** The pinned bottom action. */
function Footer(props: { children: preact.ComponentChildren }) {
  return <div class="onb__footer">{props.children}</div>;
}

function Switch(props: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label class="switch">
      <span>{props.label}</span>
      <input type="checkbox" role="switch" checked={props.checked} onChange={(e) => props.onChange((e.target as HTMLInputElement).checked)} />
    </label>
  );
}

function OptionCard(props: { title: string; sub?: string; on?: boolean; onClick: () => void; icon?: preact.ComponentChildren }) {
  return (
    <button type="button" class={`onb-option${props.on ? ' on' : ''}`} aria-pressed={props.on} onClick={props.onClick}>
      {props.icon && <span class="onb-option__icon">{props.icon}</span>}
      <span class="onb-option__text">
        <strong>{props.title}</strong>
        {props.sub && <small>{props.sub}</small>}
      </span>
      <span class="onb-option__end">{props.on ? <CheckIcon /> : <ChevronRight />}</span>
    </button>
  );
}

/** A tappable summary row (an added bill, income or goal). */
function Item(props: { title: string; meta: string; tag?: string; onClick?: () => void }) {
  const inner = (
    <>
      <span class="onb-item__text">
        <strong>{props.title}</strong>
        <small>{props.meta}</small>
      </span>
      {props.tag && <span class="onb-item__tag">{props.tag}</span>}
      {props.onClick && <ChevronRight />}
    </>
  );
  return props.onClick ? (
    <button type="button" class="onb-item" onClick={props.onClick}>
      {inner}
    </button>
  ) : (
    <div class="onb-item">{inner}</div>
  );
}

function Money(props: { label: string; value: Cents | undefined; onChange: (c: Cents | undefined) => void; autoFocus?: boolean }) {
  return (
    <label class="field field--money">
      {props.label}
      <span class="field__box">
        <span class="field__cur">$</span>
        <MoneyInput value={props.value} onChange={props.onChange} autoFocus={props.autoFocus} />
      </span>
    </label>
  );
}

// ---------- steps ----------

function Welcome(props: { initialName?: string; onStart: (name: string) => void }) {
  const [name, setName] = useState(props.initialName ?? '');
  const ok = isFullName(name);
  return (
    <form
      class="onb-welcome"
      onSubmit={(e) => {
        e.preventDefault();
        if (ok) props.onStart(name);
      }}
    >
      <div class="onb-welcome__hero">
        <img class="onb-welcome__icon" src="./icons/apple-touch-icon.png" alt="" width={72} height={72} />
        <h1>{S.onboarding.welcomeTitle}</h1>
        <p>{S.onboarding.welcomeBody}</p>
      </div>
      <div class="onb-welcome__form">
        <label class="field">
          {S.onboarding.nameQ}
          <input
            value={name}
            required
            autoComplete="name"
            autoCapitalize="words"
            enterKeyHint="go"
            placeholder={S.onboarding.namePlaceholder}
            onInput={(e) => setName((e.target as HTMLInputElement).value)}
          />
        </label>
      </div>
      <Footer>
        <button type="submit" class="primary block" disabled={!ok}>
          {S.onboarding.start}
        </button>
      </Footer>
    </form>
  );
}

function IncomeForm(props: { today: string; initial?: IncomeAnswer; head?: preact.ComponentChildren; submitLabel: string; inSheet?: boolean; onSubmit: (i: IncomeAnswer) => void }) {
  const [freq, setFreq] = useState<Frequency>(props.initial?.freq ?? 'biweekly');
  const [name, setName] = useState(props.initial?.name ?? '');
  const [varies, setVaries] = useState(!!props.initial?.range);
  const [amount, setAmount] = useState<Cents | undefined>(props.initial?.range?.minCents ?? props.initial?.amountCents);
  const [max, setMax] = useState<Cents | undefined>(props.initial?.range?.maxCents);
  const [nextDate, setNextDate] = useState(props.initial?.nextDate ?? defaultNextPayday('biweekly', props.today));
  const submit = (
    <button type="submit" class="primary block">
      {props.submitLabel}
    </button>
  );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const range = varies && amount !== undefined && max !== undefined ? { minCents: Math.min(amount, max), maxCents: Math.max(amount, max) } : undefined;
        props.onSubmit({ name: name.trim() || S.onboarding.defaultIncomeName, freq, nextDate, ...(range ? { range } : { amountCents: amount ?? 0 }) });
      }}
    >
      {props.head}
      <p class="field-label">{S.onboarding.howOften}</p>
      <ChipSelect
        label={S.onboarding.howOften}
        options={FREQS.map((f) => ({ value: f, label: S.freq[f] }))}
        value={freq}
        onChange={(f) => (setFreq(f), setNextDate(defaultNextPayday(f, props.today)))}
      />
      <label class="field">
        {S.onboarding.incomeName}
        <input value={name} placeholder={S.onboarding.incomeNamePlaceholder} autoCapitalize="sentences" onInput={(e) => setName((e.target as HTMLInputElement).value)} />
      </label>
      <div class={`field-pair${varies ? ' field-pair--two' : ''}`}>
        <Money label={S.onboarding.incomeAmountQ} value={amount} onChange={setAmount} />
        {varies && <Money label={S.onboarding.incomeTo} value={max} onChange={setMax} />}
      </div>
      <Switch label={S.onboarding.incomeVaries} checked={varies} onChange={setVaries} />
      {freq !== 'irregular' && (
        <label class="field">
          {S.onboarding.nextPaydayQ}
          <input type="date" value={nextDate} onInput={(e) => setNextDate((e.target as HTMLInputElement).value)} />
        </label>
      )}
      {props.inSheet ? <div class="sheet__actions">{submit}</div> : <Footer>{submit}</Footer>}
    </form>
  );
}

const incomeMeta = (i: IncomeAnswer) =>
  `${i.range ? `${money(i.range.minCents)} – ${money(i.range.maxCents)}` : money(i.amountCents ?? 0)} · ${S.freq[i.freq].toLowerCase()}`;

function MoreIncome(props: { eyebrow?: string; incomes: IncomeAnswer[]; today: string; onAdd: (i: IncomeAnswer) => void; onDone: () => void }) {
  const [adding, setAdding] = useState(false);
  return (
    <section>
      <Head eyebrow={props.eyebrow} title={S.onboarding.moreIncomeQ} sub={S.onboarding.moreIncomeSub} />
      <div class="onb-list">
        {props.incomes.map((i, k) => (
          <Item key={k} title={i.name} meta={incomeMeta(i)} />
        ))}
        <button type="button" class="onb-add" onClick={() => setAdding(true)}>
          <PlusIcon /> {S.onboarding.addAnother}
        </button>
      </div>
      <Footer>
        <button type="button" class="primary block" onClick={props.onDone}>
          {S.onboarding.noMore}
        </button>
      </Footer>
      {adding && (
        <Sheet label={S.onboarding.addAnother} onClose={() => setAdding(false)}>
          <div class="onb-sheet">
            <h2>{S.onboarding.addAnother}</h2>
            <IncomeForm
              today={props.today}
              inSheet
              submitLabel={S.onboarding.add}
              onSubmit={(i) => {
                setAdding(false);
                props.onAdd(i);
              }}
            />
          </div>
        </Sheet>
      )}
    </section>
  );
}

function AccountTypes(props: { eyebrow?: string; initial: AccountChoice[]; onSubmit: (t: AccountChoice[]) => void }) {
  const [types, setTypes] = useState<AccountChoice[]>(props.initial.length ? props.initial : ['chequing']);
  const toggle = (t: AccountChoice) => {
    haptic(5);
    setTypes(types.includes(t) ? types.filter((x) => x !== t) : [...types, t]);
  };
  return (
    <section>
      <Head eyebrow={props.eyebrow} title={S.onboarding.accountsQ} sub={S.onboarding.accountsSub} />
      <div class="onb-tiles">
        {ACCOUNT_CHOICES.map((t) => {
          const Icon = ACCOUNT_ICONS[t];
          const on = types.includes(t);
          return (
            <button type="button" key={t} class={`onb-tile${on ? ' on' : ''}`} aria-pressed={on} onClick={() => toggle(t)}>
              <span class="onb-tile__icon">
                <Icon />
              </span>
              <strong>{S.accountType[t]}</strong>
              <small>{S.onboarding.accountHint[t]}</small>
              <span class="onb-tile__check" aria-hidden="true">
                <CheckIcon />
              </span>
            </button>
          );
        })}
      </div>
      <Footer>
        <button type="button" class="primary block" disabled={types.length === 0} onClick={() => props.onSubmit(types)}>
          {S.onboarding.continue}
        </button>
      </Footer>
    </section>
  );
}

function AccountDetail(props: { eyebrow?: string; initial: AccountAnswer; today: string; onSubmit: (a: AccountAnswer) => void }) {
  const [a, setA] = useState(props.initial);
  const [rate, setRate] = useState(a.rateBps ? String(a.rateBps / 100) : '');
  const isCard = a.type === 'credit_card';
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        props.onSubmit({ ...a, name: a.name.trim() || ACCOUNT_LABEL_DEFAULTS[a.type], ...(a.type === 'savings' ? { rateBps: Math.round(Number(rate) * 100) || 0 } : {}) });
      }}
    >
      <Head eyebrow={props.eyebrow} title={S.onboarding.accountQ(S.accountType[a.type])} sub={S.onboarding.accountSub} />
      {(isCard || a.type === 'chequing') && (
        <div class="onb-card-picker">
          <CardPicker value={a.face} onChange={(face) => setA({ ...a, face })} kind={isCard ? 'credit' : 'debit'} fallbackName={a.name || ACCOUNT_LABEL_DEFAULTS[a.type]} />
        </div>
      )}
      <label class="field">
        {S.common.name}
        <input value={a.name} placeholder={ACCOUNT_LABEL_DEFAULTS[a.type]} onInput={(e) => setA({ ...a, name: (e.target as HTMLInputElement).value })} />
      </label>
      <Money label={isCard ? S.accounts.openingOwing : S.accounts.openingBalance} value={a.balanceCents || undefined} onChange={(c) => setA({ ...a, balanceCents: c ?? 0 })} />
      {a.type === 'savings' && (
        <>
          <label class="field">
            {S.onboarding.rateQ}
            <input inputMode="decimal" placeholder="0.00" value={rate} onInput={(e) => setRate((e.target as HTMLInputElement).value)} />
          </label>
          <ChipSelect
            label={S.accounts.rateKind}
            options={[
              { value: 'apy', label: S.accounts.apy },
              { value: 'apr', label: S.accounts.apr },
            ]}
            value={a.rateKind === 'apr' ? 'apr' : 'apy'}
            onChange={(rateKind) => setA({ ...a, rateKind })}
          />
        </>
      )}
      {isCard && (
        <>
          <Money label={S.onboarding.feeQ} value={a.monthlyFeeCents || undefined} onChange={(c) => setA({ ...a, monthlyFeeCents: c ?? 0 })} />
          <MonthlyDayInput label={S.accounts.dueDay} day={a.dueDay ?? 22} today={props.today} onChange={(dueDay) => setA({ ...a, dueDay })} />
        </>
      )}
      <Footer>
        <button type="submit" class="primary block">
          {S.onboarding.continue}
        </button>
      </Footer>
    </form>
  );
}

function Bills(props: { eyebrow?: string; today: string; initial: BillAnswer[]; accountTypes: AccountChoice[]; onSubmit: (b: BillAnswer[]) => void }) {
  const [bills, setBills] = useState<BillAnswer[]>(props.initial);
  // The bill being edited: an index into bills, or a new one (with a suggested name).
  const [editing, setEditing] = useState<{ index: number } | { draft: BillAnswer } | null>(null);
  const payOptions = props.accountTypes.filter((t) => t !== 'investing' && t !== 'savings');
  const unused = S.onboarding.billSuggestions.filter((n) => !bills.some((b) => b.name.toLowerCase() === n.toLowerCase()));
  const newBill = (name = ''): BillAnswer => ({ name, amountCents: 0, day: 1, kind: /spotify|netflix|gym/i.test(name) ? 'subscription' : 'bill' });
  const current = editing && ('index' in editing ? bills[editing.index] : editing.draft);
  return (
    <section>
      <Head eyebrow={props.eyebrow} title={S.onboarding.billsQ} sub={S.onboarding.billsHint} />
      <div class="onb-list">
        {bills.length === 0 && <p class="onb-empty">{S.onboarding.billsEmpty}</p>}
        {bills.map((b, k) => (
          <Item key={k} title={b.name || S.onboarding.addBill} meta={S.onboarding.billMeta(b.amountCents, b.day)} tag={b.kind === 'subscription' ? S.recurring.kind.subscription : undefined} onClick={() => setEditing({ index: k })} />
        ))}
        <button type="button" class="onb-add" onClick={() => setEditing({ draft: newBill() })}>
          <PlusIcon /> {S.onboarding.addBill}
        </button>
      </div>
      {unused.length > 0 && (
        <div class="onb-suggest">
          {unused.map((n) => (
            <button type="button" key={n} class="chip" onClick={() => setEditing({ draft: newBill(n) })}>
              <PlusIcon /> {n}
            </button>
          ))}
        </div>
      )}
      <Footer>
        <button type="button" class="primary block" onClick={() => props.onSubmit(bills)}>
          {S.onboarding.continue}
        </button>
      </Footer>
      {editing && current && (
        <Sheet label={S.onboarding.editBill} onClose={() => setEditing(null)}>
          <div class="onb-sheet">
            <BillForm
              initial={current}
              today={props.today}
              payOptions={payOptions}
              isNew={'draft' in editing}
              onSave={(b) => {
                setBills('index' in editing ? bills.map((x, j) => (j === editing.index ? b : x)) : [...bills, b]);
                setEditing(null);
              }}
              onRemove={'index' in editing ? () => (setBills(bills.filter((_, j) => j !== editing.index)), setEditing(null)) : undefined}
            />
          </div>
        </Sheet>
      )}
    </section>
  );
}

function BillForm(props: { initial: BillAnswer; today: string; payOptions: AccountChoice[]; isNew: boolean; onSave: (b: BillAnswer) => void; onRemove?: () => void }) {
  const [b, setB] = useState(props.initial);
  const set = (p: Partial<BillAnswer>) => setB({ ...b, ...p });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (b.amountCents > 0) props.onSave({ ...b, name: b.name.trim() || S.onboarding.addBill });
      }}
    >
      <h2>{props.isNew ? S.onboarding.addBill : S.onboarding.editBill}</h2>
      <label class="field">
        {S.common.name}
        <input value={b.name} autoFocus={!b.name} autoCapitalize="words" placeholder={S.onboarding.billSuggestions[0]} onInput={(e) => set({ name: (e.target as HTMLInputElement).value })} />
      </label>
      <Money label={S.common.amount} value={b.amountCents || undefined} autoFocus={!!b.name && !b.amountCents} onChange={(c) => set({ amountCents: c ?? 0 })} />
      <MonthlyDayInput label={S.onboarding.billDay} day={b.day} today={props.today} onChange={(day) => set({ day })} />
      <Switch label={S.recurring.kind.subscription} checked={b.kind === 'subscription'} onChange={(v) => set({ kind: v ? 'subscription' : 'bill' })} />
      {props.payOptions.length > 1 && (
        <>
          <p class="field-label">{S.recurring.payFrom}</p>
          <ChipSelect
            label={S.recurring.payFrom}
            options={props.payOptions.map((t) => ({ value: t, label: S.accountType[t] }))}
            value={b.payFrom?.[0] ?? props.payOptions[0]}
            onChange={(t) => set({ payFrom: [t] })}
          />
        </>
      )}
      <div class="sheet__actions">
        <button type="submit" class="primary block" disabled={b.amountCents <= 0}>
          {props.isNew ? S.onboarding.add : S.common.save}
        </button>
        {props.onRemove && (
          <button type="button" class="link" onClick={props.onRemove}>
            {S.common.remove}
          </button>
        )}
      </div>
    </form>
  );
}

function Habit(props: { eyebrow?: string; habit: keyof typeof HABIT_PICKS; initial?: Cents; onSubmit: (c: Cents) => void }) {
  const [custom, setCustom] = useState<Cents | undefined>();
  const picked = (p: { lo: Cents; hi: Cents }) => props.initial !== undefined && props.initial === pickMidpoint(p);
  return (
    <section>
      <Head eyebrow={props.eyebrow} title={S.onboarding.habitQ[props.habit]} sub={S.onboarding.habitSub} />
      <div class="onb-options">
        {HABIT_PICKS[props.habit].map((p) => (
          <OptionCard key={p.hi} title={S.onboarding.pickRange(p.lo, p.hi)} on={picked(p)} onClick={() => props.onSubmit(pickMidpoint(p))} />
        ))}
      </div>
      <Money label={S.onboarding.habitOther} value={custom} onChange={setCustom} />
      {custom !== undefined && (
        <Footer>
          <button type="button" class="primary block" onClick={() => props.onSubmit(custom)}>
            {S.onboarding.continue}
          </button>
        </Footer>
      )}
    </section>
  );
}

function Goals(props: { eyebrow?: string; today: string; initial: GoalAnswer[]; onSubmit: (g: GoalAnswer[]) => void }) {
  const [goals, setGoals] = useState<GoalAnswer[]>(props.initial);
  const [editing, setEditing] = useState<{ index: number } | { draft: GoalAnswer } | null>(null);
  const current = editing && ('index' in editing ? goals[editing.index] : editing.draft);
  const unused = S.onboarding.goalSuggestions.filter((n) => !goals.some((g) => g.name.toLowerCase() === n.toLowerCase()));
  const full = goals.length >= 3;
  return (
    <section>
      <Head eyebrow={props.eyebrow} title={S.onboarding.goalsQ} sub={S.onboarding.goalsHint} />
      <div class="onb-list">
        {goals.length === 0 && <p class="onb-empty">{S.onboarding.goalsEmpty}</p>}
        {goals.map((g, k) => (
          <Item key={k} title={g.name} meta={S.onboarding.goalMeta(g.targetCents, g.targetDate)} onClick={() => setEditing({ index: k })} />
        ))}
        {!full && (
          <button type="button" class="onb-add" onClick={() => setEditing({ draft: { name: '' } })}>
            <PlusIcon /> {S.onboarding.addGoal}
          </button>
        )}
      </div>
      {!full && unused.length > 0 && (
        <div class="onb-suggest">
          {unused.map((n) => (
            <button type="button" key={n} class="chip" onClick={() => setEditing({ draft: { name: n } })}>
              <PlusIcon /> {n}
            </button>
          ))}
        </div>
      )}
      <Footer>
        <button type="button" class="primary block" onClick={() => props.onSubmit(goals)}>
          {S.onboarding.continue}
        </button>
      </Footer>
      {editing && current && (
        <Sheet label={S.onboarding.editGoal} onClose={() => setEditing(null)}>
          <div class="onb-sheet">
            <GoalForm
              initial={current}
              isNew={'draft' in editing}
              onSave={(g) => {
                setGoals('index' in editing ? goals.map((x, j) => (j === editing.index ? g : x)) : [...goals, g]);
                setEditing(null);
              }}
              onRemove={'index' in editing ? () => (setGoals(goals.filter((_, j) => j !== editing.index)), setEditing(null)) : undefined}
            />
          </div>
        </Sheet>
      )}
    </section>
  );
}

function GoalForm(props: { initial: GoalAnswer; isNew: boolean; onSave: (g: GoalAnswer) => void; onRemove?: () => void }) {
  const [g, setG] = useState(props.initial);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (g.name.trim()) props.onSave({ ...g, name: g.name.trim() });
      }}
    >
      <h2>{props.isNew ? S.onboarding.addGoal : S.onboarding.editGoal}</h2>
      <label class="field">
        {S.common.name}
        <input value={g.name} autoFocus={!g.name} autoCapitalize="sentences" placeholder={S.onboarding.goalNamePlaceholder} onInput={(e) => setG({ ...g, name: (e.target as HTMLInputElement).value })} />
      </label>
      <Money label={`${S.plan.target} ${S.common.optional}`} value={g.targetCents} onChange={(c) => setG({ ...g, targetCents: c })} />
      <label class="field">
        {S.plan.targetDate} {S.common.optional}
        <input type="date" value={g.targetDate ?? ''} onInput={(e) => setG({ ...g, targetDate: (e.target as HTMLInputElement).value || undefined })} />
      </label>
      <div class="sheet__actions">
        <button type="submit" class="primary block" disabled={!g.name.trim()}>
          {props.isNew ? S.onboarding.add : S.common.save}
        </button>
        {props.onRemove && (
          <button type="button" class="link" onClick={props.onRemove}>
            {S.common.remove}
          </button>
        )}
      </div>
    </form>
  );
}

function Review(props: { eyebrow?: string; state: OnboardingState; today: string; onAccept: (p: GeneratedPlan) => Promise<void> }) {
  const generate = () => previewPlan(props.state.answers, props.today);
  const [plan, setPlan] = useState<GeneratedPlan>(generate);
  const [saving, setSaving] = useState(false);
  const categories = useLoad((a) => a.repos.categories.all()) ?? [];
  const label = (id: string) => {
    const g = props.state.answers.goals.findIndex((_, k) => goalTempId(k) === id);
    if (g >= 0) return props.state.answers.goals[g]!.name;
    return categories.find((c) => c.id === id)?.name ?? '';
  };
  const s = plan.summary;
  const parts = [
    { key: 'fixed', cents: s.fixedCents },
    { key: 'flex', cents: s.flexibleCents },
    { key: 'goals', cents: s.goalsCents },
    { key: 'free', cents: s.unassignedCents },
  ] as const;
  const whole = Math.max(1, parts.reduce((t, p) => t + Math.max(0, p.cents), 0));
  const row = (id: string, c: Cents, onChange: (v: Cents) => void) => (
    <li key={id} class="onb-alloc">
      <span class="onb-alloc__text">
        <strong>{label(id)}</strong>
        {plan.reasons[id]?.[0] && <small>{reasonText(plan.reasons[id]![0]!)}</small>}
      </span>
      <span class="onb-alloc__amt">
        <span class="field__cur">$</span>
        <MoneyInput value={c} onChange={(v) => v !== undefined && onChange(v)} />
      </span>
    </li>
  );
  return (
    <section>
      <Head eyebrow={props.eyebrow} title={S.onboarding.reviewTitle} sub={S.onboarding.adjustHint} />
      <div class="onb-review">
        <p class="onb-review__label">{S.onboarding.reviewIncome}</p>
        <p class="onb-review__amount">
          <Amount c={s.incomeCents} />
        </p>
        <div class="onb-review__bar" aria-hidden="true">
          {parts.map((p) => p.cents > 0 && <span key={p.key} class={`part part--${p.key}`} style={{ flexGrow: p.cents / whole }} />)}
        </div>
        <ul class="onb-review__legend">
          {parts.map((p) => (
            <li key={p.key}>
              <span class={`swatch-dot part--${p.key}`} />
              <span>{S.onboarding.reviewParts[p.key]}</span>
              <Amount c={p.cents} />
            </li>
          ))}
        </ul>
      </div>
      <ul class="onb-allocs">
        {Object.entries(plan.allocations).map(([id, c]) => row(id, c, (v) => setPlan({ ...plan, allocations: { ...plan.allocations, [id]: v } })))}
        {Object.entries(plan.goalContributions).map(([id, c]) => row(id, c, (v) => setPlan({ ...plan, goalContributions: { ...plan.goalContributions, [id]: v } })))}
      </ul>
      {plan.flags.map((f) => (
        <p class="note" key={f.goalId}>
          {f.code === 'date_unrealistic' ? S.goalFlag.date_unrealistic(label(f.goalId), f.realisticDate!, f.reachableByDateCents) : S.goalFlag.no_room_now(label(f.goalId))}
        </p>
      ))}
      <Footer>
        <button
          type="button"
          class="primary block"
          disabled={saving}
          onClick={() => {
            setSaving(true);
            haptic(12);
            props.onAccept(plan).catch(() => setSaving(false));
          }}
        >
          {S.onboarding.accept}
        </button>
        <button type="button" class="link onb__secondary" onClick={() => setPlan(generate())}>
          {S.onboarding.regenerate}
        </button>
      </Footer>
    </section>
  );
}
