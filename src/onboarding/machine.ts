// Onboarding as a typed state machine. Pure: the UI asks "what's next?" and
// persists the answer (settings.onboarding), so quitting mid-way resumes on
// the same screen. Nothing here reads or writes the database.

import type { GoalKind } from '../domain/types';

export type AccountKind = 'chequing' | 'savings' | 'cash' | 'investing';

export const CHAPTERS = ['hello', 'accounts', 'cards', 'payday', 'bills', 'reveal'] as const;
export type Chapter = (typeof CHAPTERS)[number];

export const CHAPTER_TITLES: Record<Chapter, string> = {
  hello: 'Hello',
  accounts: 'Where your money lives',
  cards: 'Credit cards',
  payday: 'Payday',
  bills: 'Regular bills',
  reveal: 'The reveal',
};

export type StepId =
  | 'hello.intro'
  | 'hello.name'
  | 'hello.currency'
  | 'accounts.pick'
  | 'accounts.name'
  | 'accounts.balance'
  | 'accounts.rate'
  | 'accounts.contributed'
  | 'accounts.fee'
  | 'cards.ask'
  | 'cards.name'
  | 'cards.balance'
  | 'cards.days'
  | 'cards.extras'
  | 'cards.more'
  | 'payday.schedule'
  | 'payday.amount'
  | 'payday.date'
  | 'payday.account'
  | 'payday.done'
  | 'bills.pick'
  | 'reveal'
  | 'dreams.pick'
  | 'dreams.goal'
  | 'dreams.plan'
  | 'dreams.budgets';

export interface OnboardingState {
  v: 1;
  /** setup = chapters 0–5; dreams = the optional goals-and-plan stage. */
  stage: 'setup' | 'dreams' | 'done';
  step: StepId;
  /** Account kinds picked in chapter 1, in the order their screens are shown. */
  accountKinds: AccountKind[];
  accountIndex: number;
  /** Card / income currently being edited. */
  cardId: string | null;
  incomeId: string | null;
  /** The income being edited varies month to month (no schedule or date to ask for). */
  incomeVaries: boolean;
  goalKinds: GoalKind[];
  goalIndex: number;
  completed: Chapter[];
  /** Confetti moments already fired, so going back never repeats them. */
  celebrated: { account: boolean; payday: boolean; reveal: boolean };
}

/** Facts about saved data that change the route. */
export interface Facts {
  /** How many accounts money could be deposited into. */
  depositAccounts: number;
}

export const INITIAL_STATE: OnboardingState = {
  v: 1,
  stage: 'setup',
  step: 'hello.intro',
  accountKinds: [],
  accountIndex: 0,
  cardId: null,
  incomeId: null,
  incomeVaries: false,
  goalKinds: [],
  goalIndex: 0,
  completed: [],
  celebrated: { account: false, payday: false, reveal: false },
};

/** Start of the optional stage, entered from the reveal, Home or Plan. */
export function startDreams(previous?: OnboardingState | null): OnboardingState {
  return {
    ...(previous ?? INITIAL_STATE),
    stage: 'dreams',
    step: 'dreams.pick',
    goalKinds: [],
    goalIndex: 0,
    completed: [...CHAPTERS],
  };
}

export const chapterOf = (step: StepId): Chapter | 'dreams' =>
  step === 'reveal' ? 'reveal' : (step.split('.')[0] as Chapter | 'dreams');

/** Restore saved state, falling back to the start if it's missing or from another version. */
export function parseState(saved: unknown): OnboardingState {
  if (typeof saved !== 'object' || saved === null) return INITIAL_STATE;
  const state = saved as Partial<OnboardingState>;
  if (state.v !== 1 || typeof state.step !== 'string') return INITIAL_STATE;
  return { ...INITIAL_STATE, ...state, celebrated: { ...INITIAL_STATE.celebrated, ...state.celebrated } };
}

const complete = (state: OnboardingState, chapter: Chapter): Chapter[] =>
  state.completed.includes(chapter) ? state.completed : [...state.completed, chapter];

const currentKind = (state: OnboardingState) => state.accountKinds[state.accountIndex];

/** Where "Continue" (or "Skip") goes from here. */
export function next(state: OnboardingState, facts: Facts): OnboardingState {
  const to = (step: StepId, changes: Partial<OnboardingState> = {}): OnboardingState => ({
    ...state,
    step,
    ...changes,
  });

  switch (state.step) {
    case 'hello.intro':
      return to('hello.name');
    case 'hello.name':
      return to('hello.currency');
    case 'hello.currency':
      return to('accounts.pick', { completed: complete(state, 'hello') });

    case 'accounts.pick':
      return state.accountKinds.length === 0
        ? to('cards.ask', { completed: complete(state, 'accounts') })
        : to('accounts.name', { accountIndex: 0 });
    case 'accounts.name':
      return to('accounts.balance');
    case 'accounts.balance':
      return to(
        currentKind(state) === 'savings'
          ? 'accounts.rate'
          : currentKind(state) === 'investing'
            ? 'accounts.contributed'
            : 'accounts.fee',
      );
    case 'accounts.rate':
    case 'accounts.contributed':
      return to('accounts.fee');
    case 'accounts.fee':
      return state.accountIndex + 1 < state.accountKinds.length
        ? to('accounts.name', { accountIndex: state.accountIndex + 1 })
        : to('cards.ask', { completed: complete(state, 'accounts') });

    case 'cards.ask':
      // "Add a card" is a different action (see startCard); Continue means no cards.
      return to('payday.schedule', { cardId: null, completed: complete(state, 'cards') });
    case 'cards.name':
      return to('cards.balance');
    case 'cards.balance':
      return to('cards.days');
    case 'cards.days':
      return to('cards.extras');
    case 'cards.extras':
      return to('cards.more');
    case 'cards.more':
      return to('payday.schedule', { cardId: null, completed: complete(state, 'cards') });

    case 'payday.schedule':
      return to('payday.amount');
    case 'payday.amount':
      if (!state.incomeVaries) return to('payday.date');
      return to(facts.depositAccounts > 1 ? 'payday.account' : 'payday.done');
    case 'payday.date':
      return to(facts.depositAccounts > 1 ? 'payday.account' : 'payday.done');
    case 'payday.account':
      return to('payday.done');
    case 'payday.done':
      return to('bills.pick', { incomeId: null, completed: complete(state, 'payday') });

    case 'bills.pick':
      return to('reveal', { completed: complete(state, 'bills') });
    case 'reveal':
      return { ...state, stage: 'done', completed: complete(state, 'reveal') };

    case 'dreams.pick':
      return state.goalKinds.length === 0 ? to('dreams.plan') : to('dreams.goal', { goalIndex: 0 });
    case 'dreams.goal':
      return state.goalIndex + 1 < state.goalKinds.length
        ? to('dreams.goal', { goalIndex: state.goalIndex + 1 })
        : to('dreams.plan');
    case 'dreams.plan':
      return to('dreams.budgets');
    case 'dreams.budgets':
      return { ...state, stage: 'done' };
  }
}

/** Where "Back" goes. Null on the very first screen of a stage. */
export function back(state: OnboardingState, facts: Facts): OnboardingState | null {
  const to = (step: StepId, changes: Partial<OnboardingState> = {}): OnboardingState => ({
    ...state,
    step,
    ...changes,
  });
  const lastAccountStep = (index: number): OnboardingState =>
    to('accounts.fee', { accountIndex: index });

  switch (state.step) {
    case 'hello.intro':
      return null;
    case 'hello.name':
      return to('hello.intro');
    case 'hello.currency':
      return to('hello.name');

    case 'accounts.pick':
      return to('hello.currency');
    case 'accounts.name':
      return state.accountIndex === 0 ? to('accounts.pick') : lastAccountStep(state.accountIndex - 1);
    case 'accounts.balance':
      return to('accounts.name');
    case 'accounts.rate':
    case 'accounts.contributed':
      return to('accounts.balance');
    case 'accounts.fee':
      return to(
        currentKind(state) === 'savings'
          ? 'accounts.rate'
          : currentKind(state) === 'investing'
            ? 'accounts.contributed'
            : 'accounts.balance',
      );

    case 'cards.ask':
      return state.accountKinds.length === 0
        ? to('accounts.pick')
        : lastAccountStep(state.accountKinds.length - 1);
    case 'cards.name':
      return to('cards.ask');
    case 'cards.balance':
      return to('cards.name');
    case 'cards.days':
      return to('cards.balance');
    case 'cards.extras':
      return to('cards.days');
    case 'cards.more':
      return to('cards.extras');

    case 'payday.schedule':
      return to('cards.ask', { incomeId: null });
    case 'payday.amount':
      return to('payday.schedule');
    case 'payday.date':
      return to('payday.amount');
    case 'payday.account':
      return to(state.incomeVaries ? 'payday.amount' : 'payday.date');
    case 'payday.done':
      if (facts.depositAccounts > 1) return to('payday.account');
      return to(state.incomeVaries ? 'payday.amount' : 'payday.date');

    case 'bills.pick':
      return to('payday.schedule', { incomeId: null });
    case 'reveal':
      return to('bills.pick');

    case 'dreams.pick':
      return null;
    case 'dreams.goal':
      return state.goalIndex === 0
        ? to('dreams.pick')
        : to('dreams.goal', { goalIndex: state.goalIndex - 1 });
    case 'dreams.plan':
      return state.goalKinds.length === 0
        ? to('dreams.pick')
        : to('dreams.goal', { goalIndex: state.goalKinds.length - 1 });
    case 'dreams.budgets':
      return to('dreams.plan');
  }
}

/** Begin adding (or editing) a card. */
export const startCard = (state: OnboardingState, cardId: string): OnboardingState => ({
  ...state,
  step: 'cards.name',
  cardId,
});

/** Begin adding (or editing) an income source. */
export const startIncome = (
  state: OnboardingState,
  incomeId: string,
  varies: boolean,
): OnboardingState => ({ ...state, step: 'payday.amount', incomeId, incomeVaries: varies });

/** Jar level: finished chapters out of six. */
export const progress = (state: OnboardingState): number =>
  state.completed.length / CHAPTERS.length;
