// A month calendar for picking a day: circles for days, today ringed, the pick filled.
// Steps a month at a time. Days before `min` can't be picked.

import { useState } from 'preact/hooks';
import { clampedDay, daysInMonth, dayOfWeek, make, parts } from '../domain/dates';
import type { LocalDate } from '../domain/types';
import { S } from '../copy/strings';
import { ChevronLeft, ChevronRight } from './Icons';
import { haptic } from './motion';

const monthName = (y: number, m: number) => new Date(y, m - 1, 15).toLocaleDateString('en-CA', { month: 'long', year: 'numeric' });
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function CalendarPicker(props: { value?: LocalDate; onChange: (d: LocalDate) => void; today: LocalDate; min?: LocalDate; label: string; note?: string }) {
  const start = parts(props.value ?? props.today);
  const [view, setView] = useState({ y: start.y, m: start.m });
  const first = make(view.y, view.m, 1);
  const lead = dayOfWeek(first); // 0 = Sunday
  const n = daysInMonth(view.y, view.m);
  const shift = (d: number) => {
    const i = view.y * 12 + (view.m - 1) + d;
    setView({ y: Math.floor(i / 12), m: (i % 12) + 1 });
  };
  const minMonth = props.min ? parts(props.min) : undefined;
  const canBack = !minMonth || view.y * 12 + view.m > minMonth.y * 12 + minMonth.m;
  return (
    <div class="cal" role="group" aria-label={props.label}>
      <div class="cal__head">
        <button type="button" class="cal__nav" aria-label={S.cal.prev} disabled={!canBack} onClick={() => shift(-1)}>
          <ChevronLeft />
        </button>
        <span class="cal__month">{monthName(view.y, view.m)}</span>
        <button type="button" class="cal__nav" aria-label={S.cal.next} onClick={() => shift(1)}>
          <ChevronRight />
        </button>
      </div>
      <div class="cal__grid">
        {WEEKDAYS.map((w, i) => (
          <span key={`w${i}`} class="cal__wd" aria-hidden="true">
            {w}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`b${i}`} />
        ))}
        {Array.from({ length: n }, (_, i) => {
          const d = clampedDay(view.y, view.m, i + 1);
          const off = !!props.min && d < props.min;
          const on = d === props.value;
          return (
            <button
              type="button"
              key={d}
              class={`cal__day${on ? ' is-on' : ''}${d === props.today ? ' is-today' : ''}`}
              disabled={off}
              aria-pressed={on}
              aria-label={new Date(`${d}T12:00:00`).toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })}
              onClick={() => (haptic(5), props.onChange(d))}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
      {props.note && <p class="cal__note">{props.note}</p>}
    </div>
  );
}
