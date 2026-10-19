import { describe, expect, it } from 'vitest';
import { daysLeft, nextPeriod, periodFor, periodsBetween, previousPeriod } from './period';

describe('periods', () => {
  it('calendar months', () => {
    expect(periodFor({ kind: 'monthly', startDay: 1 }, '2026-02-14')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    expect(periodFor({ kind: 'monthly', startDay: 1 }, '2028-02-29')).toEqual({ start: '2028-02-01', end: '2028-02-29' });
  });
  it('monthly from a start day, across year ends', () => {
    const c = { kind: 'monthly' as const, startDay: 15 };
    expect(periodFor(c, '2026-01-10')).toEqual({ start: '2025-12-15', end: '2026-01-14' });
    expect(periodFor(c, '2026-01-15')).toEqual({ start: '2026-01-15', end: '2026-02-14' });
    expect(nextPeriod(c, periodFor(c, '2026-12-20'))).toEqual({ start: '2027-01-15', end: '2027-02-14' });
    expect(previousPeriod(c, periodFor(c, '2026-01-20'))).toEqual({ start: '2025-12-15', end: '2026-01-14' });
  });
  it('payday-aligned periods', () => {
    const s = { freq: 'biweekly' as const, anchor: '2026-01-02' };
    expect(periodFor({ kind: 'payday', recurringId: 'p' }, '2026-01-20', s)).toEqual({ start: '2026-01-16', end: '2026-01-29' });
    expect(periodFor({ kind: 'payday', recurringId: 'p' }, '2026-01-16', s)).toEqual({ start: '2026-01-16', end: '2026-01-29' });
    const semi = { freq: 'semimonthly' as const, days: [1, 15] as [number, number] };
    expect(periodFor({ kind: 'payday', recurringId: 'p' }, '2026-02-20', semi)).toEqual({ start: '2026-02-15', end: '2026-02-28' });
    // irregular pay falls back to calendar months
    expect(periodFor({ kind: 'payday', recurringId: 'p' }, '2026-02-20', { freq: 'irregular' })).toEqual({ start: '2026-02-01', end: '2026-02-28' });
  });
  it('lists periods and days left', () => {
    expect(periodsBetween({ kind: 'monthly', startDay: 1 }, '2026-01-20', '2026-03-01').map((p) => p.start)).toEqual(['2026-01-01', '2026-02-01', '2026-03-01']);
    expect(daysLeft({ start: '2026-02-01', end: '2026-02-28' }, '2026-02-28')).toBe(1);
    expect(daysLeft({ start: '2026-02-01', end: '2026-02-28' }, '2026-02-01')).toBe(28);
  });
});
