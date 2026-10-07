import { describe, expect, it } from 'vitest';
import { cleanMerchant, matchRule, merchantKey, resolveMerchant, suggestRule } from './merchant';

const rule = (
  pattern: string,
  cleanName: string,
  categoryId: string,
  updatedAt = '2026-01-01',
) => ({
  pattern,
  cleanName,
  categoryId,
  updatedAt,
});

describe('cleanMerchant', () => {
  it.each([
    ['SQ *JOES COFFEE 4412', "Joe's Coffee"],
    ['SQ*JOES COFFEE', "Joe's Coffee"],
    ['TST* BLUE DOOR BAKERY #0921', 'Blue Door Bakery'],
    ['PAYPAL *SPOTIFY', 'Spotify'],
    ['AMZN Mktp CA*2K4RT9XX0', 'Amazon'],
    ['AMZN MKTP CA*2K4RT9XX0', 'Amazon'],
    ['AMAZON.CA*AB12CD345', 'Amazon'],
    ['UBER *EATS PENDING', 'Uber Eats'],
    ['UBER *TRIP HELP.UBER.COM', 'Uber'],
    ['TIM HORTONS #1234 TORONTO ON', 'Tim Hortons'],
    ['LOBLAWS 1042 TORONTO ON CA', 'Loblaws Toronto'],
    ['NETFLIX.COM', 'Netflix'],
    ['MCDONALDS 40211', "McDonald's"],
    ['LCBO/RAO #0511', 'Lcbo/rao'],
    ['POS PURCHASE - SHOPPERS DRUG MART 0812', 'Shoppers Drug Mart'],
    ['INTERAC PURCHASE 5521 NO FRILLS', 'No Frills'],
    ['MCGILL BOOKSTORE', 'McGill Bookstore'],
    ["O'REILLY AUTO PARTS", "O'Reilly Auto Parts"],
    ['BANK OF THE WEST', 'Bank of the West'],
    ['TTC PRESTO RELOAD', 'TTC Presto Reload'],
  ])('%s -> %s', (raw, expected) => {
    expect(cleanMerchant(raw)).toBe(expected);
  });

  it('title-cases all-lowercase typing', () => {
    expect(cleanMerchant('joes coffee')).toBe("Joe's Coffee");
  });

  it('leaves mixed-case typing alone', () => {
    expect(cleanMerchant("Joe's Coffee")).toBe("Joe's Coffee");
    expect(cleanMerchant('iHerb')).toBe('iHerb');
    expect(cleanMerchant('Amazon Prime')).toBe('Amazon Prime');
    expect(cleanMerchant('Pizza On Main')).toBe('Pizza On Main');
  });

  it('keeps short numbers that are part of a name', () => {
    expect(cleanMerchant('Studio 54')).toBe('Studio 54');
    expect(cleanMerchant('7 ELEVEN')).toBe('7 Eleven');
  });

  it('collapses whitespace and still strips processor prefixes from mixed case', () => {
    expect(cleanMerchant("  SQ *Joe's   Coffee ")).toBe("Joe's Coffee");
  });

  it('never returns an empty string for non-empty input', () => {
    expect(cleanMerchant('#1234')).toBe('#1234');
    expect(cleanMerchant('')).toBe('');
  });
});

describe('merchantKey', () => {
  it('normalises case, apostrophes, accents and punctuation', () => {
    expect(merchantKey("Joe's Coffee")).toBe('joes coffee');
    expect(merchantKey('JOES  COFFEE!')).toBe('joes coffee');
    expect(merchantKey('Café Olé')).toBe('cafe ole');
    expect(merchantKey('A&W')).toBe('a w');
  });

  it('keeps non-latin names', () => {
    expect(merchantKey('セブン-イレブン')).not.toBe('');
  });
});

describe('matchRule', () => {
  const rules = [
    rule('joes coffee', "Joe's Coffee", 'dining'),
    rule('uber', 'Uber', 'transport'),
    rule('uber eats', 'Uber Eats', 'dining'),
  ];

  it('matches on the exact key', () => {
    expect(matchRule("Joe's Coffee", rules)?.categoryId).toBe('dining');
  });

  it('matches a prefix only at a word boundary', () => {
    expect(matchRule("Joe's Coffee Downtown", rules)?.categoryId).toBe('dining');
    expect(matchRule('Uberrima', rules)).toBeNull();
  });

  it('prefers the longest pattern', () => {
    expect(matchRule('Uber Eats', rules)?.categoryId).toBe('dining');
    expect(matchRule('Uber', rules)?.categoryId).toBe('transport');
  });

  it('breaks ties with the most recently updated rule', () => {
    const dupes = [
      rule('uber', 'Uber', 'old', '2026-01-01'),
      rule('uber', 'Uber', 'new', '2026-02-01'),
    ];
    expect(matchRule('Uber', dupes)?.categoryId).toBe('new');
  });

  it('returns null for empty input or no match', () => {
    expect(matchRule('', rules)).toBeNull();
    expect(matchRule('Costco', rules)).toBeNull();
  });
});

describe('resolveMerchant', () => {
  const rules = [rule('joes coffee', "Joe's Coffee", 'dining')];

  it('cleans the descriptor and fills the category from a rule', () => {
    expect(resolveMerchant('SQ *JOES COFFEE 4412', rules)).toMatchObject({
      merchant: "Joe's Coffee",
      categoryId: 'dining',
    });
  });

  it('uses the rule clean name', () => {
    const custom = [rule('joes coffee', 'Joe’s (work)', 'dining')];
    expect(resolveMerchant('SQ *JOES COFFEE 4412', custom).merchant).toBe('Joe’s (work)');
  });

  it('returns no category without a rule', () => {
    expect(resolveMerchant('COSTCO WHOLESALE W1234', rules)).toEqual({
      merchant: 'Costco Wholesale',
      categoryId: null,
      rule: null,
    });
  });

  it('handles blank input', () => {
    expect(resolveMerchant('   ', rules)).toEqual({ merchant: '', categoryId: null, rule: null });
  });
});

describe('suggestRule', () => {
  const rules = [rule('joes coffee', "Joe's Coffee", 'dining')];

  it('offers a rule for a merchant that has none', () => {
    expect(suggestRule('Costco Wholesale', 'groceries', rules)).toEqual({
      pattern: 'costco wholesale',
      cleanName: 'Costco Wholesale',
      categoryId: 'groceries',
    });
  });

  it('offers a rule when the category differs from the existing rule', () => {
    expect(suggestRule("Joe's Coffee", 'fun', rules)?.categoryId).toBe('fun');
  });

  it('stays quiet when a rule already agrees', () => {
    expect(suggestRule("Joe's Coffee", 'dining', rules)).toBeNull();
  });

  it('stays quiet without a merchant or category', () => {
    expect(suggestRule('', 'dining', rules)).toBeNull();
    expect(suggestRule('Costco', null, rules)).toBeNull();
  });
});
