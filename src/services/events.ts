// App-level hooks for moments the UI may want to celebrate or react to.
// Visual polish (confetti etc.) subscribes here later; logic only emits.

export interface AppEvents {
  onboardingComplete: { accounts: number; goals: number };
  goalMilestone: { goalId: string; milestone: number };
}

const handlers = new Map<keyof AppEvents, Set<(payload: never) => void>>();

export function on<K extends keyof AppEvents>(event: K, fn: (payload: AppEvents[K]) => void): () => void {
  const set = handlers.get(event) ?? new Set();
  handlers.set(event, set);
  set.add(fn);
  return () => set.delete(fn);
}

export function emit<K extends keyof AppEvents>(event: K, payload: AppEvents[K]): void {
  handlers.get(event)?.forEach((fn) => (fn as (p: AppEvents[K]) => void)(payload));
}
