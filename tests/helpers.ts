// Test harness: a fresh fake IndexedDB per test, pinned clock, deterministic ids.
import 'fake-indexeddb/auto';
import { MutableClock } from '../src/domain/clock';
import { TameruDB } from '../src/data/db';
import { createDexieRepos } from '../src/data/repos/dexie';
import { ensureInitialised, type App } from '../src/services/app';

let dbCounter = 0;

export async function testApp(today = '2026-10-01'): Promise<App> {
  const db = new TameruDB(`test-${++dbCounter}-${Math.random()}`);
  let n = 0;
  const app: App = { db, repos: createDexieRepos(db), clock: new MutableClock(today), newId: () => `id${++n}` };
  await ensureInitialised(app);
  return app;
}
