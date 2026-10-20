import { describe, expect, it } from 'vitest';
import { buildCalendar, escapeText, fold, rrule } from './ics';

describe('calendar files', () => {
  it('turns schedules into repeat rules, keeping the app’s end-of-month behaviour', () => {
    expect(rrule({ freq: 'weekly', anchor: '2026-10-02' })).toBe('FREQ=WEEKLY');
    expect(rrule({ freq: 'biweekly', anchor: '2026-10-02' })).toBe('FREQ=WEEKLY;INTERVAL=2');
    expect(rrule({ freq: 'semimonthly', days: [30, 15] })).toBe('FREQ=MONTHLY;BYMONTHDAY=15,30');
    expect(rrule({ freq: 'monthly', day: 1 })).toBe('FREQ=MONTHLY;BYMONTHDAY=1');
    expect(rrule({ freq: 'monthly', day: 30 })).toBe('FREQ=MONTHLY;BYMONTHDAY=28,29,30;BYSETPOS=-1'); // Feb → 28th/29th
    expect(rrule({ freq: 'monthly', day: 31 }, '2027-06-30')).toBe('FREQ=MONTHLY;BYMONTHDAY=28,29,30,31;BYSETPOS=-1;UNTIL=20270630');
    expect(rrule({ freq: 'yearly', month: 3, day: 14 })).toBe('FREQ=YEARLY;BYMONTH=3;BYMONTHDAY=14');
    expect(rrule({ freq: 'irregular' })).toBeUndefined();
  });

  it('escapes text and folds long lines', () => {
    expect(escapeText('Rent, hydro; misc\nnote')).toBe('Rent\\, hydro\; misc\\nnote');
    const long = `SUMMARY:${'x'.repeat(100)}`;
    const folded = fold(long);
    expect(folded.split('\r\n ').every((l, i) => new TextEncoder().encode(l).length <= (i ? 74 : 75))).toBe(true);
    expect(folded.replace(/\r\n /g, '')).toBe(long);
  });

  it('builds a valid file: all-day repeating events with a reminder the day before at 9', () => {
    const ics = buildCalendar(
      [
        { uid: 'r1@tameru', title: 'Rent · $850.00', start: '2026-11-01', repeat: { freq: 'monthly', day: 1 }, remindDaysBefore: 1, remindAtHour: 9 },
        { uid: 'x@tameru', title: 'Tips', start: '2026-11-01', repeat: { freq: 'irregular' }, remindDaysBefore: 1, remindAtHour: 9 },
        { uid: 'p@tameru', title: 'Payday', start: '2026-10-23', remindDaysBefore: 0, remindAtHour: 9 },
      ],
      new Date('2026-10-19T12:00:00Z'),
    );
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('DTSTART;VALUE=DATE:20261101\r\nRRULE:FREQ=MONTHLY;BYMONTHDAY=1\r\nSUMMARY:Rent · $850.00');
    expect(ics).toContain('TRIGGER:-PT15H'); // 9:00 the day before a midnight start
    expect(ics).toContain('TRIGGER:PT9H'); // 9:00 on the day
    expect(ics).toContain('DTSTAMP:20261019T120000Z');
    expect(ics).not.toContain('Tips'); // irregular items can't repeat in a calendar
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
  });
});
