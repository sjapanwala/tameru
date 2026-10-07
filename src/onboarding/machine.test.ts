import { describe, expect, it } from 'vitest';
import {
  back,
  chapterOf,
  INITIAL_STATE,
  next,
  parseState,
  progress,
  startCard,
  startDreams,
  startIncome,
  type Facts,
  type OnboardingState,
  type StepId,
} from './machine';

const one: Facts = { depositAccounts: 1 };
const two: Facts = { depositAccounts: 2 };

/** Follow Continue from a state, collecting step ids until the stage changes. */
function walk(start: OnboardingState, facts: Facts, limit = 60): StepId[] {
  const steps: StepId[] = [];
  let state = start;
  while (state.stage === start.stage && steps.length < limit) {
    steps.push(state.step);
    state = next(state, facts);
  }
  return steps;
}

describe('setup route', () => {
  it('walks the shortest path when everything is skipped', () => {
    expect(walk(INITIAL_STATE, one)).toEqual([
      'hello.intro',
      'hello.name',
      'hello.currency',
      'accounts.pick',
      'cards.ask',
      'payday.schedule',
      'payday.amount',
      'payday.date',
      'payday.done',
      'bills.pick',
      'reveal',
    ]);
  });

  it('visits each chosen account, with the questions that kind needs', () => {
    const state = { ...INITIAL_STATE, step: 'accounts.pick' as const, accountKinds: ['chequing', 'savings', 'investing'] as OnboardingState['accountKinds'] };
    const steps = walk(state, two).slice(0, 13);
    expect(steps).toEqual([
      'accounts.pick',
      'accounts.name',
      'accounts.balance',
      'accounts.fee',
      'accounts.name',
      'accounts.balance',
      'accounts.rate',
      'accounts.fee',
      'accounts.name',
      'accounts.balance',
      'accounts.contributed',
      'accounts.fee',
      'cards.ask',
    ]);
  });

  it('asks which account only when there is a choice', () => {
    const at = (step: StepId, varies = false) => ({ ...INITIAL_STATE, step, incomeVaries: varies });
    expect(next(at('payday.date'), one).step).toBe('payday.done');
    expect(next(at('payday.date'), two).step).toBe('payday.account');
  });

  it('skips the date for income that varies', () => {
    const state = startIncome({ ...INITIAL_STATE, step: 'payday.schedule' }, 'inc', true);
    expect(state.step).toBe('payday.amount');
    expect(next(state, one).step).toBe('payday.done');
    expect(next(state, two).step).toBe('payday.account');
  });

  it('runs the card screens once a card is started, then moves on', () => {
    const state = startCard({ ...INITIAL_STATE, step: 'cards.ask' }, 'card-1');
    expect(walk(state, one).slice(0, 6)).toEqual([
      'cards.name',
      'cards.balance',
      'cards.days',
      'cards.extras',
      'cards.more',
      'payday.schedule',
    ]);
    expect(next({ ...state, step: 'cards.more' }, one).cardId).toBeNull();
  });

  it('marks chapters complete as they finish, once each', () => {
    let state: OnboardingState = INITIAL_STATE;
    const seen: number[] = [];
    while (state.stage === 'setup') {
      seen.push(state.completed.length);
      state = next(state, one);
    }
    expect(state.completed).toEqual(['hello', 'accounts', 'cards', 'payday', 'bills', 'reveal']);
    expect(progress(state)).toBe(1);
    expect(seen).toEqual([...seen].sort((a, b) => a - b));

    // Going round again doesn't double-count.
    const again = next({ ...state, stage: 'setup', step: 'hello.currency' }, one);
    expect(again.completed).toHaveLength(6);
  });

  it('ends the stage after the reveal', () => {
    expect(next({ ...INITIAL_STATE, step: 'reveal' }, one).stage).toBe('done');
  });
});

describe('back', () => {
  it('has nowhere to go from the first screen', () => {
    expect(back(INITIAL_STATE, one)).toBeNull();
    expect(back(startDreams(), one)).toBeNull();
  });

  it('retraces every forward step', () => {
    const routes: [OnboardingState, Facts][] = [
      [INITIAL_STATE, one],
      [{ ...INITIAL_STATE, accountKinds: ['cash', 'savings', 'investing', 'chequing'] }, two],
      [{ ...INITIAL_STATE, accountKinds: ['chequing'], incomeVaries: true }, two],
      [{ ...startDreams(), goalKinds: ['emergency', 'trip'] }, one],
      [startDreams(), one],
    ];
    for (const [start, facts] of routes) {
      let state = start;
      for (let i = 0; i < 60 && state.stage === start.stage; i++) {
        const forward = next(state, facts);
        if (forward.stage !== start.stage) break;
        // Card and income sub-flows are entered by an action, not by Continue.
        const viaAction = ['cards.ask', 'cards.more', 'payday.done'].includes(state.step);
        if (!viaAction) expect(back(forward, facts)?.step).toBe(state.step);
        state = forward;
      }
    }
  });

  it('returns to the last account from the cards chapter', () => {
    const state = { ...INITIAL_STATE, step: 'cards.ask' as const, accountKinds: ['chequing', 'savings'] as OnboardingState['accountKinds'], accountIndex: 1 };
    expect(back(state, one)).toMatchObject({ step: 'accounts.fee', accountIndex: 1 });
    expect(back({ ...state, step: 'accounts.name' }, one)).toMatchObject({ step: 'accounts.fee', accountIndex: 0 });
  });
});

describe('dreams stage', () => {
  it('walks each chosen goal, then the plan and budgets', () => {
    const state = { ...startDreams(), goalKinds: ['emergency', 'trip'] as OnboardingState['goalKinds'] };
    expect(walk(state, one)).toEqual(['dreams.pick', 'dreams.goal', 'dreams.goal', 'dreams.plan', 'dreams.budgets']);
  });

  it('goes straight to the plan with no goals', () => {
    expect(walk(startDreams(), one)).toEqual(['dreams.pick', 'dreams.plan', 'dreams.budgets']);
  });

  it('keeps setup progress when started later', () => {
    const state = startDreams({ ...INITIAL_STATE, stage: 'done', completed: ['hello'] });
    expect(state).toMatchObject({ stage: 'dreams', step: 'dreams.pick' });
    expect(progress(state)).toBe(1);
  });
});

describe('resuming', () => {
  it('restores a saved state', () => {
    const saved = JSON.parse(JSON.stringify({ ...INITIAL_STATE, step: 'payday.date', incomeId: 'x' }));
    expect(parseState(saved)).toMatchObject({ step: 'payday.date', incomeId: 'x' });
  });

  it('starts over from anything unreadable', () => {
    expect(parseState(null)).toEqual(INITIAL_STATE);
    expect(parseState({ v: 99, step: 'reveal' })).toEqual(INITIAL_STATE);
    expect(parseState('nonsense')).toEqual(INITIAL_STATE);
  });

  it('fills in fields added since the state was saved', () => {
    expect(parseState({ v: 1, step: 'bills.pick' }).celebrated).toEqual(INITIAL_STATE.celebrated);
  });

  it('names the chapter a step belongs to', () => {
    expect(chapterOf('accounts.fee')).toBe('accounts');
    expect(chapterOf('reveal')).toBe('reveal');
    expect(chapterOf('dreams.plan')).toBe('dreams');
  });
});
