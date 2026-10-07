import {
  BACKUP_APP_ID,
  BACKUP_FORMAT_VERSION,
  TABLE_NAMES,
  type Backup,
  type BackupData,
} from '../domain/backup';
import { db } from './db';

const allTables = () => TABLE_NAMES.map((name) => db.table(name));

/** Everything in the database, including soft-deleted rows. */
export async function exportAll(): Promise<Backup> {
  const data = {} as Record<string, unknown[]>;
  await db.transaction('r', allTables(), async () => {
    for (const name of TABLE_NAMES) data[name] = await db.table(name).toArray();
  });
  return {
    app: BACKUP_APP_ID,
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    data: data as unknown as BackupData,
  };
}

/** Replace everything on this device with the backup. All-or-nothing. */
export async function importAll(backup: Backup): Promise<void> {
  await db.transaction('rw', allTables(), async () => {
    for (const name of TABLE_NAMES) {
      const table = db.table(name);
      await table.clear();
      await table.bulkAdd(backup.data[name]);
    }
  });
}

export async function eraseAll(): Promise<void> {
  await db.transaction('rw', allTables(), async () => {
    for (const name of TABLE_NAMES) await db.table(name).clear();
  });
}
