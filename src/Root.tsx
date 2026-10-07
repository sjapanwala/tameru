import { lazy, Suspense, useEffect, useState } from 'react';
import { shouldShowGate } from './domain/platform';
import { InstallGate } from './gate/InstallGate';
import { requestPersistenceOnFirstRun } from './pwa/persist';
import { isStandalone } from './pwa/standalone';
import { isUnlocked } from './pwa/unlock';

// The app (routes, database, everything) is a separate chunk that is only
// requested once we know we're allowed to run. A browser tab never loads it.
const App = lazy(() => import('./App').then((module) => ({ default: module.App })));

/** Decided once at launch: a tab can't become an installed app without reloading. */
export const gated = shouldShowGate({
  standalone: isStandalone(),
  allowBrowser: __ALLOW_BROWSER__,
  unlocked: isUnlocked(),
});

function Boot() {
  const [ready, setReady] = useState(false);

  // First installed launch: ask for protected storage and wait for the
  // answer, so it's recorded before onboarding starts writing data.
  useEffect(() => {
    void requestPersistenceOnFirstRun().finally(() => setReady(true));
  }, []);

  if (!ready) return null;
  return (
    <Suspense fallback={null}>
      <App />
    </Suspense>
  );
}

export function Root() {
  return gated ? <InstallGate /> : <Boot />;
}
