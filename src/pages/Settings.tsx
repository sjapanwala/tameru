import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { eraseAll } from '../db/backup';
import { deleteRule, listRules, restoreRule, setSetting } from '../db/repo';
import { CURRENCIES } from '../domain/defaults';
import { getStorageStatus, requestPersistence, type StorageStatus } from '../pwa/persist';
import { useStandalone } from '../pwa/standalone';
import { useApp } from '../ui/context';
import { exportBackupFile } from '../ui/exportBackup';
import { AlertIcon, CheckIcon } from '../ui/Icons';
import { ImportBackup } from '../ui/ImportBackup';
import { PageHeader } from '../ui/PageHeader';
import { ConfirmDialog } from '../ui/Sheet';

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function Status({ good, children }: { good: boolean; children: ReactNode }) {
  return (
    <span className={`status ${good ? 'status--good' : 'status--warn'}`}>
      {good ? <CheckIcon size={16} /> : <AlertIcon size={16} />}
      {children}
    </span>
  );
}

export function Settings() {
  const { settings, categories, showToast } = useApp();
  const standalone = useStandalone();
  const rules = useLiveQuery(listRules, []);
  const [storage, setStorage] = useState<StorageStatus | null>(null);
  const [confirmErase, setConfirmErase] = useState(false);
  const [busy, setBusy] = useState(false);

  const refreshStorage = useCallback(async () => setStorage(await getStorageStatus()), []);
  useEffect(() => {
    void refreshStorage();
  }, [refreshStorage]);

  const currencies = CURRENCIES.some((c) => c.code === settings.currency)
    ? CURRENCIES
    : [{ code: settings.currency, label: 'Current' }, ...CURRENCIES];

  async function exportData() {
    try {
      const outcome = await exportBackupFile();
      if (outcome !== 'cancelled') showToast({ message: 'Backup exported.' });
    } catch (error) {
      console.error(error);
      showToast({ message: 'Export failed. Try again.' });
    }
  }

  async function askToPersist() {
    const granted = await requestPersistence();
    await refreshStorage();
    showToast({
      message: granted
        ? 'Storage is now protected.'
        : "The browser didn't grant protected storage. Keep exporting backups.",
    });
  }

  async function loadSample() {
    // Dynamic import inside a DEV check keeps sample data out of production bundles.
    if (!import.meta.env.DEV) return;
    setBusy(true);
    try {
      const { loadSampleData } = await import('../db/sample');
      const count = await loadSampleData();
      showToast({ message: `Loaded ${count} sample transactions.` });
    } finally {
      setBusy(false);
    }
  }

  async function erase() {
    setBusy(true);
    try {
      await eraseAll();
    } finally {
      setBusy(false);
      setConfirmErase(false);
    }
  }

  return (
    <>
      <PageHeader title="Settings" backTo="/" />

      <section className="card stack" aria-labelledby="set-general">
        <h2 id="set-general" className="card__title">
          General
        </h2>
        <label className="field">
          <span className="field__label">Currency</span>
          <select
            className="input"
            value={settings.currency}
            onChange={(event) => void setSetting('currency', event.target.value)}
          >
            {currencies.map(({ code, label }) => (
              <option key={code} value={code}>
                {code} · {label}
              </option>
            ))}
          </select>
          <span className="field__hint">
            Changes how amounts are shown. Amounts aren't converted.
          </span>
        </label>
      </section>

      <section className="card stack" aria-labelledby="set-storage">
        <h2 id="set-storage" className="card__title">
          Storage on this device
        </h2>
        <dl className="facts">
          <div>
            <dt>Installed app</dt>
            <dd>
              <Status good={standalone}>
                {standalone ? 'Yes' : 'No, running in a browser tab'}
              </Status>
            </dd>
          </div>
          <div>
            <dt>Protected storage</dt>
            <dd>
              {storage === null ? (
                '…'
              ) : !storage.supported ? (
                <Status good={false}>Not supported by this browser</Status>
              ) : (
                <Status good={storage.persisted}>
                  {storage.persisted ? 'Persisted' : 'Not persisted'}
                </Status>
              )}
            </dd>
          </div>
          {storage?.usageBytes != null && (
            <div>
              <dt>Space used</dt>
              <dd className="num">{formatBytes(storage.usageBytes)}</dd>
            </div>
          )}
        </dl>
        {storage && (
          <p className="field__hint">
            {storage.persisted
              ? "The browser has agreed not to clear Tameru's data to free up space."
              : storage.firstRun
                ? 'Tameru asked for protected storage and the browser said no, so data could be cleared if the device runs low on space or the app goes unused for a long time. Export a backup regularly.'
                : standalone
                  ? 'Protected storage has not been requested yet.'
                  : 'Protected storage is requested the first time Tameru runs as an installed app.'}
          </p>
        )}
        {storage?.supported && !storage.persisted && (
          <button type="button" className="btn btn--secondary" onClick={() => void askToPersist()}>
            Ask for protected storage
          </button>
        )}
      </section>

      <section className="card stack" aria-labelledby="set-backup">
        <h2 id="set-backup" className="card__title">
          Backup
        </h2>
        <p className="field__hint">
          Your data never leaves this device unless you export it. The backup is a plain,
          unencrypted JSON file with everything in it.
        </p>
        <button type="button" className="btn btn--secondary" onClick={() => void exportData()}>
          Export all data (JSON)
        </button>
        <ImportBackup
          label="Import from JSON…"
          onImported={() => showToast({ message: 'Backup imported.' })}
        />
      </section>

      <section className="card stack" aria-labelledby="set-rules">
        <h2 id="set-rules" className="card__title">
          Merchant rules
        </h2>
        {rules?.length === 0 && (
          <p className="field__hint">
            No rules yet. When you pick a category for a merchant, Tameru offers to remember it.
          </p>
        )}
        {rules && rules.length > 0 && (
          <ul className="rule-list">
            {rules.map((rule) => (
              <li key={rule.id} className="rule">
                <span className="rule__text">
                  <span className="rule__name">{rule.cleanName}</span>
                  <span className="rule__category">
                    → {categories.find((c) => c.id === rule.categoryId)?.name ?? 'Deleted category'}
                  </span>
                </span>
                <button
                  type="button"
                  className="btn btn--quiet btn--small"
                  aria-label={`Remove rule for ${rule.cleanName}`}
                  onClick={() => {
                    void deleteRule(rule.id);
                    showToast({
                      message: `Rule for ${rule.cleanName} removed.`,
                      actionLabel: 'Undo',
                      onAction: () => restoreRule(rule.id),
                    });
                  }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {import.meta.env.DEV && (
        <section className="card stack" aria-labelledby="set-dev">
          <h2 id="set-dev" className="card__title">
            Developer
          </h2>
          <p className="field__hint">Only in development builds.</p>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => void loadSample()}
            disabled={busy}
          >
            Load sample data
          </button>
        </section>
      )}

      <section className="card stack" aria-labelledby="set-danger">
        <h2 id="set-danger" className="card__title">
          Reset
        </h2>
        <button
          type="button"
          className="btn btn--danger-quiet"
          onClick={() => setConfirmErase(true)}
        >
          Erase all data on this device
        </button>
      </section>

      <p className="footnote">Tameru {__APP_VERSION__} · No account, no server, no tracking.</p>

      {confirmErase && (
        <ConfirmDialog
          title="Erase everything?"
          confirmLabel="Erase"
          danger
          busy={busy}
          onConfirm={() => void erase()}
          onCancel={() => setConfirmErase(false)}
        >
          <p>
            All accounts, transactions, rules and settings on this device will be deleted and you'll
            start again from setup. Export a backup first if you might want them back.
          </p>
        </ConfirmDialog>
      )}
    </>
  );
}
