import { describe, expect, it } from 'vitest';
import { testApp } from '../helpers';
import { exportCsv, exportJson, importCsv, importJson } from '../../src/data/exportImport';
import { createAccount, listAccounts } from '../../src/services/accounts';
import { addTransaction, transfer } from '../../src/services/transactions';
import { seedSampleData } from '../../src/data/seed';

async function populated() {
  const app = await testApp('2026-10-15');
  await seedSampleData(app);
  const chq = (await app.repos.accounts.all()).find((a) => a.type === 'chequing')!;
  const sav = (await app.repos.accounts.all()).find((a) => a.type === 'savings')!;
  await addTransaction(app, { amountCents: 1234, accountId: chq.id, categoryId: 'cat_groceries', merchant: 'Loblaws' });
  await transfer(app, chq.id, sav.id, 5000);
  return app;
}

describe('export → wipe → import', () => {
  it('restores identical state', async () => {
    const app = await populated();
    const before = await app.repos.dumpAll();
    const json = await exportJson(app);
    await app.repos.wipe();
    expect(await app.repos.accounts.all()).toEqual([]);
    const res = await importJson(app, json);
    expect(res.ok).toBe(true);
    expect(await app.repos.dumpAll()).toEqual(before);
  });

  it('leaves data untouched when the file is invalid', async () => {
    const app = await populated();
    const before = await app.repos.dumpAll();
    expect((await importJson(app, '{"app":"tameru","format":1,"tables":{"accounts":"x"}}')).ok).toBe(false);
    expect(await app.repos.dumpAll()).toEqual(before);
  });

  it('round-trips transactions through CSV into a fresh install', async () => {
    const app = await populated();
    const csv = await exportCsv(app);
    const balances = (await listAccounts(app)).map((v) => [v.account.name, v.balanceCents]);
    const fresh = await testApp('2026-10-15');
    for (const a of await app.repos.accounts.all()) await fresh.repos.accounts.put(a);
    const res = await importCsv(fresh, csv);
    expect(res.skipped).toEqual([]);
    expect((await listAccounts(fresh)).map((v) => [v.account.name, v.balanceCents])).toEqual(balances);
  });

  it('a transfer moves money but adds no spending', async () => {
    const app = await testApp();
    const a = await createAccount(app, { name: 'A', type: 'chequing', openingBalanceCents: 10000 });
    const b = await createAccount(app, { name: 'B', type: 'savings', openingBalanceCents: 0 });
    await transfer(app, a.id, b.id, 2500);
    const views = await listAccounts(app);
    expect(views.map((v) => v.balanceCents)).toEqual([7500, 2500]);
    const t = (await app.repos.transactions.all())[0]!;
    expect(t.categoryId).toBeUndefined();
  });
});
