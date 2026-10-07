import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import {
  finishOnboarding,
  listGoals,
  listRecurring,
  listTransactions,
  setSetting,
} from '../db/repo';
import { formatMoney, minorUnitDigits } from '../domain/money';
import { DreamsBudgets, DreamsGoal, DreamsPick, DreamsPlan } from '../onboarding/dreams';
import { FlowContext, type Flow } from '../onboarding/kit';
import {
  back as stepBack,
  next as stepNext,
  parseState,
  type Facts,
  type OnboardingState,
  type StepId,
} from '../onboarding/machine';
import {
  AccountBalance,
  AccountContributed,
  AccountFee,
  AccountName,
  AccountRate,
  AccountsPick,
  BillsPick,
  CardBalance,
  CardDays,
  CardExtras,
  CardMore,
  CardName,
  CardsAsk,
  HelloCurrency,
  HelloIntro,
  HelloName,
  isDeposit,
  PaydayAccount,
  PaydayAmount,
  PaydayDate,
  PaydayDone,
  PaydaySchedule,
  Reveal,
} from '../onboarding/setup';
import '../onboarding/onboarding.css';
import { useApp } from '../ui/context';

const STEPS: Record<StepId, () => ReactNode> = {
  'hello.intro': HelloIntro,
  'hello.name': HelloName,
  'hello.currency': HelloCurrency,
  'accounts.pick': AccountsPick,
  'accounts.name': AccountName,
  'accounts.balance': AccountBalance,
  'accounts.rate': AccountRate,
  'accounts.contributed': AccountContributed,
  'accounts.fee': AccountFee,
  'cards.ask': CardsAsk,
  'cards.name': CardName,
  'cards.balance': CardBalance,
  'cards.days': CardDays,
  'cards.extras': CardExtras,
  'cards.more': CardMore,
  'payday.schedule': PaydaySchedule,
  'payday.amount': PaydayAmount,
  'payday.date': PaydayDate,
  'payday.account': PaydayAccount,
  'payday.done': PaydayDone,
  'bills.pick': BillsPick,
  reveal: Reveal,
  'dreams.pick': DreamsPick,
  'dreams.goal': DreamsGoal,
  'dreams.plan': DreamsPlan,
  'dreams.budgets': DreamsBudgets,
};

// Cash has no monthly fee to ask about, so that screen is passed over in
// both directions.
const isCashFee = (state: OnboardingState) =>
  state.step === 'accounts.fee' && state.accountKinds[state.accountIndex] === 'cash';

function advance(state: OnboardingState, facts: Facts): OnboardingState {
  const forward = stepNext(state, facts);
  return isCashFee(forward) ? stepNext(forward, facts) : forward;
}

function retreat(state: OnboardingState, facts: Facts): OnboardingState | null {
  const previous = stepBack(state, facts);
  return previous && isCashFee(previous) ? stepBack(previous, facts) : previous;
}

export function Onboarding() {
  const { settings, accounts } = useApp();
  const recurring = useLiveQuery(listRecurring, []);
  const goals = useLiveQuery(listGoals, []);
  const transactions = useLiveQuery(() => listTransactions(), []);
  // Held locally so screens change at once; every move is also saved, so
  // quitting part-way resumes on the same screen.
  const [state, setState] = useState(() => parseState(settings.onboarding));

  const { currency } = settings;
  const facts = useMemo<Facts>(
    () => ({ depositAccounts: accounts.filter(isDeposit).length }),
    [accounts],
  );
  const money = useCallback((cents: number) => formatMoney(cents, currency), [currency]);

  const flow = useMemo<Flow | null>(() => {
    if (!recurring || !goals || !transactions) return null;

    const go = (to: OnboardingState) => {
      setState(to);
      void setSetting('onboarding', to);
    };
    const finish = async () => {
      setState({ ...state, stage: 'done' });
      if (state.stage === 'setup') await finishOnboarding();
      await setSetting('onboarding', null);
    };

    return {
      state,
      currency,
      decimals: minorUnitDigits(currency),
      accounts,
      recurring,
      goals,
      transactions,
      next: (changes) => {
        const forward = advance({ ...state, ...changes }, facts);
        if (forward.stage === 'done') void finish();
        else go(forward);
      },
      go,
      back: () => {
        const previous = retreat(state, facts);
        if (previous) go(previous);
      },
      canGoBack: retreat(state, facts) !== null,
      money,
    };
  }, [state, currency, accounts, recurring, goals, transactions, facts, money]);

  if (!flow || state.stage === 'done') return null;
  const Step = STEPS[state.step];

  return (
    <FlowContext.Provider value={flow}>
      {/* Keyed so each screen (and each account, card or goal) mounts fresh. */}
      <Step key={`${state.step}:${state.accountIndex}:${state.goalIndex}:${state.cardId}`} />
    </FlowContext.Provider>
  );
}
