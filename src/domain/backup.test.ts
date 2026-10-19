import { describe, expect, it } from 'vitest';
import { BACKUP_FORMAT, makeBackup, parseBackup } from './backup';

describe('backup', () => {
  const names = ['accounts', 'transactions'];
  it('accepts its own output', () => {
    const b = makeBackup({ accounts: [{ id: 'a', openingBalanceCents: 100 }], transactions: [] }, 1, 'x');
    const r = parseBackup(JSON.stringify(b), names);
    expect(r.ok).toBe(true);
  });
  it('rejects junk, newer formats, rows without ids and float money', () => {
    expect(parseBackup('nope', names).ok).toBe(false);
    expect(parseBackup('{"app":"other"}', names).ok).toBe(false);
    expect(parseBackup(JSON.stringify({ app: 'tameru', format: BACKUP_FORMAT + 1, tables: {} }), names).ok).toBe(false);
    expect(parseBackup(JSON.stringify(makeBackup({ accounts: [{}] }, 1, 'x')), names).ok).toBe(false);
    const r = parseBackup(JSON.stringify(makeBackup({ transactions: [{ id: 't', amountCents: 12.5 }] }, 1, 'x')), names);
    expect(r).toEqual({ ok: false, error: 'tables.transactions[0].amountCents is not whole cents' });
  });
});
