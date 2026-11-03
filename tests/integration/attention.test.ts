import { describe, expect, it } from 'vitest';
import { testApp } from '../helpers';
import { createAccount } from '../../src/services/accounts';
import { hasNewAttention, markAttentionSeen } from '../../src/services/attention';
import { runAutomations } from '../../src/services/automation';
import { createRecurring } from '../../src/services/recurring';
import { confirmTransaction } from '../../src/services/transactions';

describe("Home's bell dot", () => {
  it('stays off when nothing needs a look, even with bills later this week', async () => {
    const app = await testApp('2026-03-01');
    const chq = await createAccount(app, { name: 'Chq', type: 'chequing', openingBalanceCents: 200000 });
    await createRecurring(app, { name: 'Phone', kind: 'bill', amountCents: 4500, freq: 'monthly', nextDate: '2026-03-06', accountIds: [chq.id] });
    expect(await hasNewAttention(app)).toBe(false);
  });

  it('lights for a bill due tomorrow, clears once Upcoming is opened, and returns for the next one', async () => {
    const app = await testApp('2026-03-01');
    const chq = await createAccount(app, { name: 'Chq', type: 'chequing', openingBalanceCents: 200000 });
    await createRecurring(app, { name: 'Phone', kind: 'bill', amountCents: 4500, freq: 'monthly', nextDate: '2026-03-02', accountIds: [chq.id] });
    expect(await hasNewAttention(app)).toBe(true);
    await markAttentionSeen(app); // opened Upcoming
    expect(await hasNewAttention(app)).toBe(false);
    // next month's phone bill coming due tomorrow is new again
    app.clock.set('2026-04-01');
    await runAutomations(app);
    for (const t of await app.repos.transactions.all()) if (t.status === 'pending') await confirmTransaction(app, t.id);
    expect(await hasNewAttention(app)).toBe(true);
  });

  it('lights for an entry waiting to be confirmed until Upcoming is opened', async () => {
    const app = await testApp('2026-03-01');
    const chq = await createAccount(app, { name: 'Chq', type: 'chequing', openingBalanceCents: 200000 });
    await createRecurring(app, { name: 'Rent', kind: 'bill', amountCents: 95000, freq: 'monthly', nextDate: '2026-03-01', accountIds: [chq.id] });
    await runAutomations(app); // posts today's rent as pending
    expect((await app.repos.transactions.all()).some((t) => t.status === 'pending')).toBe(true);
    expect(await hasNewAttention(app)).toBe(true);
    await markAttentionSeen(app);
    expect(await hasNewAttention(app)).toBe(false);
  });
});
