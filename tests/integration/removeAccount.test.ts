import { describe, expect, it } from 'vitest';
import { testApp } from '../helpers';
import { createAccount, listAccounts, removeAccount, restoreAccount } from '../../src/services/accounts';
import { runAutomations } from '../../src/services/automation';
import { safeToSpendNow } from '../../src/services/home';
import { saveQuick } from '../../src/services/quick';
import { createRecurring } from '../../src/services/recurring';
import { addTransaction } from '../../src/services/transactions';

describe('removing an account', () => {
  it('hides it, keeps history, stops its fee and bills, and undoes cleanly', async () => {
    const app = await testApp('2026-10-01');
    const chq = await createAccount(app, { name: 'Chq', type: 'chequing', openingBalanceCents: 100000 });
    const card = await createAccount(app, { name: 'Visa', type: 'credit_card', card: { monthlyFeeCents: 499, statementDay: 5, dueDay: 28 } });
    await createRecurring(app, { name: 'Phone', kind: 'bill', amountCents: 4500, freq: 'monthly', nextDate: '2026-10-12', accountIds: [card.id] });
    const past = await addTransaction(app, { amountCents: 2000, accountId: card.id, categoryId: 'cat_fun' });
    const q = await saveQuick(app, { slot: 0, label: 'Coffee', icon: 'coffee', amountCents: 300, accountId: card.id });

    const removed = await removeAccount(app, card.id);
    expect((await listAccounts(app)).map((v) => v.account.id)).toEqual([chq.id]);
    expect(await app.repos.transactions.get(past.id)).toBeDefined(); // history kept
    expect((await app.repos.quickActions.get(q.id))?.accountId).toBe('ask');
    const fee = (await app.repos.recurring.all()).find((r) => r.system?.kind === 'card_fee');
    expect(fee?.archived).toBe(true);

    app.clock.set('2026-11-20');
    await runAutomations(app);
    expect((await app.repos.transactions.all()).filter((t) => t.accountId === card.id)).toHaveLength(1);
    expect((await safeToSpendNow(app)).breakdown.cardsOwingCents).toBe(0);

    await restoreAccount(app, removed);
    expect((await listAccounts(app)).map((v) => v.account.id)).toEqual([card.id, chq.id]); // cards come first by default
    expect((await app.repos.quickActions.get(q.id))?.accountId).toBe(card.id);
    expect((await app.repos.recurring.all()).find((r) => r.system?.kind === 'card_fee')?.archived).toBe(false);
  });
});
