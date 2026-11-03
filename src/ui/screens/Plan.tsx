// Plan: where the period's income goes. A wheel of 100 ticks (1% of income each) shows
// every category and goal as its share in its own colour; tap a colour to pick it, then
// drag round the wheel to resize it. Below, each category and goal is a row you slide
// sideways to change its amount ($5 steps); tap one for whether its unspent money resets
// or rolls over, and Edit for the full sheet (exact amount, colour, name). Reset undoes
// this visit's changes. The calendar looks back at earlier months, read-only.

import { useEffect, useRef, useState } from 'preact/hooks';
import { fmtDate, money, reasonText, S } from '../../copy/strings';
import { percentOf, shareTicks } from '../../domain/allocation';
import { CATEGORY_COLORS, categoryColor, isBudgetCategory, nextCategoryColor, SUGGESTED_CATEGORIES } from '../../domain/defaults';
import { periodLength, type Period } from '../../domain/period';
import type { GeneratedPlan, GoalFlag } from '../../domain/planGenerator';
import type { Account, BudgetBehaviour, Category, Cents } from '../../domain/types';
import { orderedAccounts } from '../../services/accounts';
import { addGoalToPlan, contribute, listGoals, removeGoal, setGoalContribution, updateGoal } from '../../services/goals';
import { addCategory, budgetsFor, plannedIncome, planPeriods, removeCategory, setAllocation, updateCategory, type PlanPeriod } from '../../services/plan';
import { acceptPlan, recommendPlan } from '../../services/regenerate';
import { AccountSelect, AllocationInput, Amount, AmountModeToggle, ChipSelect, Message, MoneyInput, PageHeader, type AmountMode } from '../components';
import { useApp, useLoad } from '../hooks';
import { CalendarIcon, PlusIcon, SparkIcon } from '../Icons';
import { PlanWheel } from '../PlanWheel';
import { PlanRow, rowScale } from '../PlanRow';
import { ColorPicker } from '../cards';
import { Sheet } from '../Sheet';
import { go, useRoute } from '../router';

const GROUP_ORDER: Category['group'][] = ['essentials', 'lifestyle', 'savings'];
const BEHAVIOURS: BudgetBehaviour[] = ['reset', 'rollover', 'fund'];

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

type Editing = { kind: 'cat'; id: string } | { kind: 'goal'; id: string } | { kind: 'newCat' } | { kind: 'newGoal' } | { kind: 'suggest' } | { kind: 'periods' };

export function Plan() {
  const { app, bump } = useApp();
  // A past period picked from the calendar (its start date); null is the current one.
  const [viewing, setViewing] = useState<string | null>(null);
  const past = viewing !== null;
  const data = useLoad((a) => budgetsFor(a, viewing ?? undefined), [viewing]);
  // A closed period's snapshot is what it really was: later plan edits don't rewrite it.
  const snapshot = useLoad(async (a) => (viewing ? (await a.repos.snapshots.all()).find((x) => x.periodStart === viewing) : undefined), [viewing]);
  const periods = useLoad(planPeriods);
  const goals = useLoad(listGoals);
  const income = useLoad(plannedIncome);
  const recurring = useLoad((a) => a.repos.recurring.all());
  const accounts = useLoad(orderedAccounts)?.filter((a) => !a.archived) ?? [];
  const [selected, setSelected] = useState<string>();
  const [live, setLive] = useState<{ key: string; cents: Cents } | null>(null); // while scrubbing
  const [editing, setEditing] = useState<Editing | null>(null);
  const [flags, setFlags] = useState<GoalFlag[]>([]);
  const [msg, setMsg] = useState<string>();
  const [openRow, setOpenRow] = useState<string>(); // the row showing its options
  // The plan as it was when this visit started, for Reset.
  const baseline = useRef<{ cents: Record<string, Cents>; behaviour: Record<string, BudgetBehaviour> } | null>(null);
  // Held the Plan tab → Suggest a plan.
  const action = useRoute().params.get('do');
  useEffect(() => {
    if (action !== 'suggest') return;
    setEditing({ kind: 'suggest' });
    go('/plan'); // clear it, so holding again opens it again
  }, [action]);
  if (!data || !goals || income === undefined) return <div class="placeholder" />;

  // Looking back, each category shows what it had and spent then (from the snapshot when there is one).
  const then = (r: (typeof data.rows)[number]) => {
    const snap = snapshot?.perCategory[r.category.id];
    return snap ? { availableCents: snap.allocatedCents, spentCents: snap.spentCents, remainingCents: snap.remainingCents } : r.budget;
  };
  // A category's share is what's planned for it, and never less than the bills due in it this period.
  const planOf = (id: string) => {
    if (past) {
      const r = data.rows.find((x) => x.category.id === id);
      return r ? then(r).availableCents : 0;
    }
    return Math.max(data.plan.templateAllocations[id] ?? 0, data.due[id] ?? 0);
  };
  const rows = [...data.rows].filter((r) => isBudgetCategory(r.category)).sort((a, b) => GROUP_ORDER.indexOf(a.category.group) - GROUP_ORDER.indexOf(b.category.group) || a.category.sortOrder - b.category.sortOrder);
  const slices: Slice[] = [
    ...rows.map((r, i) => ({ key: `cat:${r.category.id}`, id: r.category.id, kind: 'cat' as const, name: r.category.name, color: categoryColor(r.category, i), cents: planOf(r.category.id) })),
    // Goal amounts aren't kept per period, so a past period shows categories only.
    ...(past ? [] : goals.map((g) => ({ key: `goal:${g.goal.id}`, id: g.goal.id, kind: 'goal' as const, name: g.goal.name, cents: g.perPeriodCents }))),
  ]
    .map((s) => ({ ...s, cents: live?.key === s.key ? live.cents : s.cents }))
    .map((s, i, all) => ({ ...s, color: colorOf(s as { kind: 'cat' | 'goal'; color?: string }, i, all as { kind: 'cat' | 'goal'; color?: string }[]) }));

  const planned = slices.reduce((t, s) => t + s.cents, 0);
  // With no income set up (or looking back), the dial shows each share of what's planned instead.
  const base = income > 0 && !past ? income : planned;
  const spentThen = past ? rows.reduce((t, r) => t + then(r).spentCents, 0) : 0;
  const spentOf = (id: string) => {
    const r = rows.find((x) => x.category.id === id);
    return r ? then(r).spentCents : 0;
  };
  const ticks = shareTicks(slices, base);
  const wheel = slices.map((s, i) => ({ key: s.key, ticks: ticks[i]!.ticks, color: s.color }));
  const pct = (c: Cents) => percentOf(c, base);
  const current = slices.find((s) => s.key === selected);
  const days = periodLength(data.period);
  const left = income - planned;
  const scale = rowScale(Math.max(0, ...slices.map((x) => x.cents)));
  // The most a slice can take: its own plus whatever income isn't planned yet.
  const maxFor = (sl: Slice) => (income > 0 ? Math.max(sl.cents, income - (planned - sl.cents)) : Number.MAX_SAFE_INTEGER);

  if (!past && !baseline.current)
    baseline.current = {
      cents: Object.fromEntries(slices.map((x) => [x.key, x.cents])),
      behaviour: Object.fromEntries(rows.map((r) => [r.category.id, r.category.behaviour])),
    };
  const base0 = baseline.current;
  const changed =
    !past &&
    !!base0 &&
    (slices.some((x) => x.key in base0.cents && base0.cents[x.key] !== x.cents) ||
      rows.some((r) => r.category.id in base0.behaviour && base0.behaviour[r.category.id] !== r.category.behaviour));
  const reset = async () => {
    if (!base0) return;
    for (const x of slices) if (x.key in base0.cents && base0.cents[x.key] !== x.cents) await (x.kind === 'cat' ? setAllocation(app, x.id, base0.cents[x.key]!) : setGoalContribution(app, x.id, base0.cents[x.key]!));
    for (const r of rows) {
      const b = base0.behaviour[r.category.id];
      if (b && b !== r.category.behaviour) await updateCategory(app, r.category.id, { behaviour: b });
    }
    setSelected(undefined);
    setOpenRow(undefined);
    bump();
  };

  // Dragging round the wheel moves the picked slice's end to the tick under the finger.
  const dragTo = (tick: number) => {
    const k = slices.findIndex((x) => x.key === selected);
    if (k < 0 || income <= 0) return;
    const sl = slices[k]!;
    const start = slices.slice(0, k).reduce((t, x) => t + x.cents, 0);
    const want = Math.round((((tick + 1) / 100) * income - start) / 500) * 500;
    setLive({ key: sl.key, cents: Math.max(0, Math.min(maxFor(sl), want)) });
  };

  const save = async (s: Slice, cents: Cents) => {
    if (s.kind === 'cat') await setAllocation(app, s.id, cents);
    else await setGoalContribution(app, s.id, cents);
    setLive(null);
    bump();
  };
  const name = (id: string) => slices.find((s) => s.id === id)?.name ?? id;
  const flagText = (f: GoalFlag) =>
    f.code === 'date_unrealistic' ? S.goalFlag.date_unrealistic(name(f.goalId), f.realisticDate!, f.reachableByDateCents) : S.goalFlag.no_room_now(name(f.goalId));

  const centre = past ? (
    // Looking back: how much of what was planned got spent.
    <>
      <span class="wheel__label">{current ? current.name : S.plan.spentLabel}</span>
      <span class="wheel__pct">
        {Math.round(percentOf(current ? spentOf(current.id) : spentThen, Math.max(1, current ? current.cents : planned)))}
        <small>%</small>
      </span>
      <span class="wheel__sub">{S.plan.ofIncome(current ? spentOf(current.id) : spentThen, current ? current.cents : planned)}</span>
    </>
  ) : income <= 0 ? (
    <>
      <span class="wheel__label">{current ? current.name : S.plan.ofPlan}</span>
      <span class="wheel__pct">
        {current ? Math.round(pct(current.cents)) : 100}
        <small>%</small>
      </span>
      <span class="wheel__sub">{current ? money(current.cents) : S.plan.noIncome}</span>
    </>
  ) : (
    <>
      <span class="wheel__label">{current ? current.name : S.plan.planned}</span>
      <span class={`wheel__pct${!current && left < 0 ? ' wheel__pct--over' : ''}`}>
        {Math.round(pct(current ? current.cents : planned))}
        <small>%</small>
      </span>
      <span class="wheel__sub">{S.plan.ofIncome(current ? current.cents : planned, income)}</span>
      <span class={`wheel__note${left < 0 ? ' wheel__note--over' : ''}`}>
        {current ? S.plan.dayRate(Math.round(current.cents / days)) : left >= 0 ? S.plan.leftToPlan(left) : S.plan.over(-left)}
      </span>
    </>
  );

  const hint = past
    ? S.plan.pastHint
    : income <= 0
      ? S.plan.noIncomeHint
      : current
        ? S.plan.dragHint(current.name)
        : left < 0
          ? S.plan.overHint
          : S.plan.pickHint;

  // A category's options: what happens to unspent money, and the full sheet.
  const catOptions = (r: (typeof rows)[number]) => (
    <div class="prow__opts">
      <span>{S.plan.unspent}</span>
      <div class="segmented prow__seg" role="radiogroup" aria-label={S.plan.unspent}>
        <span class="segmented__thumb" style={{ width: 'calc((100% - 4px) / 3)', transform: `translateX(${BEHAVIOURS.indexOf(r.category.behaviour) * 100}%)` }} />
        {BEHAVIOURS.map((bh) => (
          <button
            type="button"
            role="radio"
            key={bh}
            aria-checked={r.category.behaviour === bh}
            onClick={async () => {
              if (bh === r.category.behaviour) return;
              await updateCategory(app, r.category.id, { behaviour: bh });
              bump();
            }}
          >
            {S.plan.modes[bh]}
          </button>
        ))}
      </div>
      <button type="button" class="linkbtn linkbtn--accent prow__edit" onClick={() => setEditing({ kind: 'cat', id: r.category.id })}>
        {S.common.edit}
      </button>
    </div>
  );

  const tap = (key: string) => {
    setSelected(key);
    setOpenRow(openRow === key ? undefined : key);
  };

  return (
    <section class="plan">
      <PageHeader
        title={S.plan.title}
        eyebrow={S.plan.budgetFor(periodLabel(data.period, periods?.kind))}
        action={
          <div class="head-actions">
            {changed && (
              <button type="button" class="plan__reset" onClick={reset}>
                {S.plan.reset}
              </button>
            )}
            <button type="button" class={`icon-btn ${past ? 'icon-btn--plain' : 'icon-btn--soft'}`} aria-label={S.plan.history} onClick={() => setEditing({ kind: 'periods' })}>
              <CalendarIcon />
            </button>
            {!past && (
              <button type="button" class="icon-btn icon-btn--soft plan__suggest" aria-label={S.plan.regenerate} onClick={() => setEditing({ kind: 'suggest' })}>
                <SparkIcon />
              </button>
            )}
          </div>
        }
      />

      {past && (
        <div class="plan-past">
          <span>
            <small>{S.plan.lookingBack}</small>
            <strong>{periodLabel(data.period, periods?.kind)}</strong>
          </span>
          <button type="button" class="link" onClick={() => (setViewing(null), setSelected(undefined))}>
            {S.plan.backToNow}
          </button>
        </div>
      )}

      <PlanWheel
        slices={wheel}
        selected={selected}
        onSelect={(key) => (setSelected(key), setOpenRow(undefined))}
        onDrag={!past && income > 0 ? dragTo : undefined}
        onDragEnd={() => {
          const sl = slices.find((x) => x.key === live?.key);
          if (sl && live) void save(sl, live.cents);
        }}
        label={S.plan.wheelLabel}
      >
        {centre}
      </PlanWheel>
      <p class="plan__hint">{hint}</p>

      <Message text={msg} />
      {flags.map((f) => (
        <p class="note" key={f.goalId}>
          {flagText(f)}
        </p>
      ))}

      <div class="section-head">
        <h2>{S.plan.categories}</h2>
        {!past && <span class="section-head__note">{S.plan.slideToAdjust}</span>}
      </div>
      <div class="prow-list">
        {rows.map((r) => {
          const sl = slices.find((x) => x.key === `cat:${r.category.id}`)!;
          const b = past ? then(r) : r.budget;
          // What's left moves with the amount while it's being changed.
          const leftNow = past ? b.remainingCents : b.remainingCents + (sl.cents - planOf(r.category.id));
          return (
            <PlanRow
              key={sl.key}
              name={r.category.name}
              color={sl.color}
              cents={sl.cents}
              spentCents={b.spentCents}
              pct={`${Math.round(pct(sl.cents))}%`}
              sub={past ? S.plan.spentOf(b.spentCents, b.availableCents) : `${S.plan.left(leftNow)} · ${S.plan.modes[r.category.behaviour]}`}
              scale={scale}
              max={maxFor(sl)}
              selected={selected === sl.key}
              open={openRow === sl.key}
              readOnly={past}
              onChange={(c) => (setSelected(sl.key), setLive({ key: sl.key, cents: c }))}
              onCommit={(c) => save(sl, c)}
              onTap={() => !past && tap(sl.key)}
            >
              {past ? undefined : catOptions(r)}
            </PlanRow>
          );
        })}
      </div>
      {!past && (
        <button type="button" class="onb-add" onClick={() => setEditing({ kind: 'newCat' })}>
          <PlusIcon /> {S.plan.addCategory}
        </button>
      )}

      {!past && (
        <>
          <div class="section-head">
            <h2>{S.plan.goals}</h2>
          </div>
          <div class="prow-list">
            {goals.map(({ goal, progress }) => {
              const sl = slices.find((x) => x.key === `goal:${goal.id}`)!;
              return (
                <PlanRow
                  key={sl.key}
                  name={goal.name}
                  color={sl.color}
                  cents={sl.cents}
                  spentCents={0}
                  pct={`${Math.round(pct(sl.cents))}%`}
                  sub={goal.targetCents > 0 ? S.plan.goalLine(progress.progressCents, goal.targetCents) : S.plan.goalOpen(progress.progressCents)}
                  scale={scale}
                  max={maxFor(sl)}
                  selected={selected === sl.key}
                  open={openRow === sl.key}
                  onChange={(c) => (setSelected(sl.key), setLive({ key: sl.key, cents: c }))}
                  onCommit={(c) => save(sl, c)}
                  onTap={() => tap(sl.key)}
                >
                  <div class="prow__opts">
                    <span>{S.plan.perPeriod(sl.cents)}</span>
                    <button type="button" class="linkbtn linkbtn--accent prow__edit" onClick={() => setEditing({ kind: 'goal', id: goal.id })}>
                      {S.common.edit}
                    </button>
                  </div>
                </PlanRow>
              );
            })}
          </div>
          <button type="button" class="onb-add" onClick={() => setEditing({ kind: 'newGoal' })}>
            <PlusIcon /> {S.plan.addGoal}
          </button>
        </>
      )}

      {editing && (
        <Sheet label={S.plan.title} onClose={() => setEditing(null)}>
          <div class="onb-sheet">
            {editing.kind === 'cat' && (
              <CategorySheet
                row={rows.find((r) => r.category.id === editing.id)!}
                cents={planOf(editing.id)}
                due={data.due[editing.id] ?? 0}
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
            {editing.kind === 'periods' && periods && (
              <PeriodPicker
                kind={periods.kind}
                periods={periods.periods}
                value={viewing ?? periods.periods.find((p) => p.current)?.start}
                onPick={(p) => (setViewing(p.current ? null : p.start), setSelected(undefined), setEditing(null))}
              />
            )}
          </div>
        </Sheet>
      )}
    </section>
  );
}

function CategorySheet(props: { row: { category: Category; budget: { remainingCents: Cents } }; cents: Cents; due: Cents; color: string; income: Cents; inUse: number; onDone: () => void }) {
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
      {props.due > 0 && <p class="plan-sheet__note">{S.plan.coversBills(props.due)}</p>}
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

const MONTHS = Array.from({ length: 12 }, (_, m) => new Date(2026, m, 15).toLocaleDateString('en-CA', { month: 'short' }));

/** "September 2026" for a monthly period, else its dates. */
function periodLabel(p: Period, kind?: 'monthly' | 'payday'): string {
  const d = (x: string) => new Date(`${x}T12:00:00`);
  if (kind !== 'payday') return d(p.start).toLocaleDateString('en-CA', { month: 'long', year: 'numeric' });
  return `${fmtDate(p.start)} – ${fmtDate(p.end)}`;
}

/**
 * The Plan's calendar: a year of months (or, paid by payday, each pay period), newest
 * year first. Months with nothing recorded, and the future, are greyed out.
 */
function PeriodPicker(props: { kind: 'monthly' | 'payday'; periods: PlanPeriod[]; value?: string; onPick: (p: PlanPeriod) => void }) {
  const years = [...new Set(props.periods.map((p) => Number(p.start.slice(0, 4))))].sort((a, b) => b - a);
  const tile = (p: PlanPeriod | undefined, label: string, key: string) => (
    <button
      type="button"
      key={key}
      class={`period-tile${p && p.start === props.value ? ' on' : ''}${p?.current ? ' period-tile--now' : ''}`}
      disabled={!p?.hasData}
      aria-pressed={!!p && p.start === props.value}
      onClick={() => p && props.onPick(p)}
    >
      {label}
    </button>
  );
  return (
    <div class="period-picker">
      <h2>{S.plan.history}</h2>
      <p class="muted">{S.plan.historySub}</p>
      {years.map((y) => (
        <section key={y}>
          <p class="eyebrow">{y}</p>
          <div class={`period-grid${props.kind === 'payday' ? ' period-grid--pay' : ''}`}>
            {props.kind === 'payday'
              ? props.periods.filter((p) => p.start.startsWith(String(y))).reverse().map((p) => tile(p, `${fmtDate(p.start)} – ${fmtDate(p.end)}`, p.start))
              : MONTHS.map((m, i) => {
                  const ym = `${y}-${String(i + 1).padStart(2, '0')}`;
                  return tile(props.periods.find((p) => p.start.startsWith(ym)), m, ym);
                })}
          </div>
        </section>
      ))}
    </div>
  );
}
