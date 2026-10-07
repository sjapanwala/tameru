import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { eraseAll } from '../db/backup';
import { deleteRule, listRules, restoreRule, setSetting } from '../db/repo';
import { CURRENCIES } from '../domain/defaults';
import { MIN_PASSPHRASE_LENGTH } from '../domain/encryptedBackup';
import { getStorageStatus, requestPersistence, type StorageStatus } from '../pwa/persist';
import { useApp } from '../ui/context';
import { exportBackupFile } from '../ui/exportBackup';
import { AlertIcon, CheckIcon } from '../ui/Icons';
import { ImportBackup } from '../ui/ImportBackup';
import { PageHeader } from '../ui/PageHeader';
import { ConfirmDialog, Sheet } from '../ui/Sheet';

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
  const rules = useLiveQuery(listRules, []);
  const [storage, setStorage] = useState<StorageStatus | null>(null);
  const [confirmErase, setConfirmErase] = useState(false);
  const [busy, setBusy] = useState(false);
  const [encrypting, setEncrypting] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [passphraseAgain, setPassphraseAgain] = useState('');

  const passphraseProblem =
    passphrase.length < MIN_PASSPHRASE_LENGTH
      ? `Use at least ${MIN_PASSPHRASE_LENGTH} characters.`
      : passphrase !== passphraseAgain
        ? 'The two passphrases don’t match.'
        : null;

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

  async function exportEncrypted(event: FormEvent) {
    event.preventDefault();
    if (passphraseProblem) return;
    setBusy(true);
    try {
      const outcome = await exportBackupFile(passphrase);
      setEncrypting(false);
      setPassphrase('');
      setPassphraseAgain('');
      if (outcome !== 'cancelled') showToast({ message: 'Encrypted backup exported.' });
    } catch (error) {
      console.error(error);
      showToast({ message: 'Export failed. Try again.' });
    } finally {
      setBusy(false);
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

      <section className="group" aria-labelledby="set-general">
        <h2 id="set-general" className="group__label">
          General
        </h2>
        <div className="group__card">
          <label className="setting">
            <span>Currency</span>
            <select
              className="setting__select"
              value={settings.currency}
              onChange={(event) => void setSetting('currency', event.target.value)}
            >
              {currencies.map(({ code, label }) => (
                <option key={code} value={code}>
                  {code} · {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="group__note">Changes how amounts are shown. Amounts aren't converted.</p>
      </section>

      <section className="group" aria-labelledby="set-storage">
        <h2 id="set-storage" className="group__label">
          Storage on this device
        </h2>
        <div className="group__card">
          <div className="setting">
            <span>Protected storage</span>
            {storage === null ? (
              <span className="setting__value">…</span>
            ) : !storage.supported ? (
              <Status good={false}>Not supported</Status>
            ) : (
              <Status good={storage.persisted}>
                {storage.persisted ? 'Persisted' : 'Not persisted'}
              </Status>
            )}
          </div>
          {storage?.usageBytes != null && (
            <div className="setting">
              <span>Space used</span>
              <span className="setting__value num">{formatBytes(storage.usageBytes)}</span>
            </div>
          )}
          {storage?.supported && !storage.persisted && (
            <button
              type="button"
              className="setting setting--action"
              onClick={() => void askToPersist()}
            >
              Ask for protected storage
            </button>
          )}
        </div>
        {storage && (
          <p className="group__note">
            {storage.persisted
              ? "The browser has agreed not to clear Tameru's data to free up space."
              : storage.firstRun
                ? 'Tameru asked for protected storage and the browser said no, so data could be cleared if the device runs low on space or the app goes unused for a long time. Export a backup regularly.'
                : 'Protected storage has not been requested yet.'}
          </p>
        )}
      </section>

      <section className="group" aria-labelledby="set-backup">
        <h2 id="set-backup" className="group__label">
          Backup
        </h2>
        <div className="group__card">
          <button
            type="button"
            className="setting setting--action"
            onClick={() => setEncrypting(true)}
          >
            Export encrypted backup…
          </button>
          <button
            type="button"
            className="setting setting--action"
            onClick={() => void exportData()}
          >
            Export all data (JSON)
          </button>
          <ImportBackup
            label="Import a backup…"
            className="setting setting--action"
            onImported={() => showToast({ message: 'Backup imported.' })}
          />
        </div>
        <p className="group__note">
          Your data never leaves this device unless you export it. An encrypted backup is locked
          with a passphrase only you know; the plain JSON file is readable by anyone who has it.
        </p>
      </section>

      <section className="group" aria-labelledby="set-csv">
        <h2 id="set-csv" className="group__label">
          Bank import
        </h2>
        <div className="group__card">
          <a className="setting setting--action" href="#/import">
            Import transactions from CSV
          </a>
        </div>
        <p className="group__note">
          Bring in transactions from a CSV file downloaded from your bank. Merchants are cleaned up
          and your rules applied.
        </p>
      </section>

      <section className="group" aria-labelledby="set-rules">
        <h2 id="set-rules" className="group__label">
          Merchant rules
        </h2>
        <div className="group__card">
          {rules?.length === 0 && (
            <p className="group__text">
              No rules yet. When you pick a category for a merchant, Tameru offers to remember it.
            </p>
          )}
          {rules?.map((rule) => (
            <div key={rule.id} className="setting">
              <span className="rule__text">
                <span>{rule.cleanName}</span>
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
            </div>
          ))}
        </div>
      </section>

      {import.meta.env.DEV && (
        <section className="group" aria-labelledby="set-dev">
          <h2 id="set-dev" className="group__label">
            Developer
          </h2>
          <div className="group__card">
            <button
              type="button"
              className="setting setting--action"
              onClick={() => void loadSample()}
              disabled={busy}
            >
              Load sample data
            </button>
          </div>
          <p className="group__note">Only in development builds.</p>
        </section>
      )}

      <section className="group" aria-labelledby="set-danger">
        <h2 id="set-danger" className="group__label">
          Reset
        </h2>
        <div className="group__card">
          <button
            type="button"
            className="setting setting--danger"
            onClick={() => setConfirmErase(true)}
          >
            Erase all data on this device
          </button>
        </div>
      </section>

      <p className="footnote">Tameru {__APP_VERSION__} · No account, no server, no tracking.</p>

      {encrypting && (
        <Sheet label="Encrypted backup" variant="alert" onClose={() => setEncrypting(false)}>
          <form className="stack" onSubmit={(event) => void exportEncrypted(event)}>
            <h2 className="dialog__title">Encrypted backup</h2>
            <p className="field__hint">
              Choose a passphrase of at least {MIN_PASSPHRASE_LENGTH} characters. There is no way to
              recover the backup without it.
            </p>
            <label className="field">
              <span className="field__label">Passphrase</span>
              <input
                className="input"
                type="password"
                autoComplete="new-password"
                autoFocus
                value={passphrase}
                onChange={(event) => setPassphrase(event.target.value)}
              />
            </label>
            <label className="field">
              <span className="field__label">Repeat passphrase</span>
              <input
                className="input"
                type="password"
                autoComplete="new-password"
                value={passphraseAgain}
                onChange={(event) => setPassphraseAgain(event.target.value)}
              />
              {passphraseProblem && passphraseAgain !== '' && (
                <span className="field__error" role="alert">
                  {passphraseProblem}
                </span>
              )}
            </label>
            <div className="dialog__actions">
              <button type="button" className="btn btn--quiet" onClick={() => setEncrypting(false)}>
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn--primary"
                disabled={busy || passphraseProblem !== null}
              >
                {busy ? 'Encrypting…' : 'Export'}
              </button>
            </div>
          </form>
        </Sheet>
      )}

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
