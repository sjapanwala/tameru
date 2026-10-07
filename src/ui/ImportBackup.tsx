import { useState, type ChangeEvent, type FormEvent } from 'react';
import { importAll } from '../db/backup';
import { validateBackup, type Backup, type TableName } from '../domain/backup';
import {
  decryptBackup,
  isEncryptedBackup,
  WrongPassphraseError,
  type EncryptedEnvelope,
} from '../domain/encryptedBackup';
import { ConfirmDialog, Sheet } from './Sheet';

interface Pending {
  backup: Backup;
  counts: Record<TableName, number>;
}

interface Props {
  label: string;
  className?: string;
  onImported(): void;
}

function describeDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? 'an unknown date'
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

/** File picker + (decryption) + validation + "replace everything?" confirmation. */
export function ImportBackup({ label, className = 'btn btn--secondary', onImported }: Props) {
  const [locked, setLocked] = useState<EncryptedEnvelope | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function accept(json: unknown): boolean {
    const result = validateBackup(json);
    if (result.ok) setPending({ backup: result.backup, counts: result.counts });
    else setError(result.error);
    return result.ok;
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow picking the same file again
    if (!file) return;
    setError(null);
    try {
      const json: unknown = JSON.parse(await file.text());
      if (isEncryptedBackup(json)) {
        setPassphrase('');
        setUnlockError(null);
        setLocked(json);
      } else accept(json);
    } catch {
      setError('That file could not be read as a Tameru backup.');
    }
  }

  async function unlock(event: FormEvent) {
    event.preventDefault();
    if (!locked) return;
    setBusy(true);
    try {
      const json: unknown = JSON.parse(await decryptBackup(locked, passphrase));
      setLocked(null);
      accept(json);
    } catch (cause) {
      setUnlockError(
        cause instanceof WrongPassphraseError
          ? 'That passphrase didn’t unlock the file.'
          : 'The file decrypted but isn’t a valid backup.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!pending) return;
    setBusy(true);
    try {
      await importAll(pending.backup);
      setPending(null);
      onImported();
    } catch (cause) {
      console.error(cause);
      setPending(null);
      setError('Import failed. Nothing on this device was changed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <label className={`${className} file-btn`}>
        {label}
        <input
          className="visually-hidden"
          type="file"
          accept="application/json,.json"
          onChange={(event) => void onFile(event)}
        />
      </label>
      {error && (
        <p className="notice notice--warn" role="alert">
          {error}
        </p>
      )}
      {locked && (
        <Sheet label="Encrypted backup" variant="alert" onClose={() => setLocked(null)}>
          <form className="stack" onSubmit={(event) => void unlock(event)}>
            <h2 className="dialog__title">Encrypted backup</h2>
            <label className="field">
              <span className="field__label">Passphrase</span>
              <input
                className="input"
                type="password"
                autoComplete="off"
                autoFocus
                value={passphrase}
                onChange={(event) => setPassphrase(event.target.value)}
              />
              {unlockError && (
                <span className="field__error" role="alert">
                  {unlockError}
                </span>
              )}
            </label>
            <div className="dialog__actions">
              <button type="button" className="btn btn--quiet" onClick={() => setLocked(null)}>
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn--primary"
                disabled={busy || passphrase === ''}
              >
                {busy ? 'Unlocking…' : 'Unlock'}
              </button>
            </div>
          </form>
        </Sheet>
      )}
      {pending && (
        <ConfirmDialog
          title="Replace all data?"
          confirmLabel="Replace"
          danger
          busy={busy}
          onConfirm={() => void confirm()}
          onCancel={() => setPending(null)}
        >
          <p>
            This backup from {describeDate(pending.backup.exportedAt)} contains{' '}
            <strong>
              {pending.counts.transactions} transaction
              {pending.counts.transactions === 1 ? '' : 's'}
            </strong>
            , {pending.counts.accounts} account{pending.counts.accounts === 1 ? '' : 's'} and{' '}
            {pending.counts.categories} categories.
          </p>
          <p>Everything currently on this device will be replaced. This can't be undone.</p>
        </ConfirmDialog>
      )}
    </>
  );
}
