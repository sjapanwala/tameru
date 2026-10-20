// Plain, unstyled form pieces shared by screens. No logic beyond input parsing.

import { useEffect, useRef, useState } from 'preact/hooks';
import { money, S } from '../copy/strings';
import { nextMonthlyDate } from '../domain/dates';
import { centsToDecimal, parseCents } from '../domain/money';
import type { Account, Cents, Category } from '../domain/types';
import { toast } from './toast';

/** Money text field. With onCommit, the value is reported once on blur/Enter instead of on every keystroke. */
export function MoneyInput(props: {
  value: Cents | undefined;
  onChange?: (c: Cents | undefined) => void;
  onCommit?: (c: Cents) => void;
  label?: string;
  autoFocus?: boolean;
  allowNegative?: boolean;
}) {
  const [text, setText] = useState(props.value === undefined ? '' : centsToDecimal(props.value));
  useEffect(() => {
    const parsed = parseCents(text);
    if (parsed !== (props.value ?? null)) setText(props.value === undefined ? '' : centsToDecimal(props.value));
  }, [props.value]);
  const input = (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      autoFocus={props.autoFocus}
      placeholder="0.00"
      onInput={(e) => {
        const t = (e.target as HTMLInputElement).value;
        setText(t);
        const c = parseCents(t);
        props.onChange?.(c === null || (!props.allowNegative && c < 0) ? undefined : c);
      }}
      onBlur={() => {
        const c = parseCents(text);
        if (props.onCommit && c !== null && c >= 0 && c !== props.value) props.onCommit(c);
      }}
      onKeyDown={(e) => e.key === 'Enter' && props.onCommit && (e.target as HTMLInputElement).blur()}
    />
  );
  return props.label ? (
    <label>
      {props.label} {input}
    </label>
  ) : (
    input
  );
}

/**
 * A monthly day (card due date, bill day) picked on a calendar: shows the next date
 * that day falls on and reports just its day of month.
 */
export function MonthlyDayInput(props: { label: string; day: number; today: string; onChange: (day: number) => void }) {
  return (
    <label>
      {props.label}{' '}
      <input
        type="date"
        value={nextMonthlyDate(props.day, props.today)}
        onInput={(e) => {
          const v = (e.target as HTMLInputElement).value;
          if (v) props.onChange(Number(v.slice(8)));
        }}
      />
      <small class="muted">{S.common.monthlyOn(props.day)}</small>
    </label>
  );
}

export function CategorySelect(props: { categories: Category[]; value?: string; onChange: (id: string | undefined) => void; allowNone?: boolean }) {
  return (
    <select value={props.value ?? ''} onChange={(e) => props.onChange((e.target as HTMLSelectElement).value || undefined)}>
      {props.allowNone !== false && <option value="">{S.common.uncategorised}</option>}
      {props.categories.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}

/** Accounts, with preferred ones (e.g. a bill's assigned cards) listed first. */
export function AccountSelect(props: { accounts: Account[]; value?: string; onChange: (id: string) => void; preferred?: string[]; exclude?: string }) {
  const pref = props.preferred ?? [];
  const sorted = [...props.accounts.filter((a) => a.id !== props.exclude)].sort((a, b) => {
    const ia = pref.indexOf(a.id);
    const ib = pref.indexOf(b.id);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  return (
    <select value={props.value ?? ''} onChange={(e) => props.onChange((e.target as HTMLSelectElement).value)}>
      <option value="" disabled>
        {S.common.account}
      </option>
      {sorted.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
    </select>
  );
}

export const Money = ({ c }: { c: Cents }) => <span class="num">{money(c)}</span>;

/** Shows `text` as a toast whenever it changes. */
export function Message({ text }: { text?: string }) {
  useEffect(() => {
    if (text) toast(text);
  }, [text]);
  return null;
}

/** Trigger a file download for exports. */
export function download(filename: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Money set as a figure: whole part full size, cents smaller. */
export function Amount({ c, sign }: { c: Cents; sign?: '+' | '−' }) {
  const s = money(Math.abs(c));
  const dot = s.lastIndexOf('.');
  return (
    <span class="amt">
      {c < 0 ? '−' : (sign ?? '')}
      {dot < 0 ? s : s.slice(0, dot)}
      {dot >= 0 && <span class="amt__c">{s.slice(dot)}</span>}
    </span>
  );
}

export function PageHeader({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: preact.ComponentChildren }) {
  return (
    <header class="page-head">
      {eyebrow && <p class="eyebrow">{eyebrow}</p>}
      <div class="page-head__row">
        <h1>{title}</h1>
        {action}
      </div>
    </header>
  );
}

/** One tick per unit (days in a period, onboarding steps); filled up to `done`. */
export function Ticks({ total, done, label }: { total: number; done: number; label?: string }) {
  return (
    <div class="ticks" role="img" aria-label={label}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} class={i < done ? 'on' : i === done ? 'now' : ''} />
      ))}
    </div>
  );
}

/** A thin remaining-bar. Over (negative) shows as hatched, never as an alarm. */
export function Meter({ left, of }: { left: Cents; of: Cents }) {
  const over = left < 0;
  const pct = over ? 100 : of > 0 ? Math.max(0, Math.min(100, (left / of) * 100)) : 0;
  return (
    <div class={`bar${over ? ' bar--over' : ''}`}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

/**
 * Single choice as pills (one tap, no dropdown). They wrap by default; `row` keeps
 * them on one scrolling line (compact sheets) with an edge fade, mouse-wheel
 * scrolling, and the selected pill scrolled into view.
 */
export function ChipSelect<T extends string>(props: {
  options: { value: T; label: string; hint?: string }[];
  value?: T;
  onChange: (v: T) => void;
  label?: string;
  row?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });
  const measure = () => {
    const el = ref.current;
    if (!el || !props.row) return;
    setEdges({ start: el.scrollLeft > 2, end: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
  };
  useEffect(() => {
    const el = ref.current;
    if (!el || !props.row) return;
    const on = el.querySelector<HTMLElement>('.chip.on');
    if (on) el.scrollTo({ left: on.offsetLeft - el.clientWidth / 2 + on.offsetWidth / 2, behavior: 'smooth' });
    measure();
  }, [props.value, props.options.length]);
  return (
    <div
      ref={ref}
      class={`chip-select${props.row ? ' chip-select--row' : ''}${edges.start ? ' fade-start' : ''}${edges.end ? ' fade-end' : ''}`}
      role="radiogroup"
      aria-label={props.label}
      onScroll={measure}
      onWheel={(e) => {
        // A mouse wheel scrolls the row sideways.
        const el = ref.current;
        if (!props.row || !el || Math.abs(e.deltaX) > Math.abs(e.deltaY) || el.scrollWidth <= el.clientWidth) return;
        el.scrollLeft += e.deltaY;
        e.preventDefault();
      }}
    >
      {props.options.map((o) => (
        <button
          type="button"
          key={o.value}
          role="radio"
          aria-checked={props.value === o.value}
          class={props.value === o.value ? 'chip on' : 'chip'}
          onClick={() => props.onChange(o.value)}
        >
          {o.label}
          {o.hint && <small> {o.hint}</small>}
        </button>
      ))}
    </div>
  );
}

/** One or two letters for a round avatar: "Tim Hortons" → "TH". */
export function monogram(name: string): string {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase() || '·';
}
