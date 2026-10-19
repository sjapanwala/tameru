import { describe, expect, it } from 'vitest';
import { allocate, centsToDecimal, formatCents, mulDiv, parseCents, sum } from './money';

describe('money', () => {
  it('parses amounts without floats', () => {
    expect(parseCents('12')).toBe(1200);
    expect(parseCents('12.5')).toBe(1250);
    expect(parseCents('0.07')).toBe(7);
    expect(parseCents('$1,234.56')).toBe(123456);
    expect(parseCents('-3.10')).toBe(-310);
    expect(parseCents('.5')).toBe(50);
    expect(parseCents('19.99')).toBe(1999); // 19.99*100 = 1998.9999 as a float
    expect(parseCents('')).toBeNull();
    expect(parseCents('abc')).toBeNull();
    expect(parseCents('1.234')).toBeNull();
  });
  it('formats', () => {
    expect(formatCents(123456)).toBe('$1,234.56');
    expect(formatCents(-5)).toMatch(/-\$0\.05|\(\$0\.05\)/);
    expect(centsToDecimal(-123456)).toBe('-1234.56');
    expect(centsToDecimal(7)).toBe('0.07');
  });
  it('allocates exactly', () => {
    const parts = allocate(1000, [1, 1, 1]);
    expect(sum(parts)).toBe(1000);
    expect(parts.every(Number.isInteger)).toBe(true);
    expect(allocate(100, [0, 0])).toEqual([100, 0]);
    expect(allocate(10, [3, 1])).toEqual([8, 2]);
  });
  it('mulDiv rounds to integer cents', () => {
    expect(mulDiv(1000, 26, 12)).toBe(2167);
    expect(mulDiv(-1000, 1, 3)).toBe(-333);
  });
});
