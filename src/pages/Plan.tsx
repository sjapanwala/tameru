import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { listBudgets, listGoals, listRecurring } from '../db/repo';
import { addDays, shortDate, todayISO } from '../domain/dates';
import { formatMoney } from '../domain/money';
import { FREQUENCY_LABELS, occurrencesBetween } from '../domain/recurring';
import type { Category, Goal, Recurring } from '../domain/types';
import { useApp } from '../ui/context';
import { PlusIcon } from '../ui/Icons';
import { PageHeader } from '../ui/PageHeader';
import { PlanTabs } from '../ui/TabBar';
import { BudgetSheet, GoalSheet, RecurringSheet } from '../ui/PlanSheets';

type Editing =
  | { type: 'recurring'; kind: Recurring['kind']; item?: Recurring }
  | { type: 'budget'; category: Category }
  | { type: 'goal'; goal?: Goal }
  | null;

export function Plan() {
  const { settings, categories } = useApp();
  const recurring = useLiveQuery(listRecurring, []) ?? [];
  const budgets = useLiveQuery(listBudgets, []) ?? [];
  const goals = useLiveQuery(listGoals, []) ?? [];
  const [editing, setEditing] = useState<Editing>(null);

  const today = todayISO();
  const money = (cents: number) => formatMoney(cents, settings.currency);
  const budgetTotal = budgets.reduce((sum, budget) => sum + budget.monthlyCents, 0);

  function recurringRows(kind: Recurring['kind']) {
    const items = recurring.filter((item) => item.kind === kind);
    return (
      <>
        {items.length > 0 && (
          <ul className="row-list">
            {items.map((item) => {
              const next = occurrencesBetween(item.schedule, today, addDays(today, 366))[0];
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className="row-btn"
                    onClick={() => setEditing({ type: 'recurring', kind, item })}
                  >
                    <span className="row-btn__main">
                      <span className="row-btn__title">{item.name}</span>
                      <span className="row-btn__detail">
                        {FREQUENCY_LABELS[item.schedule.freq]}
                        {next ? ` · next ${shortDate(next)}` : ''}
                      </span>
                    </span>
                    <span className="row-btn__value num">{money(item.amountCents)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => setEditing({ type: 'recurring', kind })}
        >
          <PlusIcon size={18} />
          {kind === 'income' ? 'Add income' : 'Add bill'}
        </button>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Plan" />
      <PlanTabs route="/plan" />

      <section className="card stack" aria-labelledby="plan-income">
        <h2 id="plan-income" className="card__title">
          Income
        </h2>
        {recurring.every((item) => item.kind !== 'income') && (
          <p className="field__hint">
            Add your payday so Tameru knows what's coming in each month.
          </p>
        )}
        {recurringRows('income')}
      </section>

      <section className="card stack" aria-labelledby="plan-bills">
        <h2 id="plan-bills" className="card__title">
          Bills
        </h2>
        {recurring.every((item) => item.kind !== 'bill') && (
          <p className="field__hint">
            Rent, subscriptions, insurance: money that's already spoken for.
          </p>
        )}
        {recurringRows('bill')}
      </section>

      <section className="card stack" aria-labelledby="plan-budgets">
        <h2 id="plan-budgets" className="card__title">
          Monthly budgets
        </h2>
        <ul className="row-list">
          {categories.map((category) => {
            const budget = budgets.find((b) => b.categoryId === category.id);
            return (
              <li key={category.id}>
                <button
                  type="button"
                  className="row-btn"
                  onClick={() => setEditing({ type: 'budget', category })}
                >
                  <span className="row-btn__main">
                    <span className="row-btn__title">{category.name}</span>
                  </span>
                  <span className={`row-btn__value num${budget ? '' : ' row-btn__value--unset'}`}>
                    {budget ? money(budget.monthlyCents) : 'Set budget'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {budgetTotal > 0 && (
          <p className="field__hint">
            Total budgeted: <span className="num">{money(budgetTotal)}</span> a month
          </p>
        )}
      </section>

      <section className="card stack" aria-labelledby="plan-goals">
        <h2 id="plan-goals" className="card__title">
          Goals
        </h2>
        {goals.length === 0 && (
          <p className="field__hint">
            Set money aside each month and it's kept out of your daily number.
          </p>
        )}
        {goals.length > 0 && (
          <ul className="row-list">
            {goals.map((goal) => {
              const fraction = Math.min(1, goal.savedCents / goal.targetCents);
              return (
                <li key={goal.id}>
                  <button
                    type="button"
                    className="row-btn row-btn--stacked"
                    onClick={() => setEditing({ type: 'goal', goal })}
                  >
                    <span className="row-btn__line">
                      <span className="row-btn__title">{goal.name}</span>
                      <span className="row-btn__value num">
                        {money(goal.monthlyContributionCents)}/mo
                      </span>
                    </span>
                    <span className="segs" aria-hidden="true">
                      {Array.from({ length: 24 }, (_, i) => (
                        <span
                          key={i}
                          className={`segs__seg${i < Math.round(fraction * 24) ? ' segs__seg--on' : ''}`}
                        />
                      ))}
                    </span>
                    <span className="row-btn__detail num">
                      {money(goal.savedCents)} of {money(goal.targetCents)} saved (
                      {Math.round(fraction * 100)}%)
                      {goal.targetDate ? ` · by ${shortDate(goal.targetDate)}` : ''}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => setEditing({ type: 'goal' })}
        >
          <PlusIcon size={18} />
          Add goal
        </button>
      </section>

      {editing?.type === 'recurring' && (
        <RecurringSheet
          key={editing.item?.id ?? editing.kind}
          item={editing.item}
          kind={editing.kind}
          onClose={() => setEditing(null)}
        />
      )}
      {editing?.type === 'budget' && (
        <BudgetSheet
          key={editing.category.id}
          category={editing.category}
          budget={budgets.find((b) => b.categoryId === editing.category.id)}
          onClose={() => setEditing(null)}
        />
      )}
      {editing?.type === 'goal' && (
        <GoalSheet
          key={editing.goal?.id ?? 'new'}
          goal={editing.goal}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
