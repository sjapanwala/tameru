// Plan: where the period's income goes. A dial of 100 ticks (1% of income each) shows
// every category and goal as its share in its own colour; tap a colour to pick it, then
// scrub the tick ruler to set its percentage. Pull the card down for a label on every
// colour. Below, each category and goal opens a sheet for exact amounts (in dollars or
// percent), its colour and settings.

import { useEffect, useState } from 'preact/hooks';
import { money, reasonText, S } from '../../copy/strings';
import { centsForPercent, percentOf, shareTicks } from '../../domain/allocation';
import { CATEGORY_COLORS, categoryColor, isBudgetCategory, nextCategoryColor, SUGGESTED_CATEGORIES } from '../../domain/defaults';
import { periodLength } from '../../domain/period';
import type { GeneratedPlan, GoalFlag } from '../../domain/planGenerator';
import type { Account, BudgetBehaviour, Category, Cents } from '../../domain/types';
import { orderedAccounts } from '../../services/accounts';
import { addGoalToPlan, contribute, listGoals, removeGoal, setGoalContribution, updateGoal } from '../../services/goals';
import { addCategory, budgetsFor, plannedIncome, removeCategory, setAllocation, updateCategory } from '../../services/plan';
import { acceptPlan, recommendPlan } from '../../services/regenerate';
import { AccountSelect, AllocationInput, Amount, AmountModeToggle, ChipSelect, Message, Meter, MoneyInput, PageHeader, type AmountMode } from '../components';
import { useApp, useLoad } from '../hooks';
import { ChevronRight, PlusIcon } from '../Icons';
import { PlanDial, TickRuler, type DialSlice } from '../PlanDial';
import { ColorPicker } from '../cards';
import { reducedMotion } from '../motion';
import { Sheet } from '../Sheet';
import { useWalletPull } from '../Wallet';

const GROUP_ORDER: Category['group'][] = ['essentials', 'lifestyle', 'savings'];

/** Categories use their own colour; goals take palette colours no category is using. */
function colorOf(s: { kind: 'cat' | 'goal'; color?: string }, i: number, all: readonly { kind: 'cat' | 'goal'; color?: string }[]): string {
  if (s.kind === 'cat') return s.color ?? CATEGORY_COLORS[i % CATEGORY_COLORS.length]!;
  const taken = all.slice(0, i).map((x, j) => (x.kind === 'cat' ? (x.color ?? CATEGORY_COLORS[j % CATEGORY_COLORS.length]) : colorOf(x, j, all)));
  return nextCategoryColor(taken);
}

interface Slice {
  key: string; // 'cat:<id>' | 'goal:<id>'
  id: string;
  kind: 'cat' | 'goal';
  name: string;
  cents: Cents;
  color: string;
}

type Editing = { kind: 'cat'; id: string } | { kind: 'goal'; id: string } | { kind: 'newCat' } | { kind: 'newGoal' } | { kind: 'suggest' };

export function Plan() {
  const { app, bump } = useApp();
  const data = useLoad(budgetsFor);
  const goals = useLoad(listGoals);
  const income = useLoad(plannedIncome);
  const recurring = useLoad((a) => a.repos.recurring.all());
  const accounts = useLoad(orderedAccounts)?.filter((a) => !a.archived) ?? [];
  const [selected, setSelected] = useState<string>();
  const [live, setLive] = useState<{ key: string; cents: Cents } | null>(null); // while scrubbing
  const [editing, setEditing] = useState<Editing | null>(null);
  const [flags, setFlags] = useState<GoalFlag[]>([]);
  const [msg, setMsg] = useState<string>();
  const pull = useWalletPull();
  useEffect(() => pull.setTravel(180), []);
  if (!data || !goals || income === undefined) return <div class="placeholder" />;
  const animate = !pull.dragging && !reducedMotion();

  const rows = [...data.rows].filter((r) => isBudgetCategory(r.category)).sort((a, b) => GROUP_ORDER.indexOf(a.category.group) - GROUP_ORDER.indexOf(b.category.group) || a.category.sortOrder - b.category.sortOrder);
  const slices: Slice[] = [
    ...rows.map((r, i) => ({ key: `cat:${r.category.id}`, id: r.category.id, kind: 'cat' as const, name: r.category.name, color: categoryColor(r.category, i), cents: data.plan.templateAllocations[r.category.id] ?? 0 })),
    ...goals.map((g) => ({ key: `goal:${g.goal.id}`, id: g.goal.id, kind: 'goal' as const, name: g.goal.name, cents: g.perPeriodCents })),
  ]
    .map((s) => ({ ...s, cents: live?.key === s.key ? live.cents : s.cents }))
    .map((s, i, all) => ({ ...s, color: colorOf(s as { kind: 'cat' | 'goal'; color?: string }, i, all as { kind: 'cat' | 'goal'; color?: string }[]) }));

  const planned = slices.reduce((t, s) => t + s.cents, 0);
  // With no income set up, the dial shows each share of what's planned instead.
  const base = income > 0 ? income : planned;
  const ticks = shareTicks(slices, base);
  const dial: DialSlice[] = slices.map((s, i) => ({ key: s.key, ticks: ticks[i]!.ticks, color: s.color, name: s.name, detail: `${Math.round(percentOf(s.cents, base))}% · ${money(s.cents)}` }));
  const pct = (c: Cents) => percentOf(c, base);
  const freePct = Math.max(0, 100 - ticks.reduce((t, x) => t + x.ticks, 0));
  const current = slices.find((s) => s.key === selected);
  const days = periodLength(data.period);

  const save = async (s: Slice, cents: Cents) => {
    if (s.kind === 'cat') await setAllocation(app, s.id, cents);
    else await setGoalContribution(app, s.id, cents);
    setLive(null);
    bump();
  };
  const name = (id: string) => slices.find((s) => s.id === id)?.name ?? id;
  const flagText = (f: GoalFlag) =>
    f.code === 'date_unrealistic' ? S.goalFlag.date_unrealistic(name(f.goalId), f.realisticDate!, f.reachableByDateCents) : S.goalFlag.no_room_now(name(f.goalId));

  const curPct = current ? Math.round(pct(current.cents)) : 0;
  return (
    <section class="plan">
      <PageHeader
        eyebrow={S.plan.period(data.period.start, data.period.end)}
        title={S.plan.title}
        action={
          <button type="button" class="icon-btn icon-btn--soft plan__suggest" aria-label={S.plan.regenerate} onClick={() => setEditing({ kind: 'suggest' })}>
            <SparkIcon />
          </button>
        }
      />

      <div
        ref={pull.ref}
        class={`summary-card plan-card${animate ? ' plan-card--animate' : ''}`}
        style={pull.bind.style}
        // Scrubbing the ruler is its own gesture, never a pull.
        onPointerDown={(e) => !(e.target as Element).closest('.tick-ruler') && pull.bind.onPointerDown(e)}
        onPointerMove={pull.bind.onPointerMove}
        onPointerUp={pull.bind.onPointerUp}
        onPointerCancel={pull.bind.onPointerCancel}
        onClickCapture={pull.bind.onClickCapture}
      >
        <PlanDial slices={dial} selected={selected} p={pull.p} onSelect={setSelected}>
          {current ? (
            <>
              <p class="plan-dial__label">{current.name}</p>
              <p class="plan-dial__pct">
                {Math.round(pct(current.cents))}
                <span>%</span>
              </p>
              <p class="plan-dial__sub">
                {money(current.cents)} · {S.plan.dayRate(Math.round(current.cents / days))}
              </p>
            </>
          ) : (
            <>
              <p class="plan-dial__label">{income > 0 ? S.plan.planned : S.plan.ofPlan}</p>
              <p class="plan-dial__pct">
                {income > 0 ? Math.round(pct(planned)) : 100}
                <span>%</span>
              </p>
              <p class="plan-dial__sub">{income <= 0 ? S.plan.noIncome : planned > income ? S.plan.over(planned - income) : S.plan.ofIncome(planned, income)}</p>
            </>
          )}
        </PlanDial>
        {current && income > 0 ? (
          <TickRuler
            label={current.name}
            value={curPct}
            max={Math.min(100, curPct + freePct)}
            onChange={(v) => setLive({ key: current.key, cents: centsForPercent(v, income) })}
            onCommit={(v) => save(current, centsForPercent(v, income))}
          />
        ) : (
          <p class="plan-card__hint">{income <= 0 ? S.plan.noIncomeHint : planned > income ? S.plan.overHint : S.plan.pickHint}</p>
        )}
        <button type="button" class="spend-card__handle" aria-label={pull.open ? S.plan.hideLabels : S.plan.showLabels} aria-expanded={pull.open} onClick={() => pull.setOpen(!pull.open)}>
          <span />
        </button>
      </div>

      <Message text={msg} />
      {flags.map((f) => (
        <p class="note" key={f.goalId}>
          {flagText(f)}
        </p>
      ))}

      <div class="section-head">
        <h2>{S.plan.categories}</h2>
      </div>
      <ul class="plan-list">
        {rows.map((r) => {
          const s = slices.find((x) => x.key === `cat:${r.category.id}`)!;
          return (
            <li key={r.category.id}>
              <button type="button" class="plan-row" onClick={() => setEditing({ kind: 'cat', id: r.category.id })}>
                <span class="plan-pill__dot" style={{ background: s.color }} />
                <span class="plan-row__main">
                  <strong>{r.category.name}</strong>
                  <small>
                    {S.plan.left(r.budget.remainingCents)} · {S.behaviourShort[r.category.behaviour]}
                  </small>
                  <Meter left={r.budget.remainingCents} of={Math.max(r.budget.availableCents, 1)} />
                </span>
                <span class="plan-row__amt">
                  <Amount c={s.cents} />
                  <small>{Math.round(pct(s.cents))}%</small>
                </span>
                <ChevronRight />
              </button>
            </li>
          );
        })}
      </ul>
      <button type="button" class="onb-add" onClick={() => setEditing({ kind: 'newCat' })}>
        <PlusIcon /> {S.plan.addCategory}
      </button>

      <div class="section-head">
        <h2>{S.plan.goals}</h2>
      </div>
      <ul class="plan-list">
        {goals.map(({ goal, progress, perPeriodCents }) => {
          const s = slices.find((x) => x.key === `goal:${goal.id}`)!;
          return (
            <li key={goal.id}>
              <button type="button" class="plan-row" onClick={() => setEditing({ kind: 'goal', id: goal.id })}>
                <span class="plan-pill__dot" style={{ background: s.color }} />
                <span class="plan-row__main">
                  <strong>{goal.name}</strong>
                  <small>{goal.targetCents > 0 ? S.plan.goalLine(progress.progressCents, goal.targetCents) : S.plan.goalOpen(progress.progressCents)}</small>
                  {goal.targetCents > 0 && <Meter left={progress.progressCents} of={goal.targetCents} />}
                </span>
                <span class="plan-row__amt">
                  <Amount c={perPeriodCents} />
                  <small>{Math.round(pct(perPeriodCents))}%</small>
                </span>
                <ChevronRight />
              </button>
            </li>
          );
        })}
      </ul>
      <button type="button" class="onb-add" onClick={() => setEditing({ kind: 'newGoal' })}>
        <PlusIcon /> {S.plan.addGoal}
      </button>

      {editing && (
        <Sheet label={S.plan.title} onClose={() => setEditing(null)}>
          <div class="onb-sheet">
            {editing.kind === 'cat' && (
              <CategorySheet
                row={rows.find((r) => r.category.id === editing.id)!}
                cents={data.plan.templateAllocations[editing.id] ?? 0}
                color={slices.find((x) => x.key === `cat:${editing.id}`)!.color}
                income={income}
                inUse={(recurring ?? []).filter((r) => !r.archived && r.kind !== 'income' && r.categoryId === editing.id).length}
                onDone={() => (setEditing(null), setSelected(undefined), bump())}
              />
            )}
            {editing.kind === 'goal' &&
              (() => {
                const g = goals.find((x) => x.goal.id === editing.id)!;
                return (
                  <GoalSheet
                    income={income}
                    goalId={g.goal.id}
                    name={g.goal.name}
                    target={g.goal.targetCents}
                    date={g.goal.targetDate}
                    perPeriod={g.perPeriodCents}
                    accounts={accounts}
                    hasAccount={!!g.goal.accountId}
                    onSaved={(f, m) => (setFlags(f), setMsg(m), setEditing(null), bump())}
                  />
                );
              })()}
            {editing.kind === 'newCat' && <NewCategory taken={slices.map((x) => x.name)} usedColors={slices.map((x) => x.color)} onDone={() => (setEditing(null), bump())} />}
            {editing.kind === 'newGoal' && <NewGoal accounts={accounts} onSaved={(f) => (setFlags(f), setEditing(null), bump())} />}
            {editing.kind === 'suggest' && <Suggest name={name} onDone={() => (setEditing(null), bump())} flagText={flagText} />}
          </div>
        </Sheet>
      )}
    </section>
  );
}

const SparkIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M12 3.5v4M12 16.5v4M3.5 12h4M16.5 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />
  </svg>
);

function CategorySheet(props: { row: { category: Category; budget: { remainingCents: Cents } }; cents: Cents; color: string; income: Cents; inUse: number; onDone: () => void }) {
  const { app } = useApp();
  const c = props.row.category;
  const canPercent = props.income > 0;
  const [mode, setMode] = useState<AmountMode>('dollars');
  const [amount, setAmount] = useState<Cents | undefined>(props.cents);
  const [behaviour, setBehaviour] = useState<BudgetBehaviour>(c.behaviour);
  const [color, setColor] = useState(props.color);
  const [name, setName] = useState(c.name);
  const cents = amount ?? 0;
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (cents !== props.cents) await setAllocation(app, c.id, cents);
        const renamed = name.trim() && name.trim() !== c.name ? { name: name.trim() } : {};
        if (behaviour !== c.behaviour || color !== c.color || 'name' in renamed) await updateCategory(app, c.id, { behaviour, color, ...renamed });
        props.onDone();
      }}
    >
      <h2 class="plan-sheet__title">
        <span class="plan-pill__dot" style={{ background: color }} />
        {name.trim() || c.name}
      </h2>
      <label class="field">
        {S.common.name}
        <input value={name} autoCapitalize="sentences" onInput={(e) => setName((e.target as HTMLInputElement).value)} />
      </label>
      {canPercent && <AmountModeToggle value={mode} onChange={setMode} />}
      <label class={`field ${mode === 'percent' ? 'field--percent' : 'field--money'}`}>
        {mode === 'percent' ? S.plan.percentOfIncome : S.plan.allocation}
        <AllocationInput value={amount} base={props.income} mode={mode} onChange={setAmount} />
        {canPercent && <small>{mode === 'percent' ? S.plan.dollarsOf(cents, props.income) : S.plan.shareOf(Math.round(percentOf(cents, props.income)))}</small>}
      </label>
      <ColorPicker colors={CATEGORY_COLORS} value={color} onChange={setColor} />
      <p class="field-label">{S.plan.behaviour}</p>
      <ChipSelect label={S.plan.behaviour} options={(['reset', 'rollover', 'fund'] as const).map((b) => ({ value: b, label: S.behaviour[b] }))} value={behaviour} onChange={setBehaviour} />
      <div class="sheet__actions">
        <button type="submit" class="primary block">
          {S.common.save}
        </button>
        {props.inUse === 0 ? (
          <button
            type="button"
            class="link"
            onClick={async () => {
              await removeCategory(app, c.id);
              props.onDone();
            }}
          >
            {S.plan.removeCategory}
          </button>
        ) : (
          <p class="plan-sheet__note">{S.plan.cantRemove(props.inUse)}</p>
        )}
      </div>
    </form>
  );
}

function NewCategory(props: { taken: string[]; usedColors: string[]; onDone: () => void }) {
  const { app } = useApp();
  const [name, setName] = useState('');
  const [color, setColor] = useState(() => nextCategoryColor(props.usedColors));
  const unused = SUGGESTED_CATEGORIES.filter((s) => !props.taken.some((t) => t.toLowerCase() === s.name.toLowerCase()));
  return (
    <form onSubmit={(e) => (e.preventDefault(), name.trim() && addCategory(app, name, { color }).then(props.onDone))}>
      <h2>{S.plan.addCategory}</h2>
      <label class="field">
        {S.common.name}
        <input value={name} autoFocus autoCapitalize="sentences" placeholder={S.onboarding.categoryNamePlaceholder} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
      </label>
      {unused.length > 0 && (
        <div class="onb-suggest plan-sheet__suggest">
          {unused.map((s) => (
            <button type="button" key={s.key} class={`chip${name === s.name ? ' on' : ''}`} onClick={() => setName(s.name)}>
              {s.name}
            </button>
          ))}
        </div>
      )}
      <ColorPicker colors={CATEGORY_COLORS} value={color} onChange={setColor} />
      <div class="sheet__actions">
        <button type="submit" class="primary block" disabled={!name.trim()}>
          {S.common.add}
        </button>
      </div>
    </form>
  );
}

function Suggest(props: { name: (id: string) => string; flagText: (f: GoalFlag) => string; onDone: () => void }) {
  const { app } = useApp();
  const proposal = useLoad(recommendPlan) as GeneratedPlan | undefined;
  if (!proposal) return <p class="muted">…</p>;
  const lines = [...Object.entries(proposal.allocations), ...Object.entries(proposal.goalContributions)];
  return (
    <div>
      <h2>{S.plan.regenerate}</h2>
      <p class="muted">{S.plan.suggestHint}</p>
      <ul class="plan-suggest">
        {lines.map(([id, c]) => (
          <li key={id}>
            <span>
              <strong>{props.name(id)}</strong>
              {proposal.reasons[id]?.[0] && <small>{reasonText(proposal.reasons[id]![0]!)}</small>}
            </span>
            <Amount c={c} />
          </li>
        ))}
      </ul>
      {proposal.flags.map((f) => (
        <p class="note" key={f.goalId}>
          {props.flagText(f)}
        </p>
      ))}
      <div class="sheet__actions">
        <button type="button" class="primary block" onClick={() => acceptPlan(app, proposal).then(props.onDone)}>
          {S.plan.accept}
        </button>
        <button type="button" class="link" onClick={props.onDone}>
          {S.plan.keep}
        </button>
      </div>
    </div>
  );
}

function GoalSheet(props: {
  income: Cents;
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
  const [perPeriod, setPerPeriod] = useState<Cents | undefined>(props.perPeriod);
  const [mode, setMode] = useState<AmountMode>('dollars');
  const [target, setTarget] = useState<Cents | undefined>(props.target || undefined);
  const [date, setDate] = useState(props.date ?? '');
  const [from, setFrom] = useState<string>();
  const [amount, setAmount] = useState<Cents>();
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (perPeriod !== undefined && perPeriod !== props.perPeriod) await setGoalContribution(app, props.goalId, perPeriod);
        const changed = (target ?? 0) !== props.target || date !== (props.date ?? '');
        const r = changed ? await updateGoal(app, props.goalId, { targetCents: target ?? 0, ...(date ? { targetDate: date } : { targetDate: undefined }) }) : { flags: [] };
        props.onSaved(r.flags);
      }}
    >
      <h2>{props.name}</h2>
      {props.income > 0 && <AmountModeToggle value={mode} onChange={setMode} />}
      <label class={`field ${mode === 'percent' ? 'field--percent' : 'field--money'}`}>
        {S.plan.eachPeriod}
        <AllocationInput value={perPeriod} base={props.income} mode={mode} onChange={setPerPeriod} />
        {props.income > 0 && (
          <small>{mode === 'percent' ? S.plan.dollarsOf(perPeriod ?? 0, props.income) : S.plan.shareOf(Math.round(percentOf(perPeriod ?? 0, props.income)))}</small>
        )}
      </label>
      <label class="field field--money">
        {S.plan.target} {S.common.optional}
        <span class="field__box">
          <span class="field__cur">$</span>
          <MoneyInput value={target} onChange={setTarget} />
        </span>
      </label>
      <label class="field">
        {S.plan.targetDate} {S.common.optional}
        <input type="date" value={date} onInput={(e) => setDate((e.target as HTMLInputElement).value)} />
      </label>
      {props.hasAccount && (
        <>
          <p class="field-label">{S.plan.contribute}</p>
          <div class="plan-contribute">
            <AccountSelect accounts={props.accounts} value={from} onChange={setFrom} />
            <span class="field__box">
              <span class="field__cur">$</span>
              <MoneyInput value={amount} onChange={setAmount} />
            </span>
            <button
              type="button"
              disabled={!from || !amount}
              onClick={async () => {
                if (!from || !amount) return;
                const r = await contribute(app, props.goalId, from, amount);
                props.onSaved([], r.milestone ? S.milestone(props.name, r.milestone) : S.plan.added(amount));
              }}
            >
              {S.common.add}
            </button>
          </div>
        </>
      )}
      <div class="sheet__actions">
        <button type="submit" class="primary block">
          {S.common.save}
        </button>
        <button
          type="button"
          class="link"
          onClick={async () => {
            await removeGoal(app, props.goalId);
            props.onSaved([], S.plan.goalRemoved(props.name));
          }}
        >
          {S.plan.removeGoal}
        </button>
      </div>
    </form>
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
        const linked = accountId ?? savingAccounts[0]?.id;
        const r = await addGoalToPlan(app, { name, targetCents: target ?? 0, ...(date ? { targetDate: date } : {}), ...(linked ? { accountId: linked } : {}) });
        onSaved(r.flags);
      }}
    >
      <h2>{S.plan.addGoal}</h2>
      <label class="field">
        {S.common.name}
        <input value={name} autoFocus autoCapitalize="sentences" onInput={(e) => setName((e.target as HTMLInputElement).value)} />
      </label>
      <label class="field field--money">
        {S.plan.target} {S.common.optional}
        <span class="field__box">
          <span class="field__cur">$</span>
          <MoneyInput value={target} onChange={setTarget} />
        </span>
      </label>
      <label class="field">
        {S.plan.targetDate} {S.common.optional}
        <input type="date" value={date} onInput={(e) => setDate((e.target as HTMLInputElement).value)} />
      </label>
      {savingAccounts.length > 0 && (
        <label class="field">
          {S.plan.linked}
          <AccountSelect accounts={savingAccounts} value={accountId ?? savingAccounts[0]?.id} onChange={setAccountId} />
        </label>
      )}
      <div class="sheet__actions">
        <button type="submit" class="primary block" disabled={!name.trim()}>
          {S.common.add}
        </button>
      </div>
    </form>
  );
}
