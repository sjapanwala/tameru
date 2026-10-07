import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  deleteTransaction,
  getSettings,
  listAccounts,
  listCategories,
  restoreTransaction,
  saveRule,
} from './db/repo';
import { formatMoney } from './domain/money';
import type { Account, AppSettings, Category, Transaction } from './domain/types';
import { Activity } from './pages/Activity';
import { Home } from './pages/Home';
import { Onboarding } from './pages/Onboarding';
import { Forecast } from './pages/Forecast';
import { ImportCsv } from './pages/ImportCsv';
import { Plan } from './pages/Plan';
import { Settings } from './pages/Settings';
import { onUpdateReady } from './pwa/sw';
import { AppContext, type AppContextValue, type ToastInput } from './ui/context';
import { useRoute } from './ui/router';
import { TabBar } from './ui/TabBar';
import { Toast, type ToastState } from './ui/Toast';
import { TransactionSheet, type SavedResult } from './ui/TransactionSheet';

type AppData =
  { ok: true; settings: AppSettings; accounts: Account[]; categories: Category[] } | { ok: false };

type SheetState = { mode: 'add' } | { mode: 'edit'; tx: Transaction } | null;

async function loadAppData(): Promise<AppData> {
  try {
    const [settings, accounts, categories] = await Promise.all([
      getSettings(),
      listAccounts(),
      listCategories(),
    ]);
    return { ok: true, settings, accounts, categories };
  } catch (error) {
    console.error(error);
    return { ok: false };
  }
}

function Page({ route }: { route: string }) {
  switch (route) {
    case '/activity':
      return <Activity />;
    case '/forecast':
      return <Forecast />;
    case '/plan':
      return <Plan />;
    case '/settings':
      return <Settings />;
    case '/import':
      return <ImportCsv />;
    default:
      return <Home />;
  }
}

export function App() {
  const data = useLiveQuery(loadAppData, []);
  const route = useRoute();
  const [sheet, setSheet] = useState<SheetState>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastId = useRef(0);

  const showToast = useCallback((input: ToastInput) => {
    setToast({ ...input, id: ++toastId.current });
  }, []);
  const dismissToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    onUpdateReady((apply) =>
      showToast({
        message: 'A new version is ready.',
        actionLabel: 'Reload',
        onAction: apply,
        sticky: true,
      }),
    );
  }, [showToast]);

  // Scroll to the top when switching tabs, like a native tab bar.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route]);

  const context = useMemo<AppContextValue | null>(
    () =>
      data?.ok
        ? {
            settings: data.settings,
            accounts: data.accounts,
            categories: data.categories,
            openAdd: () => setSheet({ mode: 'add' }),
            openEdit: (tx) => setSheet({ mode: 'edit', tx }),
            showToast,
          }
        : null,
    [data, showToast],
  );

  if (data === undefined) return null; // IndexedDB answers within a frame or two
  if (!data.ok || !context) {
    return (
      <main className="gate">
        <h1 className="gate__title">Storage unavailable</h1>
        <p className="gate__lede">
          Tameru couldn't open its on-device database. This usually means private browsing or
          blocked site storage. Turn that off and reload.
        </p>
      </main>
    );
  }

  let content;
  if (!data.settings.onboardedAt) {
    content = <Onboarding />;
  } else {
    const money = (cents: number) => formatMoney(cents, data.settings.currency, { signed: true });
    const categoryName = (id: string) =>
      data.categories.find((c) => c.id === id)?.name ?? 'this category';

    const onSaved = ({ tx, isNew, suggestion }: SavedResult) => {
      setSheet(null);
      if (suggestion) {
        // Offer, never assume: the rule is only created if the user taps.
        showToast({
          message: `Saved. Always file ${suggestion.cleanName} under ${categoryName(suggestion.categoryId)}?`,
          actionLabel: 'Remember',
          onAction: async () => {
            await saveRule(suggestion);
            showToast({
              message: `Got it. ${suggestion.cleanName} → ${categoryName(suggestion.categoryId)}.`,
            });
          },
        });
      } else if (isNew) {
        showToast({
          message: `Saved ${money(tx.amountCents)}${tx.merchant ? ` · ${tx.merchant}` : ''}`,
          actionLabel: 'Undo',
          onAction: () => deleteTransaction(tx.id),
        });
      } else {
        showToast({ message: 'Changes saved.' });
      }
    };

    const onDeleted = (tx: Transaction) => {
      setSheet(null);
      showToast({
        message: 'Transaction deleted.',
        actionLabel: 'Undo',
        onAction: () => restoreTransaction(tx.id),
      });
    };

    // Settings and import are drill-in screens: back arrow, no tab bar.
    const bare = route === '/settings' || route === '/import';

    content = (
      <>
        <main
          className={`page${bare ? ' page--bare' : route === '/activity' ? ' page--activity' : ''}`}
        >
          <Page route={route} />
        </main>
        {!bare && <TabBar route={route} onAdd={() => setSheet({ mode: 'add' })} />}
        {sheet && (
          <TransactionSheet
            // Remount per transaction so the form starts from clean state.
            key={sheet.mode === 'edit' ? sheet.tx.id : 'add'}
            tx={sheet.mode === 'edit' ? sheet.tx : undefined}
            onClose={() => setSheet(null)}
            onSaved={onSaved}
            onDeleted={onDeleted}
          />
        )}
      </>
    );
  }

  return (
    <AppContext.Provider value={context}>
      {content}
      <Toast toast={toast} onDismiss={dismissToast} />
    </AppContext.Provider>
  );
}
