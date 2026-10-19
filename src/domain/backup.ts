// Full JSON backup format: versioned, validated on import, migratable.

export const BACKUP_FORMAT = 1;

export interface BackupFile<T = Record<string, unknown[]>> {
  app: 'tameru';
  format: number;
  schemaVersion: number;
  exportedAt: string;
  tables: T;
}

export function makeBackup<T>(tables: T, schemaVersion: number, exportedAt: string): BackupFile<T> {
  return { app: 'tameru', format: BACKUP_FORMAT, schemaVersion, exportedAt, tables };
}

/** Upgrades older backup formats in order. Add an entry when BACKUP_FORMAT changes. */
const FORMAT_MIGRATIONS: Record<number, (b: BackupFile) => BackupFile> = {
  // 1 → 2: (example) (b) => ({ ...b, format: 2, tables: { ...b.tables, newTable: [] } }),
};

export type ParseResult<T> = { ok: true; backup: BackupFile<T> } | { ok: false; error: string };

// Fields that must be integer cents wherever they appear.
const CENT_FIELDS = /Cents$/;

function findFloatMoney(v: unknown, path: string): string | null {
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) {
      const r = findFloatMoney(v[i], `${path}[${i}]`);
      if (r) return r;
    }
  } else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      if (CENT_FIELDS.test(k) && (typeof x === 'number' || typeof x === 'string') && !Number.isSafeInteger(x)) return `${path}.${k}`;
      const r = findFloatMoney(x, `${path}.${k}`);
      if (r) return r;
    }
  }
  return null;
}

export function parseBackup<T>(json: string, tableNames: readonly string[]): ParseResult<T> {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return { ok: false, error: 'not JSON' };
  }
  if (!data || typeof data !== 'object') return { ok: false, error: 'not a backup' };
  let b = data as BackupFile;
  if (b.app !== 'tameru' || typeof b.format !== 'number' || !b.tables || typeof b.tables !== 'object')
    return { ok: false, error: 'not a Tameru backup' };
  if (b.format > BACKUP_FORMAT) return { ok: false, error: 'made by a newer version of Tameru' };
  while (b.format < BACKUP_FORMAT) {
    const m = FORMAT_MIGRATIONS[b.format];
    if (!m) return { ok: false, error: `no upgrade from format ${b.format}` };
    b = m(b);
  }
  const tables: Record<string, unknown[]> = {};
  for (const n of tableNames) {
    const t = (b.tables as Record<string, unknown>)[n] ?? [];
    if (!Array.isArray(t)) return { ok: false, error: `${n} is not a list` };
    if (t.some((r) => !r || typeof r !== 'object' || typeof (r as { id?: unknown }).id !== 'string'))
      return { ok: false, error: `${n} has a row without an id` };
    tables[n] = t;
  }
  const bad = findFloatMoney(tables, 'tables');
  if (bad) return { ok: false, error: `${bad} is not whole cents` };
  return { ok: true, backup: { ...b, tables: tables as T } };
}
