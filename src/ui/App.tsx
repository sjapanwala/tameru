import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { S } from '../copy/strings';
import type { FreshStartOffer } from '../domain/freshStart';
import type { TransactionType } from '../domain/types';
import { devMode } from '../pwa/standalone';
import { openApp, type App as AppT } from '../services/app';
import { onAppOpen } from '../services/appOpen';
import { on } from '../services/events';
import { AppCtx, useApp, useLoad } from './hooks';
import { go, useRoute } from './router';
import { Accounts } from './screens/Accounts';
import { Add } from './screens/Add';
import { Debug } from './screens/Debug';
import { Forecast } from './screens/Forecast';
import { Home } from './screens/Home';
import { Onboarding } from './screens/Onboarding';
import { Plan } from './screens/Plan';
import { Recurring } from './screens/Recurring';
import { Settings } from './screens/Settings';
import { Transactions } from './screens/Transactions';
import { More } from './screens/More';
import { QuickEditor } from './screens/QuickEditor';
import { Sheet } from './Sheet';
import { TabBar } from './TabBar';
import { ToastHost } from './toast';

const addType = (t: string | null): TransactionType => (t === 'income' || t === 'refund' || t === 'transfer' ? t : 'expense');

function Screens({ offer, setOffer }: { offer: FreshStartOffer | null; setOffer: (o: FreshStartOffer | null) => void }) {
  const route = useRoute();
  const lastPath = useRef('/');
  const { bump } = useApp();
  const dev = devMode();
  const settings = useLoad((a) => a.repos.settings.get());
  const [celebration, setCelebration] = useState<string>();
  useEffect(() => on('onboardingComplete', () => setCelebration(S.onboarding.complete)), []);
  if (!settings) return <div class="placeholder" />;
  // Debug stays reachable before onboarding so the sample data can be seeded.
  if (!settings.onboardedAt && route.path !== '/debug') {
    return (
      <div class="shell shell--bare">
        <Onboarding onDone={() => (bump(), go('/'))} />
        {dev && <p><a href="#/debug">{S.nav.debug}</a></p>}
      </div>
    );
  }
  // Add is a sheet over whatever screen was showing before it.
  const sheetOpen = route.path === '/add' || route.path === '/quick';
  const base = sheetOpen ? lastPath.current : route.path;
  if (!sheetOpen) lastPath.current = route.path;
  const screen = (() => {
    switch (base) {
      case '/transactions':
        return <Transactions />;
      case '/accounts':
        return <Accounts />;
      case '/recurring':
        return <Recurring />;
      case '/plan':
        return <Plan />;
      case '/forecast':
        return <Forecast />;
      case '/settings':
        return <Settings />;
      case '/more':
        return <More />;
      case '/debug':
        return dev ? <Debug onOffer={setOffer} /> : null;
      default:
        return <Home offer={offer} clearOffer={() => setOffer(null)} />;
    }
  })();
  return (
    <>
      <div class="shell">
        {celebration && <p class="note">{celebration}</p>}
        <main class="page" key={base}>
          {screen}
        </main>
      </div>
      <TabBar path={sheetOpen ? base : route.path} />
      {route.path === '/add' && (
        <Sheet label={S.add.title} onClose={() => go(lastPath.current)}>
          <Add initialType={addType(route.params.get('type'))} onDone={() => go(lastPath.current)} />
        </Sheet>
      )}
      {route.path === '/quick' && (
        <Sheet label={S.quick.setUp} onClose={() => go(lastPath.current)}>
          <QuickEditor slot={Number(route.params.get('slot')) || 0} onDone={() => go(lastPath.current)} />
        </Sheet>
      )}
      <ToastHost />
    </>
  );
}

function Shell({ app, initialOffer }: { app: AppT; initialOffer: FreshStartOffer | null }) {
  const [version, setVersion] = useState(0);
  const [offer, setOffer] = useState(initialOffer);
  const bump = () => setVersion((v) => v + 1);
  // Opening the app again later in the day (e.g. from the background) runs bookkeeping again.
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && onAppOpen(app).then((r) => (r.freshStart && setOffer(r.freshStart), bump()));
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);
  return (
    <AppCtx.Provider value={{ app, version, bump }}>
      <Screens offer={offer} setOffer={(o) => (setOffer(o), bump())} />
    </AppCtx.Provider>
  );
}

function Boot() {
  const [state, setState] = useState<{ app: AppT; offer: FreshStartOffer | null }>();
  useEffect(() => {
    openApp().then(async (app) => setState({ app, offer: (await onAppOpen(app)).freshStart }));
  }, []);
  return state ? <Shell app={state.app} initialOffer={state.offer} /> : <div class="shell" />;
}

export function mountApp(root: HTMLElement): void {
  render(<Boot />, root);
}
