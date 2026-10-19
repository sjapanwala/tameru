// Onboarding orchestration: persist progress, preview the generated plan, and
// create everything when the user accepts.

import { categoryId } from '../domain/defaults';
import { goalTempId, initialState, toGeneratorInput, type AccountChoice, type OnboardingAnswers, type OnboardingState } from '../domain/onboarding';
import { periodFor, periodLength } from '../domain/period';
import { generatePlan, scaleToPeriod, type GeneratedPlan } from '../domain/planGenerator';
import { nextOccurrence, perMonth } from '../domain/recurrence';
import type { Account, Id, PeriodConfig } from '../domain/types';
import { createAccount } from './accounts';
import type { AppContext } from './context';
import { emit } from './events';
import { createGoal } from './goals';
import { getPlan, logEvent, savePlan } from './plan';
import { createRecurring } from './recurring';

export async function loadProgress(ctx: AppContext): Promise<OnboardingState> {
  return (await ctx.repos.settings.get()).onboarding ?? initialState();
}

export async function saveProgress(ctx: AppContext, state: OnboardingState): Promise<void> {
  await ctx.repos.settings.update({ onboarding: state });
}

/** Statements usually close about three weeks before the due date. */
const statementDayFor = (dueDay: number): number => (dueDay > 21 ? dueDay - 21 : dueDay + 7);

/** Average days in a pay period for a frequency (for scaling a monthly plan). */
function payPeriodDays(a: OnboardingAnswers): number | undefined {
  const main = a.incomes[0];
  if (a.periodAlignment !== 'payday' || !main || main.freq === 'irregular' || main.freq === 'monthly') return undefined;
  return 365 / 12 / perMonth(main.freq);
}

/** The recommended plan, per budget period. Deterministic: "regenerate" after changing answers. */
export function previewPlan(a: OnboardingAnswers, today: string): GeneratedPlan {
  const monthly = generatePlan(toGeneratorInput(a, today));
  const days = payPeriodDays(a);
  if (!days) return monthly;
  return { ...monthly, allocations: scaleToPeriod(monthly.allocations, days), goalContributions: scaleToPeriod(monthly.goalContributions, days) };
}

/** Create accounts, income, bills, goals and the plan. `plan` may include the user's adjustments. */
export async function finishOnboarding(ctx: AppContext, a: OnboardingAnswers, plan: Pick<GeneratedPlan, 'allocations' | 'goalContributions' | 'reasons'>): Promise<void> {
  const today = ctx.clock.today();
  const byType = new Map<AccountChoice, Account>();
  const answers = a.accounts.length ? a.accounts : [{ type: 'chequing' as const, name: 'Chequing', balanceCents: 0 }];
  for (const acc of answers) {
    const created = await createAccount(ctx, {
      name: acc.name,
      type: acc.type,
      openingBalanceCents: acc.type === 'credit_card' ? -Math.abs(acc.balanceCents) : acc.balanceCents,
      openingDate: today,
      ...(acc.face ? { face: acc.face } : {}),
      ...(acc.type === 'savings' ? { interest: { rateBps: acc.rateBps ?? 0, kind: acc.rateKind ?? 'apy', compounding: 'monthly' } } : {}),
      ...(acc.type === 'credit_card'
        ? { card: { monthlyFeeCents: acc.monthlyFeeCents ?? 0, statementDay: statementDayFor(acc.dueDay ?? 22), dueDay: acc.dueDay ?? 22 } }
        : {}),
    });
    if (!byType.has(acc.type)) byType.set(acc.type, created);
  }
  const deposit = (byType.get('chequing') ?? byType.get('cash') ?? [...byType.values()][0])!;

  let mainIncomeId: Id | undefined;
  for (const inc of a.incomes) {
    const item = await createRecurring(ctx, {
      name: inc.name,
      kind: 'income',
      ...(inc.range ? { range: inc.range } : { amountCents: inc.amountCents ?? 0 }),
      freq: inc.freq,
      nextDate: inc.nextDate,
      accountIds: [deposit.id],
      ...(inc.freq === 'irregular' ? { irregularMonthlyCents: inc.range?.minCents ?? inc.amountCents ?? 0 } : {}),
    });
    mainIncomeId ??= item.id;
  }
  for (const b of a.bills) {
    const ids = (b.payFrom ?? []).map((t) => byType.get(t)?.id).filter((x): x is Id => !!x);
    const accountIds = ids.length ? ids : [deposit.id];
    // The real day is kept (29–31 → last day of shorter months).
    const schedule = { freq: 'monthly' as const, day: b.day };
    await createRecurring(ctx, {
      name: b.name,
      kind: b.kind,
      amountCents: b.amountCents,
      freq: 'monthly',
      schedule,
      nextDate: nextOccurrence({ schedule, startDate: today }, today) ?? today,
      accountIds,
      merchant: b.name,
      categoryId: categoryId('bills'),
    });
  }
  const goalIds = new Map<Id, Id>();
  for (const [k, g] of a.goals.entries()) {
    const created = await createGoal(ctx, {
      name: g.name,
      targetCents: g.targetCents ?? 0,
      ...(g.targetDate ? { targetDate: g.targetDate } : {}),
      ...((byType.get('savings') ?? byType.get('investing')) ? { accountId: (byType.get('savings') ?? byType.get('investing'))!.id } : {}),
    });
    goalIds.set(goalTempId(k), created.id);
  }
  const mapGoals = <T,>(r: Record<Id, T>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [goalIds.get(k) ?? k, v]));

  const period: PeriodConfig = a.periodAlignment === 'payday' && mainIncomeId ? { kind: 'payday', recurringId: mainIncomeId } : { kind: 'monthly', startDay: 1 };
  const schedule = mainIncomeId && period.kind === 'payday' ? (await ctx.repos.recurring.get(mainIncomeId))?.schedule : undefined;
  const current = periodFor(period, today, schedule);
  const existing = await getPlan(ctx);
  await savePlan(
    ctx,
    { ...existing, period, startDate: current.start, templateAllocations: plan.allocations, goalContributions: mapGoals(plan.goalContributions), reasons: mapGoals(plan.reasons) },
    { source: 'onboarding', periodDays: periodLength(current) },
  );
  const habits = Object.fromEntries(Object.entries(a.habitsWeekly).map(([k, v]) => [categoryId(k), v!]));
  await ctx.repos.settings.update({ onboardedAt: ctx.clock.now().toISOString(), habitWeeklyCents: habits, ...(a.name ? { userName: a.name } : {}), lastOpenedDate: today, onboarding: undefined });
  await logEvent(ctx, 'onboarding_complete', { accounts: answers.length, incomes: a.incomes.length, bills: a.bills.length, goals: a.goals.length });
  emit('onboardingComplete', { accounts: answers.length, goals: a.goals.length });
}
