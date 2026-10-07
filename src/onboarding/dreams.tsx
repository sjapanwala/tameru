// Screens for the optional second stage: goals, the plan they add up to, and
// category budgets.

import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { listBudgets, saveGoal, setBudget } from '../db/repo';
import { todayISO } from '../domain/dates';
import { centsToInput, parseMoneyInput } from '../domain/money';
import { buildPlan, debtPayoffOrder, PLAN_DISCLAIMER, suggestBudgets } from '../domain/plan';
import type { GoalKind } from '../domain/types';
import { useApp } from '../ui/context';
import { Option, Options, Screen, useFlow } from './kit';

const GOAL_KINDS: { kind: GoalKind; label: string; name: string }[] = [
  { kind: 'emergency', label: 'Emergency fund', name: 'Emergency fund' },
  { kind: 'debt', label: 'Pay off a card', name: 'Pay off cards' },
  { kind: 'trip', label: 'A trip', name: 'Trip' },
  { kind: 'purchase', label: 'A big purchase', name: 'Big purchase' },
  { kind: 'invest', label: 'Investing', name: 'Investing' },
  { kind: 'custom', label: 'Something else', name: '' },
];

function usePlan() {
  const flow = useFlow();
  const { settings } = useApp();
  return useMemo(
    () =>
      buildPlan({
        today: todayISO(),
        recurring: flow.recurring,
        goals: flow.goals,
        accounts: flow.accounts,
        strategy: settings.debtStrategy,
        money: flow.money,
      }),
    [flow.recurring, flow.goals, flow.accounts, flow.money, settings.debtStrategy],
  );
}

export function DreamsPick() {
  const flow = useFlow();
  const [picked, setPicked] = useState<GoalKind[]>(flow.state.goalKinds);

  const toggle = (kind: GoalKind) =>
    setPicked((current) =>
      current.includes(kind) ? current.filter((k) => k !== kind) : [...current, kind],
    );

  return (
    <Screen
      title="What are you saving for?"
      lede="Pick as many as you like. Each gets its own monthly amount."
      primary={{
        label: 'Continue',
        disabled: picked.length === 0,
        onClick: () =>
          flow.next({
            goalKinds: GOAL_KINDS.map((g) => g.kind).filter((kind) => picked.includes(kind)),
            goalIndex: 0,
          }),
      }}
      onSkip={() => flow.next({ goalKinds: [] })}
    >
      <Options label="Goals">
        {GOAL_KINDS.map(({ kind, label }) => (
          <Option
            key={kind}
            label={label}
            selected={picked.includes(kind)}
            onClick={() => toggle(kind)}
          />
        ))}
      </Options>
    </Screen>
  );
}

export function DreamsGoal() {
  const flow = useFlow();
  const plan = usePlan();
  const kind = flow.state.goalKinds[flow.state.goalIndex] ?? 'custom';
  const preset = GOAL_KINDS.find((g) => g.kind === kind)!;
  const goal = flow.goals.find((g) => g.kind === kind);

  // A starting point where the numbers already on file suggest one.
  const suggested =
    kind === 'emergency'
      ? plan.emergencyFund.targetCents
      : kind === 'debt'
        ? debtPayoffOrder(flow.accounts, 'avalanche').reduce((sum, d) => sum + d.owedCents, 0)
        : 0;
  const input = (cents: number) => (cents > 0 ? centsToInput(cents, flow.currency) : '');

  const [name, setName] = useState(goal?.name ?? preset.name);
  const [target, setTarget] = useState(input(goal?.targetCents ?? suggested));
  const [monthly, setMonthly] = useState(input(goal?.monthlyContributionCents ?? 0));
  const [date, setDate] = useState(goal?.targetDate ?? '');

  const targetCents = parseMoneyInput(target, flow.currency);
  const monthlyCents = monthly.trim() === '' ? 0 : parseMoneyInput(monthly, flow.currency);
  const valid =
    name.trim() !== '' && targetCents !== null && targetCents > 0 && monthlyCents !== null;

  async function save() {
    if (!valid) return;
    await saveGoal(goal?.id ?? null, {
      name: name.trim(),
      kind,
      targetCents,
      savedCents: goal?.savedCents ?? 0,
      monthlyContributionCents: Math.max(0, monthlyCents),
      targetDate: date || null,
    });
    flow.next();
  }

  return (
    <Screen
      title={preset.label}
      lede={
        kind === 'emergency' && suggested > 0
          ? `${plan.emergencyFund.months} months of your bills comes to ${flow.money(suggested)}.`
          : 'How much, and how much a month you can put toward it.'
      }
      primary={{ label: 'Continue', onClick: save, disabled: !valid }}
      onSkip={() => flow.next()}
    >
      <label className="field">
        <span className="field__label">Name</span>
        <input
          className="input"
          type="text"
          maxLength={40}
          autoComplete="off"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label className="field">
        <span className="field__label">Target amount</span>
        <input
          className="input num"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={target}
          onChange={(event) => setTarget(event.target.value)}
        />
      </label>
      <label className="field">
        <span className="field__label">Set aside each month</span>
        <input
          className="input num"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={monthly}
          onChange={(event) => setMonthly(event.target.value)}
        />
      </label>
      <label className="field">
        <span className="field__label">Target date (optional)</span>
        <input
          className="input"
          type="date"
          min={todayISO()}
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
      </label>
    </Screen>
  );
}

export function DreamsPlan() {
  const flow = useFlow();
  const plan = usePlan();
  const { incomeCents, billsCents, goalsCents, flexibleCents } = plan.monthly;

  return (
    <Screen
      title="Your month, planned"
      lede={
        plan.feasible
          ? 'Here is where each month’s money goes.'
          : `Goals overshoot by ${flow.money(plan.shortfallCents)} a month. You can adjust them in Plan.`
      }
      primary={{ label: 'Continue', onClick: () => flow.next() }}
    >
      <dl className="ob-facts">
        <div>
          <dt>Income</dt>
          <dd className="mono ob-pos">+{flow.money(incomeCents)}</dd>
        </div>
        <div>
          <dt>Bills</dt>
          <dd className="mono">{flow.money(billsCents)}</dd>
        </div>
        <div>
          <dt>Goals</dt>
          <dd className="mono">{flow.money(goalsCents)}</dd>
        </div>
        <div className="ob-facts__total">
          <dt>Left for everyday spending</dt>
          <dd className="mono">{flow.money(flexibleCents)}</dd>
        </div>
      </dl>
      {plan.recommendations.length > 0 && (
        <ul className="ob-notes">
          {plan.recommendations.map((item) => (
            <li key={item.id}>
              <strong>{item.title}</strong>
              <span>{item.body}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="ob__small">{PLAN_DISCLAIMER}</p>
    </Screen>
  );
}

export function DreamsBudgets() {
  const flow = useFlow();
  const plan = usePlan();
  const { categories } = useApp();
  const budgets = useLiveQuery(listBudgets, []);
  const suggestions = useMemo(
    () =>
      suggestBudgets({
        today: todayISO(),
        flexibleCents: plan.monthly.flexibleCents,
        transactions: flow.transactions,
        categories,
      }),
    [plan.monthly.flexibleCents, flow.transactions, categories],
  );
  // Typed values only; anything untouched shows the saved or suggested amount.
  const [typed, setTyped] = useState<Record<string, string>>({});

  const starting = (categoryId: string) => {
    const cents =
      budgets?.find((b) => b.categoryId === categoryId)?.monthlyCents ??
      suggestions.find((s) => s.categoryId === categoryId)?.monthlyCents ??
      0;
    return cents > 0 ? centsToInput(cents, flow.currency) : '';
  };
  const value = (categoryId: string) => typed[categoryId] ?? starting(categoryId);

  async function save() {
    for (const category of categories) {
      const text = value(category.id);
      const cents = text.trim() === '' ? 0 : parseMoneyInput(text, flow.currency);
      if (cents !== null) await setBudget(category.id, Math.max(0, cents));
    }
    flow.next();
  }

  return (
    <Screen
      title="Give each category a budget"
      lede={`You have about ${flow.money(Math.max(0, plan.monthly.flexibleCents))} a month for everyday spending. Leave any blank.`}
      primary={{ label: 'Finish', onClick: save, disabled: budgets === undefined }}
      onSkip={() => flow.next()}
    >
      <div className="ob-budgets">
        {categories.map((category) => (
          <label key={category.id} className="ob-budget">
            <span>{category.name}</span>
            <input
              className="input num"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0"
              value={value(category.id)}
              onChange={(event) =>
                setTyped((current) => ({ ...current, [category.id]: event.target.value }))
              }
            />
          </label>
        ))}
      </div>
    </Screen>
  );
}
