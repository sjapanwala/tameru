// Onboarding conversation: renders one question at a time from the pure state machine.
// Progress is saved after every step so quitting resumes on the same question.

import { useEffect, useState } from 'preact/hooks';
import { reasonText, S } from '../../copy/strings';
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
} from '../../domain/onboarding';
import type { GeneratedPlan } from '../../domain/planGenerator';
import type { Cents, Frequency } from '../../domain/types';
import { finishOnboarding, loadProgress, previewPlan, saveProgress } from '../../services/onboarding';
import { CardPicker } from '../cards';
import { MoneyInput, Ticks } from '../components';
import { useApp, useLoad } from '../hooks';

const ACCOUNT_CHOICES: AccountChoice[] = ['chequing', 'savings', 'credit_card', 'investing', 'cash'];

export function Onboarding({ onDone }: { onDone: () => void }) {
  const { app } = useApp();
  const [state, setState] = useState<OnboardingState>();
  useEffect(() => {
    loadProgress(app).then(setState);
  }, []);
  if (!state) return <div class="placeholder" />;

  const move = (next: OnboardingState) => {
    setState(next);
    saveProgress(app, next);
  };
  const go = (a: Answer) => move(answer(state, a));
  const step = currentStep(state);
  const today = app.clock.today();
  const nav = (
    <p>
      {state.index > 0 && <button type="button" class="link" onClick={() => move(back(state))}>{S.common.back}</button>}
      {'  ·  '}
      {step.id !== 'welcome' && step.id !== 'review' && <button type="button" class="link" onClick={() => move(skip(state))}>{S.common.skip}</button>}
    </p>
  );
  if (isComplete(state)) return null;
  const total = steps(state.answers).length;

  const body = (() => {
    switch (step.id) {
      case 'welcome':
        return (
          <Welcome initialName={state.answers.name} onStart={(name) => go({ step: 'welcome', name })} />
        );
      case 'income':
        return (
          <section>
            <IncomeForm today={today} initial={state.answers.incomes[0]} submitLabel={S.common.next} onSubmit={(income) => go({ step: 'income', income })} />
            {nav}
          </section>
        );
      case 'more_income':
        return (
          <section>
            <h1>{S.onboarding.moreIncomeQ}</h1>
            <ul>
              {state.answers.incomes.map((i, k) => (
                <li key={k}>{i.name} · {S.freq[i.freq]}</li>
              ))}
            </ul>
            <button type="button" onClick={() => go({ step: 'more_income' })}>{S.onboarding.noMore}</button>
            <IncomeForm today={today} submitLabel={S.onboarding.addAnother} onSubmit={(income) => go({ step: 'more_income', income })} />
            {nav}
          </section>
        );
      case 'account_types':
        return <AccountTypes initial={state.answers.accountTypes} onSubmit={(types) => go({ step: 'account_types', types })} nav={nav} />;
      case 'account_detail':
        return (
          <AccountDetail
            key={step.type}
            initial={state.answers.accounts.find((a) => a.type === step.type) ?? defaultAccount(step.type)}
            onSubmit={(account) => go({ step: 'account_detail', account })}
            nav={nav}
          />
        );
      case 'bills':
        return <Bills initial={state.answers.bills} accountTypes={state.answers.accountTypes} onSubmit={(bills) => go({ step: 'bills', bills })} nav={nav} />;
      case 'habit':
        return <Habit key={step.key} habit={step.key} onSubmit={(weeklyCents) => go({ step: 'habit', key: step.key, weeklyCents })} nav={nav} />;
      case 'goals':
        return <Goals initial={state.answers.goals} onSubmit={(goals) => go({ step: 'goals', goals })} nav={nav} />;
      case 'period':
        return (
          <section>
            <h1>{S.onboarding.periodQ}</h1>
            <button type="button" onClick={() => go({ step: 'period', alignment: 'month' })}>{S.onboarding.periodMonth}</button>{' '}
            {state.answers.incomes.some((i) => i.freq !== 'irregular') && (
              <button type="button" onClick={() => go({ step: 'period', alignment: 'payday' })}>{S.onboarding.periodPayday}</button>
            )}
            {nav}
          </section>
        );
      case 'review':
        return (
          <Review
            state={state}
            today={today}
            onBack={() => move(back(state))}
            onAccept={async (plan) => {
              await finishOnboarding(app, state.answers, plan);
              onDone();
            }}
          />
        );
    }
  })();

  return (
    <div class="onb">
      <Ticks total={total} done={state.index} label={`${state.index + 1} / ${total}`} />
      {body}
    </div>
  );
}

function Welcome(props: { initialName?: string; onStart: (name: string) => void }) {
  const [name, setName] = useState(props.initialName ?? '');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        props.onStart(name);
      }}
    >
      <h1>{S.onboarding.welcomeTitle}</h1>
      <p>{S.onboarding.welcomeBody}</p>
      <label>
        {S.onboarding.nameQ} {S.common.optional}
        <input value={name} autoComplete="given-name" onInput={(e) => setName((e.target as HTMLInputElement).value)} />
      </label>
      <button type="submit" class="block">{S.onboarding.start}</button>
    </form>
  );
}

function IncomeForm(props: { today: string; initial?: IncomeAnswer; submitLabel: string; onSubmit: (i: IncomeAnswer) => void }) {
  const [freq, setFreq] = useState<Frequency>(props.initial?.freq ?? 'biweekly');
  const [name, setName] = useState(props.initial?.name ?? '');
  const [varies, setVaries] = useState(!!props.initial?.range);
  const [amount, setAmount] = useState<Cents | undefined>(props.initial?.range?.minCents ?? props.initial?.amountCents);
  const [max, setMax] = useState<Cents | undefined>(props.initial?.range?.maxCents);
  const [nextDate, setNextDate] = useState(props.initial?.nextDate ?? defaultNextPayday('biweekly', props.today));
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const range = varies && amount !== undefined && max !== undefined ? { minCents: Math.min(amount, max), maxCents: Math.max(amount, max) } : undefined;
        props.onSubmit({ name: name || S.onboarding.defaultIncomeName, freq, nextDate, ...(range ? { range } : { amountCents: amount ?? 0 }) });
      }}
    >
      <h1>{S.onboarding.incomeQ}</h1>
      <p>
        {(['weekly', 'biweekly', 'semimonthly', 'monthly', 'irregular'] as const).map((f) => (
          <label key={f}>
            <input type="radio" checked={freq === f} onChange={() => (setFreq(f), setNextDate(defaultNextPayday(f, props.today)))} /> {S.freq[f]}
          </label>
        ))}
      </p>
      <label>{S.onboarding.incomeName} <input value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} /></label>
      <p>{S.onboarding.incomeAmountQ}</p>
      <MoneyInput value={amount} onChange={setAmount} /> {varies && <>– <MoneyInput value={max} onChange={setMax} /></>}
      <label>
        <input type="checkbox" checked={varies} onChange={(e) => setVaries((e.target as HTMLInputElement).checked)} /> {S.onboarding.incomeVaries}
      </label>
      {freq !== 'irregular' && (
        <label>{S.onboarding.nextPaydayQ} <input type="date" value={nextDate} onInput={(e) => setNextDate((e.target as HTMLInputElement).value)} /></label>
      )}
      <button type="submit">{props.submitLabel}</button>
    </form>
  );
}

function AccountTypes(props: { initial: AccountChoice[]; onSubmit: (t: AccountChoice[]) => void; nav: preact.ComponentChildren }) {
  const [types, setTypes] = useState<AccountChoice[]>(props.initial.length ? props.initial : ['chequing']);
  return (
    <section>
      <h1>{S.onboarding.accountsQ}</h1>
      {ACCOUNT_CHOICES.map((t) => (
        <label key={t}>
          <input type="checkbox" checked={types.includes(t)} onChange={(e) => setTypes((e.target as HTMLInputElement).checked ? [...types, t] : types.filter((x) => x !== t))} />{' '}
          {S.accountType[t]}
        </label>
      ))}
      <button type="button" onClick={() => props.onSubmit(types)}>{S.common.next}</button>
      {props.nav}
    </section>
  );
}

function AccountDetail(props: { initial: AccountAnswer; onSubmit: (a: AccountAnswer) => void; nav: preact.ComponentChildren }) {
  const [a, setA] = useState(props.initial);
  const [rate, setRate] = useState(a.rateBps ? String(a.rateBps / 100) : '');
  const isCard = a.type === 'credit_card';
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        props.onSubmit({ ...a, name: a.name || ACCOUNT_LABEL_DEFAULTS[a.type], ...(a.type === 'savings' ? { rateBps: Math.round(Number(rate) * 100) || 0 } : {}) });
      }}
    >
      <h1>{S.onboarding.accountQ(S.accountType[a.type])}</h1>
      <label>{S.common.name} <input value={a.name} onInput={(e) => setA({ ...a, name: (e.target as HTMLInputElement).value })} /></label>
      <MoneyInput label={isCard ? S.accounts.openingOwing : S.accounts.openingBalance} value={a.balanceCents} onChange={(c) => setA({ ...a, balanceCents: c ?? 0 })} />
      {a.type === 'savings' && (
        <>
          <label>{S.onboarding.rateQ} <input inputMode="decimal" value={rate} onInput={(e) => setRate((e.target as HTMLInputElement).value)} /> %</label>
          <label>
            <input type="radio" checked={a.rateKind !== 'apr'} onChange={() => setA({ ...a, rateKind: 'apy' })} /> {S.accounts.apy}
          </label>
          <label>
            <input type="radio" checked={a.rateKind === 'apr'} onChange={() => setA({ ...a, rateKind: 'apr' })} /> {S.accounts.apr}
          </label>
        </>
      )}
      {isCard && (
        <>
          <MoneyInput label={S.onboarding.feeQ} value={a.monthlyFeeCents} onChange={(c) => setA({ ...a, monthlyFeeCents: c ?? 0 })} />
          <label>
            {S.accounts.dueDay} <input type="number" min="1" max="31" value={a.dueDay ?? 22} onInput={(e) => setA({ ...a, dueDay: Number((e.target as HTMLInputElement).value) || 22 })} />
          </label>
        </>
      )}
      {(isCard || a.type === 'chequing') && (
        <CardPicker value={a.face} onChange={(face) => setA({ ...a, face })} kind={isCard ? 'credit' : 'debit'} fallbackName={a.name || ACCOUNT_LABEL_DEFAULTS[a.type]} />
      )}
      <button type="submit">{S.common.next}</button>
      {props.nav}
    </form>
  );
}

function Bills(props: { initial: BillAnswer[]; accountTypes: AccountChoice[]; onSubmit: (b: BillAnswer[]) => void; nav: preact.ComponentChildren }) {
  const [bills, setBills] = useState<BillAnswer[]>(props.initial.length ? props.initial : [{ name: '', amountCents: 0, day: 1, kind: 'bill' }]);
  const payOptions = props.accountTypes.filter((t) => t !== 'investing' && t !== 'savings');
  const set = (k: number, p: Partial<BillAnswer>) => setBills(bills.map((b, j) => (j === k ? { ...b, ...p } : b)));
  return (
    <section>
      <h1>{S.onboarding.billsQ}</h1>
      <p>{S.onboarding.billsHint}</p>
      {bills.map((b, k) => (
        <fieldset key={k}>
          <label>{S.common.name} <input value={b.name} onInput={(e) => set(k, { name: (e.target as HTMLInputElement).value })} /></label>
          <MoneyInput label={S.common.amount} value={b.amountCents || undefined} onChange={(c) => set(k, { amountCents: c ?? 0 })} />
          <label>
            {S.onboarding.billDay} <input type="number" min="1" max="31" value={b.day} onInput={(e) => set(k, { day: Number((e.target as HTMLInputElement).value) || 1 })} />
          </label>
          <label>
            <input type="checkbox" checked={b.kind === 'subscription'} onChange={(e) => set(k, { kind: (e.target as HTMLInputElement).checked ? 'subscription' : 'bill' })} />{' '}
            {S.recurring.kind.subscription}
          </label>
          {payOptions.length > 1 && (
            <label>
              {S.recurring.payFrom}{' '}
              <select value={b.payFrom?.[0] ?? payOptions[0]} onChange={(e) => set(k, { payFrom: [(e.target as HTMLSelectElement).value as AccountChoice] })}>
                {payOptions.map((t) => <option key={t} value={t}>{S.accountType[t]}</option>)}
              </select>
            </label>
          )}
          <button type="button" onClick={() => setBills(bills.filter((_, j) => j !== k))}>{S.common.remove}</button>
        </fieldset>
      ))}
      <button type="button" onClick={() => setBills([...bills, { name: '', amountCents: 0, day: 1, kind: 'bill' }])}>{S.onboarding.addBill}</button>{' '}
      <button type="button" onClick={() => props.onSubmit(bills)}>{S.common.next}</button>
      {props.nav}
    </section>
  );
}

function Habit(props: { habit: keyof typeof HABIT_PICKS; onSubmit: (c: Cents) => void; nav: preact.ComponentChildren }) {
  const [custom, setCustom] = useState<Cents>();
  return (
    <section>
      <h1>{S.onboarding.habitQ[props.habit]}</h1>
      <div class="options">
        {HABIT_PICKS[props.habit].map((p) => (
          <button type="button" key={p.hi} onClick={() => props.onSubmit(pickMidpoint(p))}>
            {S.onboarding.pickRange(p.lo, p.hi)}
          </button>
        ))}
      </div>
      <MoneyInput value={custom} onChange={setCustom} />{' '}
      <button type="button" disabled={custom === undefined} onClick={() => custom !== undefined && props.onSubmit(custom)}>{S.common.next}</button>
      {props.nav}
    </section>
  );
}

function Goals(props: { initial: GoalAnswer[]; onSubmit: (g: GoalAnswer[]) => void; nav: preact.ComponentChildren }) {
  const [goals, setGoals] = useState<GoalAnswer[]>(props.initial.length ? props.initial : [{ name: '' }]);
  const set = (k: number, p: Partial<GoalAnswer>) => setGoals(goals.map((g, j) => (j === k ? { ...g, ...p } : g)));
  return (
    <section>
      <h1>{S.onboarding.goalsQ}</h1>
      <p>{S.onboarding.goalsHint}</p>
      {goals.map((g, k) => (
        <fieldset key={k}>
          <label>{S.common.name} <input value={g.name} onInput={(e) => set(k, { name: (e.target as HTMLInputElement).value })} /></label>
          <MoneyInput label={`${S.plan.target} ${S.common.optional}`} value={g.targetCents} onChange={(c) => set(k, { targetCents: c })} />
          <label>
            {S.plan.targetDate} {S.common.optional} <input type="date" value={g.targetDate ?? ''} onInput={(e) => set(k, { targetDate: (e.target as HTMLInputElement).value || undefined })} />
          </label>
        </fieldset>
      ))}
      {goals.length < 3 && <button type="button" onClick={() => setGoals([...goals, { name: '' }])}>{S.onboarding.addGoal}</button>}{' '}
      <button type="button" onClick={() => props.onSubmit(goals)}>{S.common.next}</button>
      {props.nav}
    </section>
  );
}

function Review(props: { state: OnboardingState; today: string; onBack: () => void; onAccept: (p: GeneratedPlan) => Promise<void> }) {
  const generate = () => previewPlan(props.state.answers, props.today);
  const [plan, setPlan] = useState<GeneratedPlan>(generate);
  const categories = useLoad((a) => a.repos.categories.all()) ?? [];
  const label = (id: string) => {
    const g = props.state.answers.goals.findIndex((_, k) => goalTempId(k) === id);
    if (g >= 0) return props.state.answers.goals[g]!.name;
    return categories.find((c) => c.id === id)?.name ?? '';
  };
  const s = plan.summary;
  return (
    <section>
      <h1>{S.onboarding.reviewTitle}</h1>
      <p>{S.plan.summary(s.incomeCents, s.fixedCents, s.flexibleCents, s.goalsCents, s.unassignedCents)}</p>
      <p><small>{S.onboarding.adjustHint}</small></p>
      <table>
        <tbody>
          {Object.entries(plan.allocations).map(([id, c]) => (
            <tr key={id}>
              <td>
                {label(id)}
                {(plan.reasons[id] ?? []).map((r, k) => <div key={k}><small>{reasonText(r)}</small></div>)}
              </td>
              <td><MoneyInput value={c} onChange={(v) => v !== undefined && setPlan({ ...plan, allocations: { ...plan.allocations, [id]: v } })} /></td>
            </tr>
          ))}
          {Object.entries(plan.goalContributions).map(([id, c]) => (
            <tr key={id}>
              <td>
                {label(id)}
                {(plan.reasons[id] ?? []).map((r, k) => <div key={k}><small>{reasonText(r)}</small></div>)}
              </td>
              <td><MoneyInput value={c} onChange={(v) => v !== undefined && setPlan({ ...plan, goalContributions: { ...plan.goalContributions, [id]: v } })} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {plan.flags.map((f) => (
        <p key={f.goalId}>
          {f.code === 'date_unrealistic' ? S.goalFlag.date_unrealistic(label(f.goalId), f.realisticDate!, f.reachableByDateCents) : S.goalFlag.no_room_now(label(f.goalId))}
        </p>
      ))}
      <button type="button" onClick={() => props.onAccept(plan)}>{S.onboarding.accept}</button>{' '}
      <button type="button" onClick={() => setPlan(generate())}>{S.onboarding.regenerate}</button>{' '}
      <button type="button" onClick={props.onBack}>{S.common.back}</button>
    </section>
  );
}
