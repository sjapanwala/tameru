import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { testApp } from '../helpers';
import { MIGRATIONS, TameruDB } from '../../src/data/db';
import { exportJson, importJson } from '../../src/data/exportImport';
import { createAccount } from '../../src/services/accounts';
import { clearQuick, logQuick, quickSlots, QuickValidationError, saveQuick, undoQuick } from '../../src/services/quick';

describe('quick transactions', () => {
  it('saves a preset, logs it in one tap, and undoes', async () => {
    const app = await testApp('2026-10-19');
    const chq = await createAccount(app, { name: 'Chq', type: 'chequing', openingBalanceCents: 10000 });
    await saveQuick(app, { slot: 1, label: 'Coffee', icon: 'coffee', amountCents: 450, categoryId: 'cat_eating_out', merchant: 'Tim Hortons', accountId: chq.id });
    const s = await quickSlots(app);
    expect(s.map((x) => x?.label ?? null)).toEqual([null, 'Coffee', null, null]);
    const tx = await logQuick(app, s[1]!.id);
    expect(tx).toMatchObject({ amountCents: 450, accountId: chq.id, categoryId: 'cat_eating_out', merchant: 'Tim Hortons', type: 'expense', needsReview: false });
    await undoQuick(app, tx.id);
    expect(await app.repos.transactions.all()).toEqual([]);
  });

  it('asks for the account when set to ask, and replaces a slot in place', async () => {
    const app = await testApp('2026-10-19');
    const chq = await createAccount(app, { name: 'Chq', type: 'chequing' });
    const card = await createAccount(app, { name: 'Visa', type: 'credit_card' });
    const q = await saveQuick(app, { slot: 0, label: 'Parking', icon: 'parking', amountCents: 300, accountId: 'ask' });
    expect((await logQuick(app, q.id, card.id)).accountId).toBe(card.id);
    await expect(logQuick(app, q.id)).rejects.toThrow();
    const again = await saveQuick(app, { slot: 0, label: 'Transit', icon: 'bus', amountCents: 335, accountId: chq.id });
    expect(again.id).toBe(q.id);
    expect(await app.repos.quickActions.all()).toHaveLength(1);
    await clearQuick(app, 0);
    expect(await app.repos.quickActions.all()).toEqual([]);
  });

  it('rejects invalid presets', async () => {
    const app = await testApp();
    await expect(saveQuick(app, { slot: 0, label: '', icon: 'coffee', amountCents: 0, accountId: 'nope' })).rejects.toBeInstanceOf(QuickValidationError);
  });

  it('survives export and import', async () => {
    const app = await testApp();
    const chq = await createAccount(app, { name: 'Chq', type: 'chequing' });
    await saveQuick(app, { slot: 3, label: 'Gym', icon: 'gym', amountCents: 1500, accountId: chq.id });
    const json = await exportJson(app);
    await app.repos.wipe();
    expect((await importJson(app, json)).ok).toBe(true);
    expect((await app.repos.quickActions.all())[0]).toMatchObject({ label: 'Gym', slot: 3 });
  });
});

describe('schema migration v1 → v2', () => {
  it('upgrades an existing v1 database without losing data', async () => {
    const name = `migrate-${Math.random()}`;
    const v1 = new Dexie(name);
    v1.version(1).stores(MIGRATIONS[0]!.stores);
    await v1.open();
    await v1.table('accounts').put({ id: 'a1', name: 'Old chequing' });
    v1.close();

    const db = new TameruDB(name);
    await db.open();
    expect(db.verno).toBe(2);
    expect((await db.accounts.get('a1'))?.name).toBe('Old chequing');
    expect(await db.quickActions.count()).toBe(0);
    db.close();
  });

  it('accepts a backup made before quick actions existed', async () => {
    const app = await testApp();
    const json = await exportJson(app);
    const old = JSON.parse(json);
    delete old.tables.quickActions;
    expect((await importJson(app, JSON.stringify(old))).ok).toBe(true);
  });
});
