import { describe, expect, it } from 'vitest';
import { centsToEntry, entryToCents, pressKey, type PadKey } from './amountEntry';
import { currencySymbol, formatMoney, minorUnitDigits, parseMoneyInput } from './money';

const type = (keys: string, decimals = 2) =>
  [...keys].reduce((entry, k) => pressKey(entry, (k === '<' ? 'back' : k) as PadKey, decimals), '');

describe('formatMoney', () => {
  it('formats integer cents as currency', () => {
    expect(formatMoney(123456, 'CAD', { locale: 'en-CA' })).toBe('$1,234.56');
    expect(formatMoney(5, 'CAD', { locale: 'en-CA' })).toBe('$0.05');
    expect(formatMoney(-450, 'CAD', { locale: 'en-CA' })).toBe('-$4.50');
  });

  it('shows explicit signs when asked', () => {
    expect(formatMoney(120000, 'CAD', { locale: 'en-CA', signed: true })).toBe('+$1,200.00');
    expect(formatMoney(0, 'CAD', { locale: 'en-CA', signed: true })).toBe('$0.00');
  });

  it('respects currencies without minor units', () => {
    expect(minorUnitDigits('JPY')).toBe(0);
    expect(formatMoney(1200, 'JPY', { locale: 'en-CA' })).toMatch(/1,200$/);
  });

  it('exposes the currency symbol', () => {
    expect(currencySymbol('CAD', 'en-CA')).toBe('$');
    expect(currencySymbol('EUR', 'en-CA')).toBe('€');
  });
});

describe('parseMoneyInput', () => {
  it.each([
    ['12', 1200],
    ['12.5', 1250],
    ['12.50', 1250],
    ['$1,234.56', 123456],
    ['0.07', 7],
    ['.5', 50],
    ['12,5', 1250],
    ['1,234', 123400],
    ['-20', -2000],
    ['19.999', 1999],
  ])('%s -> %i', (text, cents) => {
    expect(parseMoneyInput(text, 'CAD')).toBe(cents);
  });

  it('avoids float rounding', () => {
    expect(parseMoneyInput('0.29', 'CAD')).toBe(29);
    expect(parseMoneyInput('1.15', 'CAD')).toBe(115);
  });

  it('rejects non-numbers', () => {
    expect(parseMoneyInput('', 'CAD')).toBeNull();
    expect(parseMoneyInput('abc', 'CAD')).toBeNull();
    expect(parseMoneyInput('1.2.3', 'CAD')).toBeNull();
  });

  it('handles zero-decimal currencies', () => {
    expect(parseMoneyInput('1200', 'JPY')).toBe(1200);
  });
});

describe('number pad entry', () => {
  it('builds an amount digit by digit', () => {
    expect(type('1250')).toBe('1250');
    expect(type('12.5')).toBe('12.5');
    expect(entryToCents(type('12.5'))).toBe(1250);
    expect(entryToCents(type('4.75'))).toBe(475);
  });

  it('limits decimals and ignores a second point', () => {
    expect(type('1.234')).toBe('1.23');
    expect(type('1..2')).toBe('1.2');
  });

  it('starts a bare point with a zero and drops leading zeros', () => {
    expect(type('.5')).toBe('0.5');
    expect(type('007')).toBe('7');
    expect(type('0.07')).toBe('0.07');
  });

  it('backspaces one keystroke at a time', () => {
    expect(type('12.5<')).toBe('12.');
    expect(type('12.5<<')).toBe('12');
    expect(type('<')).toBe('');
  });

  it('caps the whole part', () => {
    expect(type('123456789')).toBe('1234567');
  });

  it('supports zero-decimal currencies', () => {
    expect(type('12.5', 0)).toBe('125');
    expect(entryToCents('125', 0)).toBe(125);
  });

  it('treats an empty or partial entry as a number', () => {
    expect(entryToCents('')).toBe(0);
    expect(entryToCents('3.')).toBe(300);
  });

  it('round-trips cents to an entry', () => {
    expect(centsToEntry(-1250)).toBe('12.50');
    expect(centsToEntry(1200)).toBe('12');
    expect(centsToEntry(7)).toBe('0.07');
    expect(centsToEntry(0)).toBe('');
    expect(entryToCents(centsToEntry(123456))).toBe(123456);
  });
});
