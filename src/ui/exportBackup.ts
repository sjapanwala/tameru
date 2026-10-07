import { exportAll } from '../db/backup';
import { backupFileName } from '../domain/backup';
import { todayISO } from '../domain/dates';
import { encryptBackup } from '../domain/encryptedBackup';

export type ExportOutcome = 'shared' | 'downloaded' | 'cancelled';

/**
 * Write all data to a backup file: plain JSON, or encrypted when a
 * passphrase is given. On phones this goes through the share sheet (Save to
 * Files, AirDrop…), which is the dependable route out of an installed iOS
 * app; elsewhere it's a normal download.
 */
export async function exportBackupFile(passphrase?: string): Promise<ExportOutcome> {
  const backup = await exportAll();
  const name = backupFileName(todayISO(), passphrase !== undefined);
  const text =
    passphrase === undefined
      ? JSON.stringify(backup, null, 2)
      : await encryptBackup(JSON.stringify(backup), passphrase);
  const file = new File([text], name, { type: 'application/json' });

  const touch = window.matchMedia('(pointer: coarse)').matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Tameru backup' });
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
      // Fall through to a plain download.
    }
  }

  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}
