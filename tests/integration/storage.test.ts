import { describe, expect, it } from 'vitest';
import { testApp } from '../helpers';
import { SCHEMA_VERSION } from '../../src/data/db';
import type { Transaction } from '../../src/domain/types';

describe('storage', () => {
  it('initialises defaults once', async () => {
    const app = await testApp();
    const cats = await app.repos.categories.all();
    expect(cats.filter((c) => c.group !== 'system')).toHaveLength(7);
    const s = await app.repos.settings.get();
    expect(s.freshStartDays).toBe(10);
    expect(app.db.verno).toBe(SCHEMA_VERSION);
  });
  it('never inserts the same originKey twice', async () => {
    const app = await testApp();
    const tx = (id: string): Transaction => ({
      id, type: 'expense', amountCents: 100, date: '2026-10-01', accountId: 'a', status: 'pending',
      needsReview: false, originKey: 'rec:r1:2026-10-01', createdAt: '', updatedAt: '',
    });
    expect(await app.repos.transactions.insertGenerated([tx('t1'), tx('t2')])).toBe(1);
    expect(await app.repos.transactions.insertGenerated([tx('t3')])).toBe(0);
    expect(await app.repos.transactions.all()).toHaveLength(1);
  });
});
