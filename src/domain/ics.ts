// Calendar files (iCalendar, RFC 5545) for bills, subscriptions, paydays and card due
// dates, so the phone's calendar can remind the user. Pure: events in, file text out.

import type { LocalDate, Schedule } from './types';

export interface CalendarEvent {
  uid: string; // stable, so re-adding updates rather than duplicates in most calendars
  title: string;
  description?: string;
  start: LocalDate; // first occurrence (all-day)
  repeat?: Schedule; // absent = a one-off event
  until?: LocalDate;
  remindDaysBefore: number; // 0 = on the day
  remindAtHour: number; // local hour for the reminder
}

/** RFC 5545 RRULE for a schedule; undefined for schedules a calendar can't repeat (irregular). */
export function rrule(s: Schedule, until?: LocalDate): string | undefined {
  const end = until ? `;UNTIL=${until.replace(/-/g, '')}` : '';
  switch (s.freq) {
    case 'weekly':
      return `FREQ=WEEKLY${end}`;
    case 'biweekly':
      return `FREQ=WEEKLY;INTERVAL=2${end}`;
    case 'semimonthly':
      return `FREQ=MONTHLY;BYMONTHDAY=${[...s.days].sort((a, b) => a - b).join(',')}${end}`;
    case 'monthly':
      // Days 29–31 fall on the last day of shorter months, as in the app.
      return s.day <= 28 ? `FREQ=MONTHLY;BYMONTHDAY=${s.day}${end}` : `FREQ=MONTHLY;BYMONTHDAY=${Array.from({ length: s.day - 27 }, (_, i) => 28 + i).join(',')};BYSETPOS=-1${end}`;
    case 'yearly':
      return `FREQ=YEARLY;BYMONTH=${s.month};BYMONTHDAY=${s.day}${end}`;
    case 'irregular':
      return undefined;
  }
}

/** Escape TEXT values (backslash, comma, semicolon, newline). */
export const escapeText = (s: string): string => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Fold lines longer than 75 octets (continuation lines start with a space). */
export function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let cur = '';
  let curLen = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (curLen + n > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = '';
      curLen = 0;
    }
    cur += ch;
    curLen += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

const stamp = (now: Date) => now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** A complete .ics file. All-day events; each reminder fires `remindDaysBefore` days ahead at `remindAtHour`. */
export function buildCalendar(events: readonly CalendarEvent[], now: Date, name = 'Tameru'): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Tameru//Budget reminders//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${escapeText(name)}`];
  for (const e of events) {
    const rule = e.repeat ? rrule(e.repeat, e.until) : undefined;
    if (e.repeat && !rule) continue; // irregular: nothing a calendar can repeat
    // All-day events start at midnight, so "N days before at H:00" is (24N − H) hours earlier.
    const hoursBefore = e.remindDaysBefore * 24 - e.remindAtHour;
    const trigger = hoursBefore >= 0 ? `-PT${hoursBefore}H` : `PT${-hoursBefore}H`;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART;VALUE=DATE:${e.start.replace(/-/g, '')}`,
      ...(rule ? [`RRULE:${rule}`] : []),
      `SUMMARY:${escapeText(e.title)}`,
      ...(e.description ? [`DESCRIPTION:${escapeText(e.description)}`] : []),
      'TRANSP:TRANSPARENT', // reminders, not busy time
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeText(e.title)}`,
      `TRIGGER:${trigger}`,
      'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
