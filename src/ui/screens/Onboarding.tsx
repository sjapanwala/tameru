// Onboarding as a conversation: Tameru says a line or two (typed in, word by word),
// your last answer shows as a reply, then the controls for this question fade in.
// Renders one question at a time from the pure state machine; progress is saved after
// every step so quitting resumes on the same question. Amounts are set on a dial
// (or typed), dates on a calendar, and bills, spending and goals start from defaults.

import { useEffect, useRef, useState } from 'preact/hooks';
import { money, reasonText, S } from '../../copy/strings';
import { addDays, clampedDay, nextMonthlyDate, parts } from '../../domain/dates';
import {
  ACCOUNT_LABEL_DEFAULTS,
  answer,
  back,
  categoryTempId,
  currentStep,
  defaultAccount,
  defaultNextPayday,
  goalTempId,
  isComplete,
  isFullName,
  skip,
  steps,
  type AccountAnswer,
  type AccountChoice,
  type Answer,
  type BillAnswer,
  type CategoryAnswer,
  type GoalAnswer,
  type IncomeAnswer,
  type OnboardingAnswers,
  type OnboardingState,
  type StepId,
} from '../../domain/onboarding';
import type { GeneratedPlan } from '../../domain/planGenerator';
import { CATEGORY_COLORS, categoryId, nextCategoryColor, SUGGESTED_CATEGORIES } from '../../domain/defaults';
import type { Cents, Frequency } from '../../domain/types';
import { finishOnboarding, loadProgress, previewPlan, saveProgress } from '../../services/onboarding';
import { AmountDial } from '../AmountDial';
import { CalendarPicker } from '../CalendarPicker';
import { CardPicker, ColorPicker } from '../cards';
import { AllocationInput, Amount, AmountModeToggle, MoneyInput, Switch, type AmountMode } from '../components';
import { useApp, useLoad } from '../hooks';
import { BankIcon, CardIcon, CashIcon, CheckIcon, ChevronLeft, ChevronRight, JarIcon, PlusIcon, TrendIcon, WalletIcon } from '../Icons';
import { haptic, reducedMotion } from '../motion';
import { Sheet } from '../Sheet';
import { toast } from '../toast';

const O = S.onboarding;
const ACCOUNT_CHOICES: AccountChoice[] = ['chequing', 'savings', 'credit_card', 'investing', 'cash', 'other'];
const ACCOUNT_ICONS: Record<AccountChoice, () => preact.JSX.Element> = {
  chequing: BankIcon,
  savings: JarIcon,
  credit_card: CardIcon,
  investing: TrendIcon,
  cash: CashIcon,
  other: WalletIcon,
};
const FREQS: Frequency[] = ['biweekly', 'semimonthly', 'monthly', 'weekly', 'irregular'];
const firstName = (a: OnboardingAnswers) => (a.name ?? '').split(' ')[0] ?? '';

const incomeMeta = (i: IncomeAnswer) => `${i.range ? `${money(i.range.minCents)} – ${money(i.range.maxCents)}` : money(i.amountCents ?? 0)} · ${S.freq[i.freq].toLowerCase()}`;

/** What you said on the step before this one, shown as your reply. */
function replyFor(prev: StepId | undefined, a: OnboardingAnswers): string | undefined {
  switch (prev?.id) {
    case 'welcome':
      return a.name;
    case 'income':
      return a.incomes[0] && incomeMeta(a.incomes[0]);
    case 'more_income':
      return a.incomes.length > 1 ? a.incomes.slice(1).map((i) => i.name).join(', ') : O.reply.noMore;
    case 'account_types':
      return O.reply.accounts(a.accountTypes.map((t) => S.accountType[t]));
    case 'account_detail': {
      const acc = a.accounts.find((x) => x.type === prev.type);
      return acc && `${acc.name} · ${money(acc.balanceCents)}`;
    }
    case 'bills':
      return a.bills.length ? a.bills.map((b) => b.name).join(', ') : O.reply.none;
    case 'categories':
      return a.categories.length ? a.categories.map((c) => c.name).join(', ') : O.reply.none;
    case 'goals':
      return a.goals.length ? a.goals.map((g) => g.name).join(', ') : O.reply.none;
    case 'period':
      return a.periodAlignment === 'payday' ? O.periodPayday : O.periodMonth;
    default:
      return undefined;
  }
}

export function Onboarding({ onDone }: { onDone: () => void }) {
  const { app } = useApp();
  const [state, setState] = useState<OnboardingState>();
  const dir = useRef<'fwd' | 'back'>('fwd');
  // A step with its own inner questions (income) handles Back itself first.
  const innerBack = useRef<(() => boolean) | null>(null);
  useEffect(() => {
    loadProgress(app).then(setState);
  }, []);
  useEffect(() => window.scrollTo({ top: 0 }), [state?.index]);
  if (!state) return <div class="placeholder" />;
  if (isComplete(state)) return null;

  const move = (next: OnboardingState) => {
    dir.current = next.index < state.index ? 'back' : 'fwd';
    innerBack.current = null;
    setState(next);
    saveProgress(app, next);
  };
  const go = (a: Answer) => {
    haptic(6);
    move(answer(state, a));
  };
  const list = steps(state.answers);
  const step = currentStep(state);
  const today = app.clock.today();
  const total = list.length;
  const skippable = step.id !== 'welcome' && step.id !== 'review';
  const reply = replyFor(list[state.index - 1], state.answers);
  const first = firstName(state.answers);

  const body = (() => {
    switch (step.id) {
      case 'welcome':
        return <Welcome initialName={state.answers.name} onStart={(name) => go({ step: 'welcome', name })} />;
      case 'income':
        return (
          <IncomeFlow
            first={first}
            reply={reply}
            today={today}
            initial={state.answers.incomes[0]}
            backRef={innerBack}
            submitLabel={O.continue}
            onSubmit={(income) => go({ step: 'income', income })}
          />
        );
      case 'more_income':
        return <MoreIncome reply={reply} incomes={state.answers.incomes} today={today} onAdd={(income) => go({ step: 'more_income', income })} onDone={() => go({ step: 'more_income' })} />;
      case 'account_types':
        return <AccountTypes reply={reply} initial={state.answers.accountTypes} onSubmit={(types) => go({ step: 'account_types', types })} />;
      case 'account_detail':
        return (
          <AccountDetail
            key={step.type}
            reply={reply}
            today={today}
            initial={state.answers.accounts.find((a) => a.type === step.type) ?? defaultAccount(step.type)}
            onSubmit={(account) => go({ step: 'account_detail', account })}
          />
        );
      case 'bills':
        return (
          <Bills
            reply={reply}
            today={today}
            initial={state.answers.bills}
            accountTypes={state.answers.accountTypes}
            onSubmit={(bills) => go({ step: 'bills', bills })}
          />
        );
      case 'categories':
        return <Categories reply={reply} initial={state.answers.categories} onSubmit={(categories) => go({ step: 'categories', categories })} />;
      case 'goals':
        return <Goals reply={reply} today={today} initial={state.answers.goals} onSubmit={(goals) => go({ step: 'goals', goals })} />;
      case 'period':
        return (
          <Talk say={O.talk.period} reply={reply}>
            <div class="onb-options">
              <OptionCard title={O.periodMonth} sub={O.periodMonthSub} on={state.answers.periodAlignment === 'month'} onClick={() => go({ step: 'period', alignment: 'month' })} />
              {state.answers.incomes.some((i) => i.freq !== 'irregular') && (
                <OptionCard title={O.periodPayday} sub={O.periodPaydaySub} on={state.answers.periodAlignment === 'payday'} onClick={() => go({ step: 'period', alignment: 'payday' })} />
              )}
            </div>
          </Talk>
        );
      case 'review':
        return (
          <Review
            first={first}
            reply={reply}
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
          <button type="button" class="icon-btn icon-btn--soft onb__back" aria-label={S.common.back} onClick={() => innerBack.current?.() || move(back(state))}>
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

// ---------- the conversation ----------

const WORD_MS = 42;
const LINE_MS = 260;

/**
 * Tameru talking: your last answer as a reply bubble, then its lines typed in word by
 * word, then the controls. `--after` holds the controls back until the lines are in.
 */
function Talk(props: { say: readonly string[]; reply?: string; children?: preact.ComponentChildren; class?: string }) {
  const still = reducedMotion();
  let t = props.reply ? 320 : 120;
  // The question is the headline; lines before it lead in, lines after it are hints.
  const asks = props.say.map((l) => l.trim().endsWith('?'));
  const head = Math.max(0, asks.lastIndexOf(true)); // no question: the first line leads
  const lines = props.say.map((line, li) => {
    const words = line.split(' ');
    const out = (
      <p key={li} class={`talk__line${li === head ? ' talk__line--head' : li > head ? ' talk__line--hint' : ''}`}>
        {words.map((w, wi) => (
          <span key={wi} class="talk__w" style={{ animationDelay: `${t + wi * WORD_MS}ms` }}>
            {w}{' '}
          </span>
        ))}
      </p>
    );
    t += words.length * WORD_MS + LINE_MS;
    return out;
  });
  return (
    <section class={`talk${props.class ? ` ${props.class}` : ''}`} style={{ '--after': `${still ? 0 : t}ms` }}>
      {props.reply && <p class="talk__reply">{props.reply}</p>}
      <div class="talk__app">
        <img class="talk__avatar" src="./icons/apple-touch-icon.png" alt="" width={32} height={32} />
        <div class="talk__lines">{lines}</div>
      </div>
      <div class="talk__ui">{props.children}</div>
    </section>
  );
}

/** The pinned bottom action. */
function Footer(props: { children: preact.ComponentChildren }) {
  return <div class="onb__footer">{props.children}</div>;
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

/**
 * A default you can tick (bills, spending, goals): the circle toggles it, the row
 * opens its details. Not ticked, the meta asks for a tap.
 */
function PickRow(props: { name: string; meta?: string; on: boolean; dot?: string; disabled?: boolean; onToggle: () => void; onOpen: () => void }) {
  return (
    <li class={`pick${props.on ? ' is-on' : ''}${props.disabled ? ' is-off' : ''}`}>
      <button type="button" class="pick__toggle" aria-pressed={props.on} aria-label={props.name} disabled={props.disabled} onClick={() => (haptic(5), props.onToggle())}>
        <span class="pick__circle" style={props.dot && props.on ? { background: props.dot, borderColor: props.dot } : undefined}>
          {props.on && <CheckIcon />}
        </span>
      </button>
      <button type="button" class="pick__main" disabled={props.disabled} onClick={props.onOpen}>
        <span class="pick__text">
          <strong>{props.name}</strong>
          <small>{props.meta ?? O.notAdded}</small>
        </span>
        <ChevronRight />
      </button>
    </li>
  );
}

function AddRow(props: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <li class="pick pick--add">
      <button type="button" class="pick__main" disabled={props.disabled} onClick={props.onClick}>
        <span class="pick__circle pick__circle--add">
          <PlusIcon />
        </span>
        <span class="pick__text">
          <strong>{props.label}</strong>
        </span>
      </button>
    </li>
  );
}

/** A sheet for one item's details, with its pinned Save (and Remove, when it's added). */
function ItemSheet(props: { title: string; onClose: () => void; onSave: () => void; canSave: boolean; onRemove?: () => void; children: preact.ComponentChildren }) {
  return (
    <Sheet label={props.title} onClose={props.onClose}>
      <form
        class="onb-sheet"
        onSubmit={(e) => {
          e.preventDefault();
          if (props.canSave) props.onSave();
        }}
      >
        {props.children}
        <div class="sheet__actions">
          <button type="submit" class="primary block" disabled={!props.canSave}>
            {O.save}
          </button>
          {props.onRemove && (
            <button type="button" class="link" onClick={props.onRemove}>
              {S.common.remove}
            </button>
          )}
        </div>
      </form>
    </Sheet>
  );
}

/** An editable title at the top of an item's sheet (the bill or goal's name). */
function TitleField(props: { value: string; placeholder: string; onChange: (v: string) => void }) {
  return (
    <input
      class="onb-sheet__title"
      value={props.value}
      placeholder={props.placeholder}
      autoCapitalize="words"
      aria-label={S.common.name}
      onInput={(e) => props.onChange((e.target as HTMLInputElement).value)}
    />
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
      <div class="onb-welcome__glow" aria-hidden="true" />
      <Talk say={O.talk.hello} class="talk--hello">
        <input
          class="talk__input"
          value={name}
          required
          autoComplete="name"
          autoCapitalize="words"
          enterKeyHint="go"
          aria-label={O.nameQ}
          placeholder={O.namePlaceholder}
          onInput={(e) => setName((e.target as HTMLInputElement).value)}
        />
      </Talk>
      <Footer>
        <button type="submit" class="primary block" disabled={!ok}>
          {O.start}
        </button>
      </Footer>
    </form>
  );
}

type IncomePhase = 'how' | 'amount' | 'when';

/**
 * Income as three short exchanges: how often, how much (on the dial), and the next
 * payday (on the calendar). Back steps through them before leaving the step.
 */
function IncomeFlow(props: {
  first?: string;
  reply?: string;
  today: string;
  initial?: IncomeAnswer;
  backRef?: { current: (() => boolean) | null };
  submitLabel: string;
  inSheet?: boolean;
  onSubmit: (i: IncomeAnswer) => void;
}) {
  const [phase, setPhase] = useState<IncomePhase>('how');
  const [freq, setFreq] = useState<Frequency>(props.initial?.freq ?? 'biweekly');
  const [name, setName] = useState(props.initial?.name ?? O.defaultIncomeName);
  const [amount, setAmount] = useState<Cents | undefined>(props.initial?.range?.minCents ?? props.initial?.amountCents);
  const [max, setMax] = useState<Cents | undefined>(props.initial?.range?.maxCents);
  const [nextDate, setNextDate] = useState(props.initial?.nextDate ?? defaultNextPayday('biweekly', props.today));
  const phases: IncomePhase[] = freq === 'irregular' ? ['how', 'amount'] : ['how', 'amount', 'when'];
  const at = phases.indexOf(phase);
  const prev = () => (at > 0 ? (setPhase(phases[at - 1]!), true) : false);
  if (props.backRef) props.backRef.current = prev;

  const submit = () => {
    const range = max !== undefined && amount !== undefined && max > amount ? { minCents: amount, maxCents: max } : undefined;
    props.onSubmit({ name: name.trim() || O.defaultIncomeName, freq, nextDate, ...(range ? { range } : { amountCents: amount ?? 0 }) });
  };
  const advance = () => (at < phases.length - 1 ? (haptic(5), setPhase(phases[at + 1]!)) : submit());
  const action = (label: string, disabled = false) => {
    const btn = (
      <button type="button" class="primary block" disabled={disabled} onClick={advance}>
        {label}
      </button>
    );
    return props.inSheet ? (
      <div class="sheet__actions">
        {btn}
        {at > 0 && (
          <button type="button" class="link" onClick={prev}>
            {S.common.back}
          </button>
        )}
      </div>
    ) : (
      <Footer>{btn}</Footer>
    );
  };
  const isLast = at === phases.length - 1;
  const irregular = freq === 'irregular';

  return (
    <div class="onb-phase" key={phase}>
      {phase === 'how' && (
        <Talk say={props.first ? O.talk.payHow(props.first) : [O.addAnother]} reply={props.reply}>
          <div class="onb-options">
            {FREQS.map((f) => (
              <OptionCard
                key={f}
                title={O.freqOption[f]!}
                sub={O.freqSub[f]}
                on={freq === f}
                onClick={() => {
                  haptic(5);
                  setFreq(f);
                  setNextDate(defaultNextPayday(f, props.today));
                  setPhase('amount');
                }}
              />
            ))}
          </div>
        </Talk>
      )}
      {phase === 'amount' && (
        <>
          <Talk say={irregular ? O.talk.payAmountIrregular : O.talk.payAmount(O.freqOption[freq]!)} reply={props.inSheet ? undefined : O.freqOption[freq]}>
            <AmountDial value={amount} onChange={setAmount} step={irregular ? 5000 : 2500} perTurn={40} label={irregular ? O.perMonth : O.eachTime} hint={O.dialHint} />
            <div class="onb-fields">
              <label class="field field--inline">
                <span>{O.calledQ}</span>
                <input value={name} placeholder={O.incomeNamePlaceholder} autoCapitalize="words" onInput={(e) => setName((e.target as HTMLInputElement).value)} />
              </label>
              <label class="field field--inline">
                <span>{O.upTo}</span>
                <span class="field__box">
                  <span class="field__cur">$</span>
                  <MoneyInput value={max} onChange={setMax} />
                </span>
              </label>
            </div>
          </Talk>
          {action(isLast ? props.submitLabel : O.continue, !amount)}
        </>
      )}
      {phase === 'when' && (
        <>
          <Talk say={O.talk.payWhen} reply={amount ? `${money(amount)} ${O.eachTime}` : undefined}>
            <CalendarPicker value={nextDate} onChange={setNextDate} today={props.today} min={props.today} label={O.nextPayday} />
          </Talk>
          {action(props.submitLabel)}
        </>
      )}
    </div>
  );
}

function MoreIncome(props: { reply?: string; incomes: IncomeAnswer[]; today: string; onAdd: (i: IncomeAnswer) => void; onDone: () => void }) {
  const [adding, setAdding] = useState(false);
  return (
    <>
      <Talk say={O.talk.moreIncome} reply={props.reply}>
        <ul class="picks">
          {props.incomes.map((i, k) => (
            <li key={k} class="pick is-on">
              <span class="pick__toggle">
                <span class="pick__circle">
                  <CheckIcon />
                </span>
              </span>
              <span class="pick__main pick__main--static">
                <span class="pick__text">
                  <strong>{i.name}</strong>
                  <small>{incomeMeta(i)}</small>
                </span>
              </span>
            </li>
          ))}
          <AddRow label={O.addAnother} onClick={() => setAdding(true)} />
        </ul>
      </Talk>
      <Footer>
        <button type="button" class="primary block" onClick={props.onDone}>
          {O.noMore}
        </button>
      </Footer>
      {adding && (
        <Sheet label={O.addAnother} onClose={() => setAdding(false)}>
          <div class="onb-sheet">
            <IncomeFlow
              today={props.today}
              inSheet
              initial={{ name: '', freq: 'monthly', nextDate: defaultNextPayday('monthly', props.today) }}
              submitLabel={O.add}
              onSubmit={(i) => {
                setAdding(false);
                props.onAdd(i);
              }}
            />
          </div>
        </Sheet>
      )}
    </>
  );
}

function AccountTypes(props: { reply?: string; initial: AccountChoice[]; onSubmit: (t: AccountChoice[]) => void }) {
  const [types, setTypes] = useState<AccountChoice[]>(props.initial.length ? props.initial : ['chequing']);
  const toggle = (t: AccountChoice) => {
    haptic(5);
    setTypes(types.includes(t) ? types.filter((x) => x !== t) : [...types, t]);
  };
  return (
    <>
      <Talk say={O.talk.accounts} reply={props.reply}>
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
                <small>{O.accountHint[t]}</small>
                <span class="onb-tile__check" aria-hidden="true">
                  <CheckIcon />
                </span>
              </button>
            );
          })}
        </div>
      </Talk>
      <Footer>
        <button type="button" class="primary block" disabled={types.length === 0} onClick={() => props.onSubmit(types)}>
          {O.continue}
        </button>
      </Footer>
    </>
  );
}

/** Two choices side by side, not pills: e.g. APY or APR. */
function Segmented<T extends string>(props: { label: string; options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div class="segmented" role="radiogroup" aria-label={props.label}>
      {props.options.map((o) => (
        <button type="button" key={o.value} role="radio" aria-checked={props.value === o.value} class={props.value === o.value ? 'is-on' : ''} onClick={() => props.onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function AccountDetail(props: { reply?: string; initial: AccountAnswer; today: string; onSubmit: (a: AccountAnswer) => void }) {
  const [a, setA] = useState(props.initial);
  const [rate, setRate] = useState(a.rateBps ? String(a.rateBps / 100) : '');
  const isCard = a.type === 'credit_card';
  const isOther = a.type === 'other';
  const due = nextMonthlyDate(a.dueDay ?? 22, props.today);
  const say = isOther ? O.talk.other : isCard ? O.talk.card(S.accountType[a.type]) : O.talk.account(S.accountType[a.type]);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        props.onSubmit({ ...a, name: a.name.trim() || ACCOUNT_LABEL_DEFAULTS[a.type], ...(a.type === 'savings' ? { rateBps: Math.round(Number(rate) * 100) || 0 } : {}) });
      }}
    >
      <Talk say={say} reply={props.reply}>
        {(isCard || a.type === 'chequing') && (
          <div class="onb-card-picker">
            <CardPicker value={a.face} onChange={(face) => setA({ ...a, face })} kind={isCard ? 'credit' : 'debit'} fallbackName={a.name || ACCOUNT_LABEL_DEFAULTS[a.type]} />
          </div>
        )}
        <label class="field field--inline">
          <span>{S.common.name}</span>
          <input
            value={a.name === ACCOUNT_LABEL_DEFAULTS.other && isOther ? '' : a.name}
            placeholder={isOther ? O.otherName : ACCOUNT_LABEL_DEFAULTS[a.type]}
            onInput={(e) => setA({ ...a, name: (e.target as HTMLInputElement).value })}
          />
        </label>
        <AmountDial
          value={a.balanceCents || undefined}
          onChange={(c) => setA({ ...a, balanceCents: c ?? 0 })}
          step={1000}
          perTurn={50}
          label={isCard ? O.owing : O.inAccount}
          hint={O.dialHint}
        />
        {a.type === 'savings' && (
          <div class="onb-fields">
            <label class="field field--inline">
              <span>{O.rateQ}</span>
              <input inputMode="decimal" placeholder="0.00" value={rate} onInput={(e) => setRate((e.target as HTMLInputElement).value)} />
            </label>
            <Segmented
              label={O.rateKindQ}
              options={[
                { value: 'apy', label: S.accounts.apy },
                { value: 'apr', label: S.accounts.apr },
              ]}
              value={a.rateKind === 'apr' ? 'apr' : 'apy'}
              onChange={(rateKind) => setA({ ...a, rateKind })}
            />
          </div>
        )}
        {isCard && (
          <>
            <p class="onb-label">{O.dueDate}</p>
            <CalendarPicker value={due} onChange={(d) => setA({ ...a, dueDay: parts(d).day })} today={props.today} label={O.dueDate} note={O.monthlyOn(a.dueDay ?? 22)} />
            <div class="onb-fields">
              <label class="field field--inline">
                <span>{O.feeQ}</span>
                <span class="field__box">
                  <span class="field__cur">$</span>
                  <MoneyInput value={a.monthlyFeeCents || undefined} onChange={(c) => setA({ ...a, monthlyFeeCents: c ?? 0 })} />
                </span>
              </label>
            </div>
          </>
        )}
      </Talk>
      <Footer>
        <button type="submit" class="primary block">
          {O.continue}
        </button>
      </Footer>
    </form>
  );
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Defaults first (in order), then anything the user added under another name. */
function withDefaults<T extends { name: string }>(defaults: readonly string[], items: T[]): { name: string; item?: T; index: number }[] {
  const rows: { name: string; item?: T; index: number }[] = defaults.map((name) => {
    const index = items.findIndex((x) => sameName(x.name, name));
    return { name, item: items[index], index };
  });
  items.forEach((item, index) => !defaults.some((d) => sameName(d, item.name)) && rows.push({ name: item.name, item, index }));
  return rows;
}

function Bills(props: { reply?: string; today: string; initial: BillAnswer[]; accountTypes: AccountChoice[]; onSubmit: (b: BillAnswer[]) => void }) {
  const [bills, setBills] = useState<BillAnswer[]>(props.initial);
  const [editing, setEditing] = useState<{ index: number; draft: BillAnswer } | null>(null);
  const payOptions = props.accountTypes.filter((t) => t !== 'investing' && t !== 'savings');
  const fresh = (name: string): BillAnswer => ({ name, amountCents: 0, day: 1, kind: O.subscriptionNames.some((n) => sameName(n, name)) ? 'subscription' : 'bill' });
  const rows = withDefaults(O.defaultBills, bills);
  const open = (name: string, index: number) => setEditing({ index, draft: index >= 0 ? bills[index]! : fresh(name) });
  return (
    <>
      <Talk say={O.talk.bills} reply={props.reply}>
        <ul class="picks">
          {rows.map((r) => (
            <PickRow
              key={r.name}
              name={r.name}
              on={!!r.item}
              meta={r.item ? O.billMeta(r.item.amountCents, r.item.day) : undefined}
              onToggle={() => (r.item ? setBills((bs) => bs.filter((x) => !sameName(x.name, r.name))) : open(r.name, -1))}
              onOpen={() => open(r.name, r.index)}
            />
          ))}
          <AddRow label={O.addOwnBill} onClick={() => setEditing({ index: -1, draft: fresh('') })} />
        </ul>
      </Talk>
      <Footer>
        <button type="button" class="primary block" onClick={() => props.onSubmit(bills)}>
          {O.continue}
        </button>
      </Footer>
      {editing && (
        <BillSheet
          initial={editing.draft}
          today={props.today}
          payOptions={payOptions}
          onClose={() => setEditing(null)}
          onSave={(b) => {
            setBills(editing.index >= 0 ? bills.map((x, j) => (j === editing.index ? b : x)) : [...bills, b]);
            setEditing(null);
          }}
          onRemove={editing.index >= 0 ? () => (setBills(bills.filter((_, j) => j !== editing.index)), setEditing(null)) : undefined}
        />
      )}
    </>
  );
}

function BillSheet(props: { initial: BillAnswer; today: string; payOptions: AccountChoice[]; onClose: () => void; onSave: (b: BillAnswer) => void; onRemove?: () => void }) {
  const [b, setB] = useState(props.initial);
  const set = (p: Partial<BillAnswer>) => setB({ ...b, ...p });
  const due = nextMonthlyDate(b.day, props.today);
  return (
    <ItemSheet
      title={b.name || O.addBill}
      onClose={props.onClose}
      canSave={b.amountCents > 0 && !!b.name.trim()}
      onSave={() => props.onSave({ ...b, name: b.name.trim() })}
      onRemove={props.onRemove}
    >
      <TitleField value={b.name} placeholder={O.addBill} onChange={(name) => set({ name })} />
      <AmountDial value={b.amountCents || undefined} onChange={(c) => set({ amountCents: c ?? 0 })} step={500} perTurn={40} label={O.perMonth} hint={O.dialHint} />
      <p class="onb-label">{O.billDue}</p>
      <CalendarPicker value={due} onChange={(d) => set({ day: parts(d).day })} today={props.today} label={O.billDue} note={O.monthlyOn(b.day)} />
      <div class="onb-fields">
        <Switch label={S.recurring.kind.subscription} checked={b.kind === 'subscription'} onChange={(v) => set({ kind: v ? 'subscription' : 'bill' })} />
      </div>
      {props.payOptions.length > 1 && (
        <>
          <p class="onb-label">{S.recurring.payFrom}</p>
          <Segmented
            label={S.recurring.payFrom}
            options={props.payOptions.map((t) => ({ value: t, label: S.accountType[t] }))}
            value={b.payFrom?.[0] ?? props.payOptions[0]!}
            onChange={(t) => set({ payFrom: [t] })}
          />
        </>
      )}
    </ItemSheet>
  );
}

const SPEND_DEFAULTS = SUGGESTED_CATEGORIES.slice(0, 6);

function Categories(props: { reply?: string; initial: CategoryAnswer[]; onSubmit: (c: CategoryAnswer[]) => void }) {
  const [cats, setCats] = useState<CategoryAnswer[]>(props.initial);
  const [editing, setEditing] = useState<{ index: number; draft: CategoryAnswer } | null>(null);
  const draft = (name: string): CategoryAnswer => ({ name, color: nextCategoryColor(cats.map((c) => c.color)) });
  const rows = withDefaults(
    SPEND_DEFAULTS.map((s) => s.name),
    cats,
  );
  const typical = (name: string) => SPEND_DEFAULTS.find((s) => sameName(s.name, name))?.weeklyCents;
  const meta = (c: CategoryAnswer) => O.categoryMeta(c.weeklyCents ?? typical(c.name));
  return (
    <>
      <Talk say={O.talk.spend} reply={props.reply}>
        <ul class="picks">
          {rows.map((r) => (
            <PickRow
              key={r.name}
              name={r.name}
              on={!!r.item}
              dot={r.item?.color}
              meta={r.item ? meta(r.item) : undefined}
              // Ticking adds it at a typical amount; the row opens it to change that.
              onToggle={() => setCats((cs) => (cs.some((x) => sameName(x.name, r.name)) ? cs.filter((x) => !sameName(x.name, r.name)) : [...cs, { name: r.name, color: nextCategoryColor(cs.map((x) => x.color)) }]))}
              onOpen={() => setEditing({ index: r.index, draft: r.item ?? draft(r.name) })}
            />
          ))}
          <AddRow label={O.addOwnCategory} onClick={() => setEditing({ index: -1, draft: draft('') })} />
        </ul>
      </Talk>
      <Footer>
        <button type="button" class="primary block" onClick={() => props.onSubmit(cats)}>
          {O.continue}
        </button>
      </Footer>
      {editing && (
        <CategorySheet
          initial={editing.draft}
          typical={typical(editing.draft.name)}
          onClose={() => setEditing(null)}
          onSave={(c) => {
            setCats(editing.index >= 0 ? cats.map((x, j) => (j === editing.index ? c : x)) : [...cats, c]);
            setEditing(null);
          }}
          onRemove={editing.index >= 0 ? () => (setCats(cats.filter((_, j) => j !== editing.index)), setEditing(null)) : undefined}
        />
      )}
    </>
  );
}

function CategorySheet(props: { initial: CategoryAnswer; typical?: Cents; onClose: () => void; onSave: (c: CategoryAnswer) => void; onRemove?: () => void }) {
  const [c, setC] = useState(props.initial);
  return (
    <ItemSheet title={c.name || O.addCategory} onClose={props.onClose} canSave={!!c.name.trim()} onSave={() => props.onSave({ ...c, name: c.name.trim() })} onRemove={props.onRemove}>
      <TitleField value={c.name} placeholder={O.categoryNamePlaceholder} onChange={(name) => setC({ ...c, name })} />
      <AmountDial
        value={c.weeklyCents ?? props.typical}
        onChange={(v) => setC({ ...c, weeklyCents: v })}
        step={500}
        perTurn={20}
        label={O.perWeek}
        hint={O.dialHint}
      />
      <ColorPicker colors={CATEGORY_COLORS} value={c.color} onChange={(color) => setC({ ...c, color })} />
    </ItemSheet>
  );
}

function Goals(props: { reply?: string; today: string; initial: GoalAnswer[]; onSubmit: (g: GoalAnswer[]) => void }) {
  const [goals, setGoals] = useState<GoalAnswer[]>(props.initial);
  const [editing, setEditing] = useState<{ index: number; draft: GoalAnswer } | null>(null);
  const full = goals.length >= 3;
  const rows = withDefaults(O.defaultGoals, goals);
  return (
    <>
      <Talk say={O.talk.goals} reply={props.reply}>
        <ul class="picks">
          {rows.map((r) => (
            <PickRow
              key={r.name}
              name={r.name}
              on={!!r.item}
              disabled={!r.item && full}
              meta={r.item ? O.goalMeta(r.item.targetCents, r.item.targetDate) : undefined}
              onToggle={() => setGoals((gs) => (gs.some((x) => sameName(x.name, r.name)) ? gs.filter((x) => !sameName(x.name, r.name)) : [...gs, { name: r.name }].slice(0, 3)))}
              onOpen={() => setEditing({ index: r.index, draft: r.item ?? { name: r.name } })}
            />
          ))}
          <AddRow label={O.addOwnGoal} disabled={full} onClick={() => setEditing({ index: -1, draft: { name: '' } })} />
        </ul>
        {full && <p class="onb-note">{O.goalsFull}</p>}
      </Talk>
      <Footer>
        <button type="button" class="primary block" onClick={() => props.onSubmit(goals)}>
          {O.continue}
        </button>
      </Footer>
      {editing && (
        <GoalSheet
          initial={editing.draft}
          today={props.today}
          onClose={() => setEditing(null)}
          onSave={(g) => {
            setGoals(editing.index >= 0 ? goals.map((x, j) => (j === editing.index ? g : x)) : [...goals, g].slice(0, 3));
            setEditing(null);
          }}
          onRemove={editing.index >= 0 ? () => (setGoals(goals.filter((_, j) => j !== editing.index)), setEditing(null)) : undefined}
        />
      )}
    </>
  );
}

function GoalSheet(props: { initial: GoalAnswer; today: string; onClose: () => void; onSave: (g: GoalAnswer) => void; onRemove?: () => void }) {
  const [g, setG] = useState(props.initial);
  const [dated, setDated] = useState(!!g.targetDate);
  // A year out is a fair first guess for a date.
  const year = clampedDay(parts(props.today).y + 1, parts(props.today).m, parts(props.today).day);
  return (
    <ItemSheet
      title={g.name || O.addGoal}
      onClose={props.onClose}
      canSave={!!g.name.trim()}
      onSave={() => props.onSave({ name: g.name.trim(), ...(g.targetCents ? { targetCents: g.targetCents } : {}), ...(dated && g.targetDate ? { targetDate: g.targetDate } : {}) })}
      onRemove={props.onRemove}
    >
      <TitleField value={g.name} placeholder={O.goalNamePlaceholder} onChange={(name) => setG({ ...g, name })} />
      <AmountDial value={g.targetCents} onChange={(c) => setG({ ...g, targetCents: c })} step={5000} perTurn={40} label={O.target} hint={O.dialHint} />
      <div class="onb-fields">
        <Switch label={O.targetDate} checked={dated} onChange={(v) => (setDated(v), v && !g.targetDate && setG({ ...g, targetDate: year }))} />
      </div>
      {dated && <CalendarPicker value={g.targetDate} onChange={(d) => setG({ ...g, targetDate: d })} today={props.today} min={addDays(props.today, 1)} label={O.targetDate} />}
    </ItemSheet>
  );
}

function Review(props: { first: string; reply?: string; state: OnboardingState; today: string; onAccept: (p: GeneratedPlan) => Promise<void> }) {
  const generate = () => previewPlan(props.state.answers, props.today);
  const [plan, setPlan] = useState<GeneratedPlan>(generate);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<AmountMode>('dollars');
  const categories = useLoad((a) => a.repos.categories.all()) ?? [];
  const label = (id: string) => {
    const g = props.state.answers.goals.findIndex((_, k) => goalTempId(k) === id);
    if (g >= 0) return props.state.answers.goals[g]!.name;
    const c = props.state.answers.categories.findIndex((_, k) => categoryTempId(k) === id);
    if (c >= 0) return props.state.answers.categories[c]!.name;
    return categories.find((c) => c.id === id)?.name ?? '';
  };
  const s = plan.summary;
  // Recomputed from the amounts as they're edited, so the card always adds up.
  const sum = (r: Record<string, Cents>) => Object.values(r).reduce((t, c) => t + c, 0);
  const bills = plan.allocations[categoryId('bills')] ?? 0;
  const fund = plan.allocations[categoryId('irregular')] ?? 0;
  const goals = sum(plan.goalContributions);
  const flex = sum(plan.allocations) - bills - fund;
  const parts = [
    { key: 'fixed', cents: bills },
    { key: 'flex', cents: flex },
    { key: 'fund', cents: fund },
    { key: 'goals', cents: goals },
    { key: 'free', cents: Math.max(0, s.incomeCents - bills - flex - fund - goals) },
  ] as const;
  const whole = Math.max(1, parts.reduce((t, p) => t + Math.max(0, p.cents), 0));
  const row = (id: string, c: Cents, onChange: (v: Cents) => void) => (
    <li key={id} class="onb-alloc">
      <span class="onb-alloc__text">
        <strong>{label(id)}</strong>
        {plan.reasons[id]?.[0] && <small>{reasonText(plan.reasons[id]![0]!)}</small>}
      </span>
      <span class="onb-alloc__amt">
        <AllocationInput compact value={c} base={s.incomeCents} mode={mode} onChange={(v) => v !== undefined && onChange(v)} />
      </span>
    </li>
  );
  return (
    <>
      <Talk say={O.talk.review(props.first)} reply={props.reply}>
        <div class="onb-review">
          <p class="onb-review__label">{O.reviewIncome}</p>
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
                <span>{O.reviewParts[p.key]}</span>
                <Amount c={p.cents} />
              </li>
            ))}
          </ul>
        </div>
        {s.incomeCents > 0 && <AmountModeToggle value={mode} onChange={setMode} />}
        <ul class="onb-allocs">
          {Object.entries(plan.allocations).map(([id, c]) => row(id, c, (v) => setPlan({ ...plan, allocations: { ...plan.allocations, [id]: v } })))}
          {Object.entries(plan.goalContributions).map(([id, c]) => row(id, c, (v) => setPlan({ ...plan, goalContributions: { ...plan.goalContributions, [id]: v } })))}
        </ul>
        {plan.flags.map((f) => (
          <p class="note" key={f.goalId}>
            {f.code === 'date_unrealistic' ? S.goalFlag.date_unrealistic(label(f.goalId), f.realisticDate!, f.reachableByDateCents) : S.goalFlag.no_room_now(label(f.goalId))}
          </p>
        ))}
      </Talk>
      <Footer>
        <button
          type="button"
          class="primary block"
          disabled={saving}
          onClick={() => {
            setSaving(true);
            haptic(12);
            props.onAccept(plan).catch((e) => (setSaving(false), toast(O.finishFailed(String(e)))));
          }}
        >
          {O.accept}
        </button>
        <button type="button" class="link onb__secondary" onClick={() => setPlan(generate())}>
          {O.regenerate}
        </button>
      </Footer>
    </>
  );
}
