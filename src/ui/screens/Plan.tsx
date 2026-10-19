import { useState } from 'preact/hooks';
import { money, reasonText, S } from '../../copy/strings';
import type { GeneratedPlan, GoalFlag } from '../../domain/planGenerator';
import type { Account, BudgetBehaviour, Cents } from '../../domain/types';
import { addGoalToPlan, contribute, listGoals, setGoalContribution, updateGoal } from '../../services/goals';
import { addCategory, budgetsFor, setAllocation, updateCategory } from '../../services/plan';
import { acceptPlan, recommendPlan } from '../../services/regenerate';
import { AccountSelect, Amount, Message, Meter, MoneyInput, PageHeader } from '../components';
import { useApp, useLoad } from '../hooks';
import { orderedAccounts } from '../../services/accounts';

export function Plan() {
  const { app, bump } = useApp();
  const data = useLoad(budgetsFor);
  const goals = useLoad(listGoals);
  const accounts = useLoad(orderedAccounts)?.filter((a) => !a.archived) ?? [];
  const [proposal, setProposal] = useState<GeneratedPlan>();
  const [flags, setFlags] = useState<GoalFlag[]>([]);
  const [msg, setMsg] = useState<string>();
  const [newCat, setNewCat] = useState('');
  if (!data || !goals) return <div class="placeholder" />;
  const name = (id: string) => data.rows.find((r) => r.category.id === id)?.category.name ?? goals.find((g) => g.goal.id === id)?.goal.name ?? id;
  const flagText = (f: GoalFlag) =>
    f.code === 'date_unrealistic' ? S.goalFlag.date_unrealistic(name(f.goalId), f.realisticDate!, f.reachableByDateCents) : S.goalFlag.no_room_now(name(f.goalId));

  return (
    <section>
      <PageHeader eyebrow={S.plan.period(data.period.start, data.period.end)} title={S.plan.title} />
      <div class="scroll-x">
      <table>
        <thead>
          <tr>
            <th>{S.common.category}</th>
            <th>{S.plan.allocation}</th>
            <th>{S.home.categories}</th>
            <th>{S.plan.behaviour}</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r) => (
            <tr key={r.category.id}>
              <td>
                {r.category.name}
                {(data.plan.reasons?.[r.category.id] ?? []).map((x, k) => (
                  <div key={k}><small>{reasonText(x)}</small></div>
                ))}
              </td>
              <td>
                <MoneyInput
                  value={data.plan.templateAllocations[r.category.id] ?? 0}
                  onCommit={(c) => setAllocation(app, r.category.id, c).then(bump)}
                />
              </td>
              <td class="num">{money(r.budget.remainingCents)}</td>
              <td>
                <select value={r.category.behaviour} onChange={(e) => updateCategory(app, r.category.id, { behaviour: (e.target as HTMLSelectElement).value as BudgetBehaviour }).then(bump)}>
                  {(['reset', 'rollover', 'fund'] as const).map((b) => (
                    <option key={b} value={b}>{S.behaviour[b]}</option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <form onSubmit={(e) => (e.preventDefault(), newCat.trim() && addCategory(app, newCat).then(() => (setNewCat(''), bump())))}>
        <input value={newCat} onInput={(e) => setNewCat((e.target as HTMLInputElement).value)} /> <button type="submit">{S.plan.addCategory}</button>
      </form>

      <p>
        <button type="button" onClick={() => recommendPlan(app).then(setProposal)}>{S.plan.regenerate}</button>
      </p>
      {proposal && (
        <div>
          <p>{S.plan.summary(proposal.summary.incomeCents, proposal.summary.fixedCents, proposal.summary.flexibleCents, proposal.summary.goalsCents, proposal.summary.unassignedCents)}</p>
          <ul>
            {Object.entries(proposal.allocations).map(([id, c]) => (
              <li key={id}>
                {name(id)}: {money(c)} — {(proposal.reasons[id] ?? []).map(reasonText).join(' ')}
              </li>
            ))}
            {Object.entries(proposal.goalContributions).map(([id, c]) => (
              <li key={id}>
                {name(id)}: {S.plan.perPeriod(c)} — {(proposal.reasons[id] ?? []).map(reasonText).join(' ')}
              </li>
            ))}
          </ul>
          {proposal.flags.map((f) => <p key={f.goalId}>{flagText(f)}</p>)}
          <button type="button" onClick={() => acceptPlan(app, proposal).then(() => (setProposal(undefined), bump()))}>{S.plan.accept}</button>{' '}
          <button type="button" onClick={() => setProposal(undefined)}>{S.plan.keep}</button>
        </div>
      )}

      <h2>{S.plan.goals}</h2>
      <Message text={msg} />
      {flags.map((f) => <p key={f.goalId}>{flagText(f)}</p>)}
      <ul>
        {goals.map(({ goal, progress, perPeriodCents }) => (
          <li class="goal" key={goal.id}>
            <div class="row">
              <strong>{goal.name}</strong>
              <span class="num">
                <Amount c={progress.progressCents} />
                {goal.targetCents > 0 && <span class="muted"> / {money(goal.targetCents)}</span>}
              </span>
            </div>
            {goal.targetCents > 0 && <Meter left={progress.progressCents} of={goal.targetCents} />}
            {progress.milestone > 0 && <small>{S.milestone(goal.name, progress.milestone)}</small>}
            <GoalEditor
              goalId={goal.id}
              name={goal.name}
              target={goal.targetCents}
              date={goal.targetDate}
              perPeriod={perPeriodCents}
              accounts={accounts}
              hasAccount={!!goal.accountId}
              onSaved={(f, m) => (setFlags(f), setMsg(m), bump())}
            />
          </li>
        ))}
      </ul>
      <NewGoal accounts={accounts} onSaved={(f) => (setFlags(f), bump())} />
    </section>
  );
}

function GoalEditor(props: {
  goalId: string;
  name: string;
  target: Cents;
  date?: string;
  perPeriod: Cents;
  hasAccount: boolean;
  accounts: Account[];
  onSaved: (flags: GoalFlag[], msg?: string) => void;
}) {
  const { app } = useApp();
  const [target, setTarget] = useState<Cents | undefined>(props.target);
  const [date, setDate] = useState(props.date ?? '');
  const [from, setFrom] = useState<string>();
  const [amount, setAmount] = useState<Cents>();
  return (
    <details>
      <summary>{S.plan.perPeriod(props.perPeriod)}</summary>
      <MoneyInput label={S.plan.allocation} value={props.perPeriod} onCommit={(c) => setGoalContribution(app, props.goalId, c).then(() => props.onSaved([]))} />
      <MoneyInput label={S.plan.target} value={target} onChange={setTarget} />
      <label>{S.plan.targetDate} <input type="date" value={date} onInput={(e) => setDate((e.target as HTMLInputElement).value)} /></label>
      <button
        type="button"
        onClick={async () => {
          const r = await updateGoal(app, props.goalId, { targetCents: target ?? 0, ...(date ? { targetDate: date } : { targetDate: undefined }) });
          props.onSaved(r.flags);
        }}
      >
        {S.common.save}
      </button>
      {props.hasAccount && (
        <div>
          <AccountSelect accounts={props.accounts} value={from} onChange={setFrom} /> <MoneyInput value={amount} onChange={setAmount} />{' '}
          <button
            type="button"
            onClick={async () => {
              if (!from || !amount) return;
              const r = await contribute(app, props.goalId, from, amount);
              setAmount(undefined);
              props.onSaved([], r.milestone ? S.milestone(props.name, r.milestone) : money(amount));
            }}
          >
            {S.plan.contribute}
          </button>
        </div>
      )}
    </details>
  );
}

function NewGoal({ accounts, onSaved }: { accounts: Account[]; onSaved: (f: GoalFlag[]) => void }) {
  const { app } = useApp();
  const [name, setName] = useState('');
  const [target, setTarget] = useState<Cents>();
  const [date, setDate] = useState('');
  const savingAccounts = accounts.filter((a) => a.type === 'savings' || a.type === 'investing');
  const [accountId, setAccountId] = useState<string>();
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        const r = await addGoalToPlan(app, { name, targetCents: target ?? 0, ...(date ? { targetDate: date } : {}), ...((accountId ?? savingAccounts[0]?.id) ? { accountId: accountId ?? savingAccounts[0]!.id } : {}) });
        setName('');
        setTarget(undefined);
        setDate('');
        onSaved(r.flags);
      }}
    >
      <h3>{S.plan.addGoal}</h3>
      <label>{S.common.name} <input value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} /></label>
      <MoneyInput label={`${S.plan.target} ${S.common.optional}`} value={target} onChange={setTarget} />
      <label>{S.plan.targetDate} {S.common.optional} <input type="date" value={date} onInput={(e) => setDate((e.target as HTMLInputElement).value)} /></label>
      {savingAccounts.length > 0 && (
        <label>{S.plan.linked} <AccountSelect accounts={savingAccounts} value={accountId ?? savingAccounts[0]?.id} onChange={setAccountId} /></label>
      )}
      <button type="submit">{S.common.add}</button>
    </form>
  );
}
