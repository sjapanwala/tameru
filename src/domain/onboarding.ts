// Onboarding as a short conversation: one question per screen, every one skippable
// with a sensible default. Pure state machine; the UI renders the current step.

import { addDays, dayOfWeek } from './dates';
import { categoryId } from './defaults';
import type { GeneratorInput } from './planGenerator';
import { perMonth } from './recurrence';
import type { CardFace, Cents, Frequency, LocalDate } from './types';

export type AccountChoice = 'chequing' | 'savings' | 'credit_card' | 'investing' | 'cash';

export interface IncomeAnswer {
  name: string;
  freq: Frequency;
  amountCents?: Cents; // fixed
  range?: { minCents: Cents; maxCents: Cents }; // "it varies"
  nextDate: LocalDate;
}

export interface AccountAnswer {
  type: AccountChoice;
  name: string;
  balanceCents: Cents; // cards: amount owing as a positive number
  rateBps?: number; // savings
  rateKind?: 'apy' | 'apr';
  monthlyFeeCents?: Cents; // cards
  dueDay?: number; // cards
  face?: CardFace; // card art + last four digits
}

export interface BillAnswer {
  name: string;
  amountCents: Cents;
  day: number; // day of month
  kind: 'bill' | 'subscription';
  payFrom?: AccountChoice[]; // assigned accounts/cards; first is default
}

export interface GoalAnswer {
  name: string;
  targetCents?: Cents;
  targetDate?: LocalDate;
}

export type HabitKey = 'groceries' | 'eating_out' | 'transport' | 'fun' | 'personal';

export interface OnboardingAnswers {
  incomes: IncomeAnswer[];
  accountTypes: AccountChoice[];
  accounts: AccountAnswer[];
  bills: BillAnswer[];
  habitsWeekly: Partial<Record<HabitKey, Cents>>; // missing = skipped
  goals: GoalAnswer[];
  periodAlignment: 'month' | 'payday';
  name?: string;
}

export type StepId =
  | { id: 'welcome' }
  | { id: 'income' }
  | { id: 'more_income' }
  | { id: 'account_types' }
  | { id: 'account_detail'; type: AccountChoice }
  | { id: 'bills' }
  | { id: 'habit'; key: HabitKey }
  | { id: 'goals' }
  | { id: 'period' }
  | { id: 'review' };

export const HABIT_KEYS: HabitKey[] = ['groceries', 'eating_out', 'transport', 'fun', 'personal'];

/** Quick-pick ranges per habit question (weekly cents); the midpoint is used. */
export const HABIT_PICKS: Record<HabitKey, { lo: Cents; hi: Cents }[]> = {
  groceries: [{ lo: 0, hi: 3000 }, { lo: 3000, hi: 6000 }, { lo: 6000, hi: 10000 }, { lo: 10000, hi: 16000 }],
  eating_out: [{ lo: 0, hi: 1000 }, { lo: 1000, hi: 3000 }, { lo: 3000, hi: 6000 }, { lo: 6000, hi: 10000 }],
  transport: [{ lo: 0, hi: 1000 }, { lo: 1000, hi: 2500 }, { lo: 2500, hi: 5000 }, { lo: 5000, hi: 9000 }],
  fun: [{ lo: 0, hi: 1500 }, { lo: 1500, hi: 3000 }, { lo: 3000, hi: 6000 }, { lo: 6000, hi: 10000 }],
  personal: [{ lo: 0, hi: 1000 }, { lo: 1000, hi: 2000 }, { lo: 2000, hi: 4000 }, { lo: 4000, hi: 7000 }],
};

/** Used when a habit question is skipped: roughly a student/early-career week. */
export const DEFAULT_HABITS_WEEKLY: Record<HabitKey, Cents> = { groceries: 6000, eating_out: 2500, transport: 2000, fun: 2000, personal: 1000 };

export const pickMidpoint = (p: { lo: Cents; hi: Cents }): Cents => Math.round((p.lo + p.hi) / 2);

export interface OnboardingState {
  index: number;
  answers: OnboardingAnswers;
}

export const emptyAnswers = (): OnboardingAnswers => ({
  incomes: [],
  accountTypes: [],
  accounts: [],
  bills: [],
  habitsWeekly: {},
  goals: [],
  periodAlignment: 'month',
});

export const initialState = (): OnboardingState => ({ index: 0, answers: emptyAnswers() });

/** The step list depends on answers (one detail question per chosen account type). */
export function steps(a: OnboardingAnswers): StepId[] {
  const types = a.accountTypes.length ? a.accountTypes : (['chequing'] as AccountChoice[]);
  return [
    { id: 'welcome' },
    { id: 'income' },
    { id: 'more_income' },
    { id: 'account_types' },
    ...types.map((type) => ({ id: 'account_detail' as const, type })),
    { id: 'bills' },
    ...HABIT_KEYS.map((key) => ({ id: 'habit' as const, key })),
    { id: 'goals' },
    { id: 'period' },
    { id: 'review' },
  ];
}

export const currentStep = (s: OnboardingState): StepId => steps(s.answers)[Math.min(s.index, steps(s.answers).length - 1)]!;

export type Answer =
  | { step: 'welcome'; name: string }
  | { step: 'income'; income: IncomeAnswer }
  | { step: 'more_income'; income?: IncomeAnswer } // undefined = "no, that's all"
  | { step: 'account_types'; types: AccountChoice[] }
  | { step: 'account_detail'; account: AccountAnswer }
  | { step: 'bills'; bills: BillAnswer[] }
  | { step: 'habit'; key: HabitKey; weeklyCents: Cents }
  | { step: 'goals'; goals: GoalAnswer[] }
  | { step: 'period'; alignment: 'month' | 'payday' }
  | { step: 'review' };

/** Record an answer and move to the next step. */
export function answer(s: OnboardingState, ans: Answer): OnboardingState {
  const a = { ...s.answers };
  switch (ans.step) {
    case 'welcome':
      if (!isFullName(ans.name)) return s; // the full name is required
      a.name = ans.name!.trim().replace(/\s+/g, ' ');
      break;
    case 'income':
      a.incomes = [ans.income, ...a.incomes.slice(1)];
      break;
    case 'more_income':
      if (ans.income) {
        a.incomes = [...a.incomes, ans.income];
        return { index: s.index, answers: a }; // ask again: "anything else?"
      }
      break;
    case 'account_types':
      a.accountTypes = ans.types.length ? [...new Set(ans.types)] : ['chequing'];
      a.accounts = a.accounts.filter((x) => a.accountTypes.includes(x.type));
      break;
    case 'account_detail':
      a.accounts = [...a.accounts.filter((x) => x.type !== ans.account.type), ans.account];
      break;
    case 'bills':
      a.bills = ans.bills.filter((b) => b.amountCents > 0);
      break;
    case 'habit':
      a.habitsWeekly = { ...a.habitsWeekly, [ans.key]: ans.weeklyCents };
      break;
    case 'goals':
      a.goals = ans.goals.filter((g) => g.name.trim()).slice(0, 3);
      break;
    case 'period':
      a.periodAlignment = ans.alignment;
      break;
  }
  return { index: s.index + 1, answers: a };
}

/** Skip the current step, keeping its default. */
export function skip(s: OnboardingState): OnboardingState {
  const step = currentStep(s);
  if (step.id === 'welcome' && !isFullName(s.answers.name)) return s; // the name can't be skipped
  const a = { ...s.answers };
  if (step.id === 'account_detail' && !a.accounts.some((x) => x.type === step.type)) a.accounts = [...a.accounts, defaultAccount(step.type)];
  if (step.id === 'habit') {
    const h = { ...a.habitsWeekly };
    delete h[step.key];
    a.habitsWeekly = h;
  }
  return { index: s.index + 1, answers: a };
}

export const back = (s: OnboardingState): OnboardingState => ({ ...s, index: Math.max(0, s.index - 1) });

export const isComplete = (s: OnboardingState): boolean => s.index >= steps(s.answers).length;

export const ACCOUNT_LABEL_DEFAULTS: Record<AccountChoice, string> = {
  chequing: 'Chequing',
  savings: 'Savings',
  credit_card: 'Credit card',
  investing: 'Investing',
  cash: 'Cash',
};

export function defaultAccount(type: AccountChoice): AccountAnswer {
  return { type, name: ACCOUNT_LABEL_DEFAULTS[type], balanceCents: 0, ...(type === 'savings' ? { rateBps: 0, rateKind: 'apy' as const } : {}) };
}

/** A first and last name: at least two words that each contain a letter. */
export const isFullName = (name: string | undefined): boolean =>
  (name ?? '').trim().split(/\s+/).filter((w) => /\p{L}/u.test(w)).length >= 2;

/** "Saaim Japanwala" → "SJ"; one word → its first letter; nothing usable → "". */
export function initials(name: string | undefined): string {
  const words = (name ?? '').replace(/[^\p{L}\p{N} '-]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  const first = words[0]![0] ?? '';
  const last = words.length > 1 ? (words[words.length - 1]![0] ?? '') : '';
  return (first + last).toLocaleUpperCase();
}

/** Sensible "next payday" default for a frequency. */
export function defaultNextPayday(freq: Frequency, today: LocalDate): LocalDate {
  if (freq === 'weekly' || freq === 'biweekly') {
    let d = addDays(today, 1);
    while (dayOfWeek(d) !== 5) d = addDays(d, 1);
    return d;
  }
  const day = Number(today.slice(8));
  if (freq === 'semimonthly' && day < 15) return `${today.slice(0, 8)}15`;
  const [y, m] = today.split('-').map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
}

// ---------- answers → plan generator input ----------


/** Irregular income is planned at 75% of the stated monthly estimate. */
export const IRREGULAR_PLANNING_SHARE = 0.75;

export function incomeMonthlyConservative(inc: IncomeAnswer): Cents {
  const per = inc.range ? inc.range.minCents : (inc.amountCents ?? 0);
  if (inc.freq === 'irregular') return Math.round(per * IRREGULAR_PLANNING_SHARE);
  return Math.round(per * perMonth(inc.freq));
}

export const goalTempId = (index: number): string => `new_goal_${index}`;

export function toGeneratorInput(a: OnboardingAnswers, today: LocalDate): GeneratorInput {
  const habitsWeekly: GeneratorInput['habitsWeekly'] = {};
  const defaults: GeneratorInput['defaultHabitsWeekly'] = {};
  for (const k of HABIT_KEYS) {
    habitsWeekly[categoryId(k)] = a.habitsWeekly[k];
    defaults[categoryId(k)] = DEFAULT_HABITS_WEEKLY[k];
  }
  return {
    today,
    incomeMonthlyCents: a.incomes.reduce((s, i) => s + incomeMonthlyConservative(i), 0),
    billsMonthlyCents: a.bills.reduce((s, b) => s + b.amountCents, 0),
    billCount: a.bills.length,
    billsCategoryId: categoryId('bills'),
    fundCategoryId: categoryId('irregular'),
    habitsWeekly,
    defaultHabitsWeekly: defaults,
    goals: a.goals.map((g, k) => ({ id: goalTempId(k), progressCents: 0, ...(g.targetCents ? { targetCents: g.targetCents } : {}), ...(g.targetDate ? { targetDate: g.targetDate } : {}) })),
  };
}
