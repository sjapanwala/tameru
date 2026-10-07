import { useState, type ChangeEvent } from 'react';
import { importAll } from '../db/backup';
import { validateBackup, type Backup, type TableName } from '../domain/backup';
import { ConfirmDialog } from './Sheet';

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

/** File picker + validation + "replace everything?" confirmation. */
export function ImportBackup({ label, className = 'btn btn--secondary', onImported }: Props) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow picking the same file again
    if (!file) return;
    setError(null);
    try {
      const result = validateBackup(JSON.parse(await file.text()));
      if (result.ok) setPending({ backup: result.backup, counts: result.counts });
      else setError(result.error);
    } catch {
      setError('That file could not be read as JSON.');
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
