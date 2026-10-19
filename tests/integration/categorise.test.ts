import { describe, expect, it } from 'vitest';
import { testApp } from '../helpers';
import { createAccount } from '../../src/services/accounts';
import { suggestFor } from '../../src/services/categorise';
import { detectedSuggestions, dismissDetection, acceptDetection } from '../../src/services/detection';
import { createRecurring } from '../../src/services/recurring';
import { addTransaction, recategorise } from '../../src/services/transactions';
import { seedSampleData } from '../../src/data/seed';

describe('categorisation learning', () => {
  it('learns a merchant and switches after two corrections', async () => {
    const app = await testApp();
    const chq = await createAccount(app, { name: 'Chq', type: 'chequing', openingBalanceCents: 100000 });
    await addTransaction(app, { amountCents: 500, merchant: 'SQ *Blue Door Cafe #12', categoryId: 'cat_eating_out', accountId: chq.id });
    expect((await suggestFor(app, { amountCents: 600, merchant: 'Blue Door Cafe', type: 'expense' })).categoryId).toBe('cat_eating_out');
    const a = await addTransaction(app, { amountCents: 600, merchant: 'Blue Door Cafe' });
    expect(a.categoryId).toBe('cat_eating_out');
    expect(a.needsReview).toBe(false); // came from a rule
    await recategorise(app, a.id, 'cat_groceries');
    expect((await suggestFor(app, { amountCents: 600, merchant: 'Blue Door Cafe', type: 'expense' })).categoryId).toBe('cat_eating_out');
    const b = await addTransaction(app, { amountCents: 700, merchant: 'Blue Door Cafe' });
    await recategorise(app, b.id, 'cat_groceries');
    expect((await suggestFor(app, { amountCents: 600, merchant: 'Blue Door Cafe', type: 'expense' })).categoryId).toBe('cat_groceries');
  });

  it('only needs an amount, and lists a bill’s assigned cards first', async () => {
    const app = await testApp();
    const chq = await createAccount(app, { name: 'Chq', type: 'chequing', openingBalanceCents: 100000 });
    const visa = await createAccount(app, { name: 'Visa', type: 'credit_card' });
    const mc = await createAccount(app, { name: 'MC', type: 'credit_card' });
    const t = await addTransaction(app, { amountCents: 1234 });
    expect(t.accountId).toBe(chq.id);
    await createRecurring(app, { name: 'Phone', kind: 'bill', amountCents: 4500, freq: 'monthly', nextDate: '2026-10-12', accountIds: [mc.id, visa.id], merchant: 'Fido' });
    const s = await suggestFor(app, { amountCents: 4500, merchant: 'FIDO', type: 'expense' });
    expect(s.accountId).toBe(mc.id);
    expect(s.preferredAccountIds).toEqual([mc.id, visa.id]);
  });

  it('suggests the seeded untracked subscription and never auto-creates', async () => {
    const app = await testApp('2026-10-18');
    await seedSampleData(app);
    const before = (await app.repos.recurring.all()).length;
    const s = await detectedSuggestions(app);
    const apple = s.find((d) => d.merchantKey === 'apple com bill');
    expect(apple).toMatchObject({ freq: 'monthly', amountCents: 399 });
    expect((await app.repos.recurring.all()).length).toBe(before);
    expect(s.some((d) => d.merchantKey === 'netflix' || d.merchantKey === 'tim hortons')).toBe(false);
    await dismissDetection(app, 'presto');
    await acceptDetection(app, apple!);
    const after = await detectedSuggestions(app);
    expect(after.some((d) => d.merchantKey === 'apple com bill' || d.merchantKey === 'presto')).toBe(false);
  });
});
