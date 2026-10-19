import { describe, expect, it } from 'vitest';
import { testApp } from '../helpers';
import { createAccount, listAccounts, updateAccount } from '../../src/services/accounts';
import { runAutomations } from '../../src/services/automation';
import { createRecurring } from '../../src/services/recurring';
import { deleteTransaction } from '../../src/services/transactions';

describe('automations', () => {
  it('materialises recurring items idempotently, and skipped ones stay skipped', async () => {
    const app = await testApp('2026-01-01');
    const chq = await createAccount(app, { name: 'Chq', type: 'chequing', openingBalanceCents: 200000 });
    await createRecurring(app, { name: 'Rent', kind: 'bill', amountCents: 95000, freq: 'monthly', nextDate: '2026-01-01', accountIds: [chq.id] });
    app.clock.set('2026-03-15');
    expect((await runAutomations(app)).recurring).toBe(3);
    expect((await runAutomations(app)).recurring).toBe(0);
    const txs = await app.repos.transactions.all();
    expect(txs.map((t) => t.status)).toEqual(['pending', 'pending', 'pending']);
    await deleteTransaction(app, txs[0]!.id);
    expect((await runAutomations(app)).recurring).toBe(0);
  });

  it('generates card fees through the same engine and follows fee changes', async () => {
    const app = await testApp('2026-01-10');
    const card = await createAccount(app, { name: 'Visa', type: 'credit_card', card: { monthlyFeeCents: 499, statementDay: 15, dueDay: 5 } });
    app.clock.set('2026-03-20');
    await runAutomations(app);
    let fees = (await app.repos.transactions.all()).filter((t) => t.accountId === card.id);
    expect(fees.map((t) => [t.date, t.amountCents, t.status])).toEqual([
      ['2026-01-15', 499, 'posted'], ['2026-02-15', 499, 'posted'], ['2026-03-15', 499, 'posted'],
    ]);
    expect((await listAccounts(app))[0]!.owingCents).toBe(1497);
    await updateAccount(app, card.id, { card: { ...card.card!, monthlyFeeCents: 0 } });
    app.clock.set('2026-05-20');
    await runAutomations(app);
    fees = (await app.repos.transactions.all()).filter((t) => t.accountId === card.id);
    expect(fees).toHaveLength(3);
  });

  it('posts savings interest monthly and only once', async () => {
    const app = await testApp('2026-01-01');
    await createAccount(app, { name: 'HISA', type: 'savings', openingBalanceCents: 1_000_000, interest: { rateBps: 400, kind: 'apy', compounding: 'monthly' } });
    app.clock.set('2027-01-01');
    expect((await runAutomations(app)).interest).toBe(12);
    expect((await runAutomations(app)).interest).toBe(0);
    const v = (await listAccounts(app))[0]!;
    expect(Math.abs(v.balanceCents - 1_040_000)).toBeLessThanOrEqual(1);
    expect(v.interestEarnedCents).toBe(v.balanceCents - 1_000_000);
  });
});
