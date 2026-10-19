import { describe, expect, it } from 'vitest';
import { tx } from '../../tests/factories';
import { learn, suggestCategory, type RuleState } from './categorise';
import type { MerchantRule } from './types';

const rule = (merchantKey: string, categoryId: string): MerchantRule => ({ id: merchantKey, createdAt: '', updatedAt: '', merchantKey, categoryId, confirmations: 1, pendingCount: 0 });
const at = (h: number) => new Date(2026, 0, 10, h, 0).toISOString();

describe('suggestCategory', () => {
  const rules = [rule('tim hortons', 'coffee'), rule('loblaws', 'groc')];
  it('exact rule first, then fuzzy', () => {
    expect(suggestCategory({ merchantKey: 'loblaws', amountCents: 100, hour: 12 }, rules, [])).toEqual({ categoryId: 'groc', source: 'rule' });
    expect(suggestCategory({ merchantKey: 'tim hortons dt', amountCents: 100, hour: 12 }, rules, [])).toEqual({ categoryId: 'coffee', source: 'fuzzy' });
  });
  it('then similar amount at a similar time of day', () => {
    const hist = [
      tx({ categoryId: 'lunch', amountCents: 1500, enteredAt: at(12) }),
      tx({ categoryId: 'lunch', amountCents: 1300, enteredAt: at(13) }),
      tx({ categoryId: 'fun', amountCents: 1400, enteredAt: at(21), createdAt: '2026-02-01' }),
    ];
    expect(suggestCategory({ merchantKey: 'new place', amountCents: 1400, hour: 12 }, rules, hist)).toEqual({ categoryId: 'lunch', source: 'pattern' });
    // no pattern match → last used
    expect(suggestCategory({ amountCents: 99999, hour: 3 }, [], hist)).toEqual({ categoryId: 'fun', source: 'last' });
    expect(suggestCategory({ amountCents: 100, hour: 3 }, [], [])).toEqual({ source: 'none' });
  });
});

describe('learn', () => {
  it('creates a rule on first choice', () => {
    expect(learn(undefined, 'k', 'a')).toEqual({ merchantKey: 'k', categoryId: 'a', confirmations: 1, pendingCount: 0 });
  });
  it('switches only after two consistent corrections', () => {
    let r: RuleState = learn(undefined, 'k', 'a');
    r = learn(r, 'k', 'b');
    expect(r.categoryId).toBe('a');
    expect(r).toMatchObject({ pendingCategoryId: 'b', pendingCount: 1 });
    r = learn(r, 'k', 'b');
    expect(r.categoryId).toBe('b');
    expect(r.pendingCategoryId).toBeUndefined();
  });
  it('inconsistent corrections do not switch; confirming resets pending', () => {
    let r: RuleState = learn(undefined, 'k', 'a');
    r = learn(learn(r, 'k', 'b'), 'k', 'c');
    expect(r).toMatchObject({ categoryId: 'a', pendingCategoryId: 'c', pendingCount: 1 });
    r = learn(r, 'k', 'a');
    expect(r).toMatchObject({ categoryId: 'a', confirmations: 2, pendingCount: 0 });
  });
});
