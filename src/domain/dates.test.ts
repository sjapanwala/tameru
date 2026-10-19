import { describe, expect, it } from 'vitest';
import * as D from './dates';

describe('dates', () => {
  it('adds days across month, year and DST boundaries', () => {
    expect(D.addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(D.addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(D.addDays('2026-03-08', 1)).toBe('2026-03-09'); // DST start in North America
    expect(D.addDays('2026-11-01', 1)).toBe('2026-11-02'); // DST end
    expect(D.addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('diffs days', () => {
    expect(D.diffDays('2026-01-01', '2026-12-31')).toBe(364);
    expect(D.diffDays('2028-01-01', '2028-12-31')).toBe(365);
    expect(D.diffDays('2026-02-10', '2026-02-01')).toBe(-9);
  });
  it('handles leap years', () => {
    expect(D.isLeapYear(2028)).toBe(true);
    expect(D.isLeapYear(2100)).toBe(false);
    expect(D.isLeapYear(2000)).toBe(true);
    expect(D.daysInMonth(2028, 2)).toBe(29);
    expect(D.daysInMonth(2027, 2)).toBe(28);
  });
  it('adds months with end-of-month clamping', () => {
    expect(D.addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(D.addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(D.addMonths('2026-03-31', 1)).toBe('2026-04-30');
    expect(D.addMonths('2026-02-28', 1, 31)).toBe('2026-03-31');
    expect(D.addMonths('2026-11-15', 3)).toBe('2027-02-15');
    expect(D.addMonths('2026-01-15', -2)).toBe('2025-11-15');
  });
  it('computes day of week', () => {
    expect(D.dayOfWeek('2026-10-18')).toBe(0); // Sunday
    expect(D.dayOfWeek('1970-01-01')).toBe(4);
  });
  it('validates and iterates', () => {
    expect(D.isLocalDate('2026-02-29')).toBe(false);
    expect(D.isLocalDate('2028-02-29')).toBe(true);
    expect(D.isLocalDate('2026-1-01')).toBe(false);
    expect(D.eachDay('2026-02-27', '2026-03-02')).toEqual(['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02']);
    expect(D.eachDay('2026-03-02', '2026-03-01')).toEqual([]);
  });
});
