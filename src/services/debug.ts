// Dev-only controls: fake today, jump ahead, seed, wipe.

import type { LocalDate } from '../domain/types';
import { seedSampleData } from '../data/seed';
import { eraseAllData, type App } from './app';
import { onAppOpen } from './appOpen';

export async function setToday(app: App, date: LocalDate | null) {
  app.clock.set(date);
  await app.repos.settings.update({ debugToday: date ?? undefined });
}

/** Move the clock forward as if the app wasn't opened in between, then open it. */
export async function jumpDays(app: App, days: number) {
  app.clock.advance(days);
  await setToday(app, app.clock.today());
  return onAppOpen(app);
}

export async function seed(app: App) {
  await wipe(app);
  await seedSampleData(app);
}

/** Erase everything but keep the pinned debug date. */
export async function wipe(app: App) {
  const debugToday = (await app.repos.settings.get()).debugToday;
  await eraseAllData(app);
  if (debugToday) await app.repos.settings.update({ debugToday });
}
