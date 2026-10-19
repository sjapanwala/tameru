// Opens storage and builds the AppContext the UI uses.

import { MutableClock } from '../domain/clock';
import { defaultCategories } from '../domain/defaults';
import { TameruDB } from '../data/db';
import { createDexieRepos } from '../data/repos/dexie';
import { defaultNewId, nowIso, type AppContext } from './context';

export interface App extends AppContext {
  clock: MutableClock;
  db: TameruDB;
}

export async function openApp(dbName = 'tameru'): Promise<App> {
  const db = new TameruDB(dbName);
  const repos = createDexieRepos(db);
  const clock = new MutableClock();
  const app: App = { db, repos, clock, newId: defaultNewId };
  const settings = await repos.settings.get();
  if (settings.debugToday) clock.set(settings.debugToday);
  await ensureInitialised(app);
  return app;
}

/** First run: default categories and settings row. Safe to call repeatedly. */
export async function ensureInitialised(ctx: AppContext): Promise<void> {
  const cats = await ctx.repos.categories.all();
  if (cats.length === 0) await ctx.repos.categories.bulkPut(defaultCategories(nowIso(ctx)));
  await ctx.repos.settings.update({});
}

/** Remove every record on this device and start over with defaults. */
export async function eraseAllData(ctx: AppContext): Promise<void> {
  await ctx.repos.wipe();
  await ensureInitialised(ctx);
}
