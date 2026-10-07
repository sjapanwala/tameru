// Building blocks shared by the onboarding screens.

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { PAD_KEYS, pressKey, type PadKey } from '../domain/amountEntry';
import { addDays, parseISODate } from '../domain/dates';
import { currencySymbol, formatMoney } from '../domain/money';
import type { Account, Goal, Recurring, Transaction } from '../domain/types';
import { BackIcon, BackspaceIcon, CheckIcon } from '../ui/Icons';
import { Jar } from './art';
import { useCountUp } from './motion';
import type { OnboardingState } from './machine';

export interface Flow {
  state: OnboardingState;
  currency: string;
  decimals: number;
  accounts: Account[];
  recurring: Recurring[];
  goals: Goal[];
  transactions: Transaction[];
  /** Continue: move to whatever comes next. */
  next(changes?: Partial<OnboardingState>): void;
  /** Jump somewhere specific (starting a card, editing an income…). */
  go(state: OnboardingState): void;
  back(): void;
  canGoBack: boolean;
  money(cents: number): string;
}

export const FlowContext = createContext<Flow | null>(null);

export function useFlow(): Flow {
  const flow = useContext(FlowContext);
  if (!flow) throw new Error('useFlow must be used inside onboarding');
  return flow;
}

// ---- screen shell ---------------------------------------------------------

interface ScreenProps {
  title: string;
  /** One or two short lines under the title. */
  lede?: ReactNode;
  art?: ReactNode;
  children?: ReactNode;
  /** Controls anchored above the primary button (the keypad, usually). */
  dock?: ReactNode;
  primary: { label: string; onClick(): void | Promise<void>; disabled?: boolean };
  /** Shown as a quiet button beside Back. Omit on screens with nothing to skip. */
  onSkip?: (() => void) | null;
  skipLabel?: string;
  hideBack?: boolean;
}

/** One question per screen: jar on top, the question, controls by the thumb. */
export function Screen({
  title,
  lede,
  art,
  children,
  dock,
  primary,
  onSkip,
  skipLabel = 'Skip',
  hideBack,
}: ScreenProps) {
  const flow = useFlow();
  const heading = useRef<HTMLHeadingElement>(null);

  // Each screen is a fresh mount (keyed by step), so move focus to its question.
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, []);

  return (
    <main className="ob">
      <div className="ob__top">
        {flow.canGoBack && !hideBack ? (
          <button type="button" className="icon-btn icon-btn--back" aria-label="Back" onClick={flow.back}>
            <BackIcon size={22} />
          </button>
        ) : (
          <span className="ob__spacer" />
        )}
        <Jar coins={flow.state.completed.length} size={40} />
        {onSkip ? (
          <button type="button" className="ob__skip" onClick={onSkip}>
            {skipLabel}
          </button>
        ) : (
          <span className="ob__spacer" />
        )}
      </div>

      <div className="ob__body">
        {art && <div className="ob__art">{art}</div>}
        <h1 ref={heading} tabIndex={-1} className="ob__title">
          {title}
        </h1>
        {lede && <p className="ob__lede">{lede}</p>}
        {children}
      </div>

      <div className="ob__foot">
        {dock}
        <button
          type="button"
          className="btn btn--primary btn--block"
          disabled={primary.disabled}
          onClick={() => void primary.onClick()}
        >
          {primary.label}
        </button>
      </div>
    </main>
  );
}

// ---- choices ---------------------------------------------------------------

interface TileProps {
  label: string;
  hint?: string;
  art?: ReactNode;
  selected?: boolean;
  onClick(): void;
}

/** A big illustrated choice. Selected tiles get a tick as well as a border. */
export function Tile({ label, hint, art, selected, onClick }: TileProps) {
  return (
    <button type="button" className="tile" aria-pressed={selected ?? undefined} onClick={onClick}>
      {art}
      <span className="tile__label">{label}</span>
      {hint && <span className="tile__hint">{hint}</span>}
      {selected && (
        <span className="tile__tick">
          <CheckIcon size={14} />
        </span>
      )}
    </button>
  );
}

export function Tiles({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={`tiles${wide ? ' tiles--wide' : ''}`} role="group" aria-label={label}>
      {children}
    </div>
  );
}

interface ChipsProps<T extends string | number> {
  label: string;
  options: { value: T; label: string }[];
  value: T | null;
  onChange(value: T): void;
}

export function Chips<T extends string | number>({ label, options, value, onChange }: ChipsProps<T>) {
  return (
    <div className="ob-chips" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="ob-chip"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export const SWATCHES = [
  { value: '#a5482c', name: 'Shu' },
  { value: '#1f6b4f', name: 'Moss' },
  { value: '#2747c4', name: 'Cobalt' },
  { value: '#8a6100', name: 'Ochre' },
  { value: '#6b4fd8', name: 'Violet' },
  { value: '#3a3d39', name: 'Ink' },
];

export function Swatches({ value, onChange }: { value: string; onChange(value: string): void }) {
  return (
    <div className="swatches" role="group" aria-label="Colour">
      {SWATCHES.map((swatch) => (
        <button
          key={swatch.value}
          type="button"
          className="swatch"
          style={{ background: swatch.value }}
          aria-label={swatch.name}
          aria-pressed={value === swatch.value}
          onClick={() => onChange(swatch.value)}
        >
          {value === swatch.value && <CheckIcon size={18} />}
        </button>
      ))}
    </div>
  );
}

/** Days 1–31 as a calendar-like grid. */
export function DayGrid({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange(day: number): void;
}) {
  return (
    <div className="daygrid" role="group" aria-label={label}>
      {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
        <button
          key={day}
          type="button"
          className="daygrid__day"
          aria-pressed={value === day}
          aria-label={`Day ${day}`}
          onClick={() => onChange(day)}
        >
          {day}
        </button>
      ))}
    </div>
  );
}

/** The next 14 days as a horizontal strip. */
export function DateStrip({
  today,
  value,
  onChange,
}: {
  today: string;
  value: string;
  onChange(date: string): void;
}) {
  const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
  const full = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  return (
    <div className="datestrip" role="group" aria-label="Next payday">
      {Array.from({ length: 14 }, (_, i) => addDays(today, i)).map((date, i) => (
        <button
          key={date}
          type="button"
          className="datestrip__day"
          aria-pressed={value === date}
          aria-label={full.format(parseISODate(date))}
          data-date={date}
          onClick={() => onChange(date)}
        >
          <span className="datestrip__dow">{i === 0 ? 'Today' : weekday.format(parseISODate(date))}</span>
          <span className="datestrip__num">{Number(date.slice(8))}</span>
        </button>
      ))}
    </div>
  );
}

// ---- amounts ---------------------------------------------------------------

/** Big mono amount, as typed. */
export function AmountDisplay({ entry, label }: { entry: string; label: string }) {
  const { currency } = useFlow();
  return (
    <p className={`ob-amount${entry === '' ? ' ob-amount--empty' : ''}`} aria-live="polite">
      <span className="visually-hidden">{label}: </span>
      {currencySymbol(currency)}
      {entry === '' ? '0' : entry}
      <span className="quick__caret" aria-hidden="true" />
    </p>
  );
}

/** The Quick Add keypad. Also listens for a hardware keyboard. */
export function AmountPad({ entry, onChange }: { entry: string; onChange(entry: string): void }) {
  const { decimals } = useFlow();
  const press = (key: PadKey) => onChange(pressKey(entry, key, decimals));

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (/^[0-9.]$/.test(event.key)) press(event.key as PadKey);
    else if (event.key === 'Backspace') press('back');
    else return;
    event.preventDefault();
  }

  return (
    <div className="pad" role="group" aria-label="Number pad" onKeyDown={onKeyDown}>
      {PAD_KEYS.map((key) => (
        <button
          key={key}
          type="button"
          className="pad__key"
          aria-label={key === 'back' ? 'Delete digit' : key === '.' ? 'Decimal point' : undefined}
          disabled={key === '.' && decimals === 0}
          onClick={() => press(key)}
        >
          {key === 'back' ? <BackspaceIcon /> : key}
        </button>
      ))}
    </div>
  );
}

/** A money figure that counts up to its value. */
export function CountUpMoney({ cents, className }: { cents: number; className?: string }) {
  const { currency } = useFlow();
  const shown = useCountUp(cents);
  return (
    <span className={className}>
      {/* Screen readers get the final figure once, not every frame. */}
      <span aria-hidden="true">{formatMoney(shown, currency)}</span>
      <span className="visually-hidden">{formatMoney(cents, currency)}</span>
    </span>
  );
}

// ---- allocation bar --------------------------------------------------------

export interface Slice {
  key: 'bills' | 'goals' | 'spent' | 'free';
  label: string;
  cents: number;
}

/**
 * Where the month's income goes. The legend carries the labels and amounts;
 * the bar's colours only echo it.
 */
export function AllocationBar({ slices, total }: { slices: Slice[]; total: number }) {
  const { money } = useFlow();
  const shown = slices.filter((slice) => slice.cents > 0);
  const sum = Math.max(total, shown.reduce((acc, slice) => acc + slice.cents, 0), 1);
  return (
    <div className="alloc">
      <div className="alloc__bar" aria-hidden="true">
        {shown.map((slice) => (
          <span
            key={slice.key}
            className={`alloc__seg alloc__seg--${slice.key}`}
            style={{ flexGrow: slice.cents / sum }}
          />
        ))}
      </div>
      <dl className="alloc__legend">
        {slices.map((slice) => (
          <div key={slice.key}>
            <dt>
              <span className={`alloc__dot alloc__seg--${slice.key}`} aria-hidden="true" />
              {slice.label}
            </dt>
            <dd className="mono">{money(slice.cents)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
