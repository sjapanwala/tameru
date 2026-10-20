// Turning calendar items into a file the phone's calendar opens, or a Google Calendar link.

import { S } from '../copy/strings';
import { buildCalendar, rrule, type CalendarEvent } from '../domain/ics';
import { calendarItems, type CalendarItem } from '../services/calendar';
import type { AppContext } from '../services/context';
import { download } from './components';

/** Bills a day ahead, card payments two days ahead (time to move money), paydays on the day; all at 9:00. */
function toEvent(i: CalendarItem): CalendarEvent {
  const title = i.kind === 'income' ? S.calendar.payday(i.name) : i.kind === 'card' ? S.calendar.cardDue(i.name) : S.calendar.bill(i.name, i.amountCents ?? 0);
  return {
    uid: `${i.kind === 'card' ? 'card' : 'rec'}-${i.id}@tameru`,
    title,
    description: S.calendar.description,
    start: i.start,
    repeat: i.repeat,
    ...(i.until ? { until: i.until } : {}),
    remindDaysBefore: i.kind === 'income' ? 0 : i.kind === 'card' ? 2 : 1,
    remindAtHour: 9,
  };
}

/** Save an .ics file; on iPhone, opening it offers "Add to Calendar". */
export function saveToCalendar(items: CalendarItem[], filename = 'tameru-reminders.ics'): void {
  download(filename, buildCalendar(items.map(toEvent), new Date()), 'text/calendar');
}

/** A Google Calendar "add event" link for one item (opens in the browser). */
export function googleCalendarLink(i: CalendarItem): string {
  const e = toEvent(i);
  const d = e.start.replace(/-/g, '');
  const next = new Date(`${e.start}T12:00:00`);
  next.setDate(next.getDate() + 1);
  const end = next.toISOString().slice(0, 10).replace(/-/g, '');
  const rule = e.repeat ? rrule(e.repeat, e.until) : undefined;
  const q = new URLSearchParams({ action: 'TEMPLATE', text: e.title, dates: `${d}/${end}`, details: e.description ?? '', ...(rule ? { recur: `RRULE:${rule}` } : {}) });
  return `https://calendar.google.com/calendar/render?${q}`;
}


/** Save every bill, payday and card due date; returns a message for a toast. */
export async function addAllToCalendar(ctx: AppContext): Promise<string> {
  const items = await calendarItems(ctx);
  if (!items.length) return S.calendar.nothing;
  saveToCalendar(items);
  return S.calendar.saved(items.length);
}
