import { describe, expect, it } from 'vitest';
import { account } from '../../tests/factories';
import { moveInList, reorderSubset, sortAccounts } from './accountOrder';

const chq = account({ id: 'chq', type: 'chequing', createdAt: '2026-01-01' });
const sav = account({ id: 'sav', type: 'savings', createdAt: '2026-01-02' });
const visa = account({ id: 'visa', type: 'credit_card', createdAt: '2026-01-03' });
const mc = account({ id: 'mc', type: 'credit_card', createdAt: '2026-01-04' });

describe('account order', () => {
  it('defaults to cards, then chequing, savings…, then creation', () => {
    expect(sortAccounts([chq, sav, mc, visa]).map((a) => a.id)).toEqual(['visa', 'mc', 'chq', 'sav']);
  });
  it('uses the saved order once there is one', () => {
    expect(sortAccounts([{ ...chq, sortOrder: 0 }, { ...visa, sortOrder: 1 }, sav]).map((a) => a.id)).toEqual(['chq', 'visa', 'sav']);
  });
  it('reorders a subset in place and leaves the rest alone', () => {
    // wallet = cards + chequing; savings stays last
    const order = reorderSubset([chq, sav, visa, mc], ['chq', 'mc', 'visa']);
    const resorted = sortAccounts([chq, sav, visa, mc].map((a) => ({ ...a, sortOrder: order.get(a.id) })));
    expect(resorted.map((a) => a.id)).toEqual(['chq', 'mc', 'visa', 'sav']);
  });
  it('moves one place at a time and stays in bounds', () => {
    expect(moveInList(['a', 'b', 'c'], 'c', -1)).toEqual(['a', 'c', 'b']);
    expect(moveInList(['a', 'b', 'c'], 'a', -1)).toEqual(['a', 'b', 'c']);
    expect(moveInList(['a', 'b', 'c'], 'x', 1)).toEqual(['a', 'b', 'c']);
  });
});
