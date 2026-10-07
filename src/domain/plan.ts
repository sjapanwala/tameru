// Rule-based plan engine. No AI, no network: every number here comes from a
// formula a person could check, and every recommendation says what it assumed.
//
// General budgeting guidance, not financial advice.

import { addDays, daysBetween } from './dates';
import { monthlyEquivalent } from './recurring';
import { isVariableSpend } from './safeToSpend';
import type { Account, Category, Goal, ISODate, Recurring, Transaction } from './types';

export const PLAN_DISCLAIMER = 'General budgeting guidance, not financial advice.';

export interface Recommendation {
  id: string;
  title: string;
  /** Plain-language explanation of the suggestion. */
  body: string;
  /** What the engine assumed to get there. */
  assumptions: string[];
  tone: 'info' | 'warning';
}

export interface GoalPlan {
  goalId: string;
  name: string;
  remainingCents: number;
  /** Whole months until the target date (at least 1); null without a date. */
  monthsRemaining: number | null;
  /** (target − saved) ÷ months remaining, rounded up; null without a date. */
  requiredMonthlyCents: number | null;
  contributionCents: number;
  /** True when the current contribution covers what's required. */
  onTrack: boolean;
}

export interface DebtItem {
  accountId: string;
  name: string;
  owedCents: number;
  aprPct: number | null;
}

export interface Plan {
  monthly: {
    incomeCents: number;
    billsCents: number;
    goalsCents: number;
    /** What's left for everyday spending. Negative when over-committed. */
    flexibleCents: number;
  };
  incomeVaries: boolean;
  emergencyFund: { months: 3 | 6; targetCents: number };
  goals: GoalPlan[];
  /** Cards with a balance, in the order to pay them down. */
  debtOrder: DebtItem[];
  feasible: boolean;
  /** How far goals overshoot income minus bills (0 when feasible). */
  shortfallCents: number;
  recommendations: Recommendation[];
}

export interface PlanInput {
  today: ISODate;
  recurring: readonly Recurring[];
  goals: readonly Goal[];
  accounts: readonly Account[];
  strategy: 'avalanche' | 'snowball';
  /** Formats cents for the explanations. */
  money: (cents: number) => string;
}

/** Whole months from today to a date, rounded up, never less than 1. */
export function monthsUntil(today: ISODate, date: ISODate): number {
  return Math.max(1, Math.ceil(daysBetween(today, date) / 30.4375));
}

/** (target − saved) ÷ months remaining, rounded up to a whole cent. */
export function requiredMonthly(
  goal: Pick<Goal, 'targetCents' | 'savedCents' | 'targetDate'>,
  today: ISODate,
): number | null {
  if (!goal.targetDate) return null;
  const remaining = Math.max(0, goal.targetCents - goal.savedCents);
  return Math.ceil(remaining / monthsUntil(today, goal.targetDate));
}

/**
 * Order to pay cards down. Avalanche: highest interest first (cheapest
 * overall). Snowball: smallest balance first (quickest wins).
 */
export function debtPayoffOrder(
  accounts: readonly Account[],
  strategy: 'avalanche' | 'snowball',
): DebtItem[] {
  const debts = accounts
    .filter((account) => account.type === 'credit' && account.startingBalanceCents < 0)
    .map((account) => ({
      accountId: account.id,
      name: account.name,
      owedCents: -account.startingBalanceCents,
      aprPct: account.aprPct ?? null,
    }));
  return debts.sort((a, b) =>
    strategy === 'avalanche'
      ? (b.aprPct ?? -1) - (a.aprPct ?? -1) || a.owedCents - b.owedCents
      : a.owedCents - b.owedCents || (b.aprPct ?? -1) - (a.aprPct ?? -1),
  );
}

export function buildPlan(input: PlanInput): Plan {
  const { today, recurring, goals, accounts, strategy, money } = input;
  const incomes = recurring.filter((item) => item.kind === 'income');
  const incomeCents = incomes.reduce((sum, item) => sum + monthlyEquivalent(item), 0);
  const billsCents = recurring
    .filter((item) => item.kind === 'bill')
    .reduce((sum, item) => sum + monthlyEquivalent(item), 0);
  const goalsCents = goals.reduce((sum, goal) => sum + goal.monthlyContributionCents, 0);
  const flexibleCents = incomeCents - billsCents - goalsCents;
  const incomeVaries = incomes.some((item) => item.variable);

  const months = incomeVaries ? 6 : 3;
  const emergencyFund = { months, targetCents: billsCents * months } as Plan['emergencyFund'];

  const goalPlans: GoalPlan[] = goals.map((goal) => {
    const required = requiredMonthly(goal, today);
    return {
      goalId: goal.id,
      name: goal.name,
      remainingCents: Math.max(0, goal.targetCents - goal.savedCents),
      monthsRemaining: goal.targetDate ? monthsUntil(today, goal.targetDate) : null,
      requiredMonthlyCents: required,
      contributionCents: goal.monthlyContributionCents,
      onTrack: required === null || goal.monthlyContributionCents >= required,
    };
  });

  const debtOrder = debtPayoffOrder(accounts, strategy);
  const shortfallCents = Math.max(0, goalsCents - (incomeCents - billsCents));
  const feasible = shortfallCents === 0;

  const recommendations: Recommendation[] = [];
  const averaged = 'Weekly and fortnightly amounts are averaged over a year (52 or 26 a year ÷ 12).';

  if (incomeCents === 0) {
    recommendations.push({
      id: 'no-income',
      title: 'Add your income first',
      body: "Without a payday there's nothing to plan around. Add one and the rest fills in.",
      assumptions: [],
      tone: 'warning',
    });
  } else {
    recommendations.push({
      id: 'allocation',
      title: `${money(Math.max(0, flexibleCents))} a month is yours to spend`,
      body: `Of ${money(incomeCents)} coming in each month, ${money(billsCents)} is already spoken for by bills and ${money(goalsCents)} goes to goals. The rest is flexible.`,
      assumptions: [
        averaged,
        incomeVaries
          ? 'Your income varies, so this uses the cautious monthly estimate you gave.'
          : 'Income arrives on schedule and bills stay the same.',
      ],
      tone: 'info',
    });
  }

  if (!feasible) {
    recommendations.push({
      id: 'over-committed',
      title: `Goals are ${money(shortfallCents)} a month more than you have`,
      body: `After bills there's ${money(Math.max(0, incomeCents - billsCents))} a month, but your goals ask for ${money(goalsCents)}. Push a target date back, lower a target, or trim a bill.`,
      assumptions: [averaged],
      tone: 'warning',
    });
  }

  if (billsCents > 0) {
    const emergency = goals.find((goal) => goal.kind === 'emergency');
    recommendations.push({
      id: 'emergency-fund',
      title: `Aim for ${money(emergencyFund.targetCents)} in an emergency fund`,
      body: incomeVaries
        ? `That's 6 months of bills. Income that moves around needs a deeper cushion, because a thin month and a surprise can land together.`
        : `That's 3 months of bills: enough to ride out a gap between jobs or a big repair without borrowing.`,
      assumptions: [
        `"Essentials" means your recurring bills (${money(billsCents)} a month). Groceries and other everyday spending aren't included.`,
        emergency
          ? `You've set aside ${money(emergency.savedCents)} so far.`
          : "You don't have an emergency fund goal yet.",
      ],
      tone: 'info',
    });
  }

  for (const goal of goalPlans) {
    if (goal.requiredMonthlyCents === null || goal.onTrack || goal.remainingCents === 0) continue;
    recommendations.push({
      id: `goal-${goal.goalId}`,
      title: `${goal.name} needs ${money(goal.requiredMonthlyCents)} a month`,
      body: `You're setting aside ${money(goal.contributionCents)}. To have ${money(goal.remainingCents)} more in ${goal.monthsRemaining} month${goal.monthsRemaining === 1 ? '' : 's'}, it takes ${money(goal.requiredMonthlyCents)}.`,
      assumptions: ['Amount still needed ÷ whole months left, rounded up. No interest or returns counted.'],
      tone: 'warning',
    });
  }

  if (debtOrder.length > 0) {
    const first = debtOrder[0]!;
    const many = debtOrder.length > 1;
    recommendations.push({
      id: 'debt-order',
      title: many ? `Pay down ${first.name} first` : `Keep chipping at ${first.name}`,
      body: many
        ? strategy === 'avalanche'
          ? `Highest interest first (${debtOrder.map((d) => d.name).join(', then ')}). Pay the minimum on the others and throw everything extra at the top one: it costs the least overall.`
          : `Smallest balance first (${debtOrder.map((d) => d.name).join(', then ')}). Clearing a card quickly keeps you going; it can cost a little more interest than highest-rate-first.`
        : `You owe ${money(first.owedCents)}${first.aprPct ? ` at ${first.aprPct}%` : ''}. Anything above the minimum goes straight at the balance.`,
      assumptions: [
        'Uses the balances and rates you entered; cards without a rate are treated as the lowest.',
        'Always pay at least the minimum on every card.',
      ],
      tone: 'info',
    });
  }

  return {
    monthly: { incomeCents, billsCents, goalsCents, flexibleCents },
    incomeVaries,
    emergencyFund,
    goals: goalPlans,
    debtOrder,
    feasible,
    shortfallCents,
    recommendations,
  };
}

export interface BudgetSuggestion {
  categoryId: string;
  name: string;
  monthlyCents: number;
  /** Share of recent categorised spending, 0–1. */
  share: number;
}

const TRAILING_DAYS = 90;
const MIN_HISTORY_DAYS = 21;
const MIN_TRANSACTIONS = 8;

/**
 * Split the flexible amount across categories in proportion to how the
 * last 90 days were actually spent. Returns nothing until there are at
 * least three weeks and a handful of categorised expenses to go on.
 */
export function suggestBudgets(input: {
  today: ISODate;
  flexibleCents: number;
  transactions: readonly Pick<Transaction, 'date' | 'amountCents' | 'categoryId' | 'recurringId'>[];
  categories: readonly Pick<Category, 'id' | 'name'>[];
  /** Round suggestions to this many cents (default 500 = $5). */
  roundTo?: number;
}): BudgetSuggestion[] {
  const { today, flexibleCents, categories, roundTo = 500 } = input;
  if (flexibleCents <= 0) return [];
  const from = addDays(today, -(TRAILING_DAYS - 1));
  const recent = input.transactions.filter(
    (tx) => tx.date >= from && tx.date <= today && isVariableSpend(tx) && tx.categoryId,
  );
  if (recent.length < MIN_TRANSACTIONS) return [];
  const earliest = recent.reduce((min, tx) => (tx.date < min ? tx.date : min), today);
  if (daysBetween(earliest, today) + 1 < MIN_HISTORY_DAYS) return [];

  const spent = new Map<string, number>();
  let total = 0;
  for (const tx of recent) {
    spent.set(tx.categoryId!, (spent.get(tx.categoryId!) ?? 0) - tx.amountCents);
    total -= tx.amountCents;
  }
  return categories
    .filter((category) => (spent.get(category.id) ?? 0) > 0)
    .map((category) => {
      const share = spent.get(category.id)! / total;
      return {
        categoryId: category.id,
        name: category.name,
        share,
        monthlyCents: Math.max(roundTo, Math.round((flexibleCents * share) / roundTo) * roundTo),
      };
    });
}
