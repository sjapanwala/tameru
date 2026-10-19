import { describe, expect, it } from 'vitest';
import { testApp } from '../helpers';
import { createAccount, listAccounts, moveAccount, orderedAccounts, reorderAccounts } from '../../src/services/accounts';

describe('rearranging accounts', () => {
  it('keeps a saved order everywhere and moves one at a time', async () => {
    const app = await testApp();
    const chq = await createAccount(app, { name: 'Chq', type: 'chequing' });
    const sav = await createAccount(app, { name: 'Sav', type: 'savings' });
    const visa = await createAccount(app, { name: 'Visa', type: 'credit_card' });
    const mc = await createAccount(app, { name: 'MC', type: 'credit_card' });
    expect((await orderedAccounts(app)).map((a) => a.name)).toEqual(['Visa', 'MC', 'Chq', 'Sav']);

    await reorderAccounts(app, [chq.id, mc.id, visa.id]); // the wallet's cards, rearranged
    expect((await listAccounts(app)).map((v) => v.account.name)).toEqual(['Chq', 'MC', 'Visa', 'Sav']);

    await moveAccount(app, sav.id, -1);
    expect((await orderedAccounts(app)).map((a) => a.name)).toEqual(['Chq', 'MC', 'Sav', 'Visa']);
    await moveAccount(app, chq.id, -1); // already first: no change
    expect((await orderedAccounts(app)).map((a) => a.name)).toEqual(['Chq', 'MC', 'Sav', 'Visa']);
  });
});
