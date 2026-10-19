import { describe, expect, it } from 'vitest';
import { entryDisplay, entryToCents, pressKey, type KeypadKey } from './amountEntry';

const type = (keys: KeypadKey[]) => keys.reduce(pressKey, '');

describe('keypad entry', () => {
  it('builds amounts without floats', () => {
    expect(type(['1', '2', '.', '5'])).toBe('12.5');
    expect(entryToCents('12.5')).toBe(1250);
    expect(entryToCents('19.99')).toBe(1999);
    expect(entryToCents('')).toBe(0);
  });
  it('allows one dot, two decimals, no leading zeros', () => {
    expect(type(['.', '.', '5'])).toBe('0.5');
    expect(type(['1', '.', '2', '3', '4'])).toBe('1.23');
    expect(type(['0', '0', '7'])).toBe('7');
    expect(type(['9', '9', '9', '9', '9', '9', '9', '9'])).toBe('9999999');
  });
  it('backspaces', () => {
    expect(type(['1', '.', '5', 'back', 'back'])).toBe('1');
    expect(pressKey('', 'back')).toBe('');
  });
  it('formats for display', () => {
    expect(entryDisplay('1234567')).toEqual({ whole: '1,234,567', frac: null });
    expect(entryDisplay('12.')).toEqual({ whole: '12', frac: '.' });
    expect(entryDisplay('')).toEqual({ whole: '0', frac: null });
  });
});
