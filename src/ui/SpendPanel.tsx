// Activity's spending summary: what went out over the last 14 days (or on one day),
// what came in, and a bar per day. Drag across the bars to read any day; release to
// pick it (Activity's list then shows only that day). Categories folds open below
// with the spending split by category.

import { useRef, useState } from 'preact/hooks';
import { fmtDate, money, S } from '../copy/strings';
import { OTHER, spendChart, UNCATEGORISED } from '../domain/spendChart';
import type { Transaction } from '../domain/types';
import { Amount } from './components';
import { ChevronRight } from './Icons';
import { haptic } from './motion';

const H = 128; // tallest bar, px
const PULL = 25; // px a drag on Categories needs to open or close it
/** Category colours, largest first. */
const SHADES = ['var(--accent)', 'var(--text)', 'var(--text-2)', 'var(--text-3)', 'var(--fill-2)'];

export function SpendPanel(props: {
  transactions: Transaction[]; // already scoped to the chosen card
  dates: string[]; // oldest first; the last is today
  selected: string | null;
  onSelect: (date: string | null) => void;
  catName: (id?: string) => string | undefined;
  dayLabel: (date: string) => string;
}) {
  const { dates, selected } = props;
  const n = dates.length;
  const [hover, setHover] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const scrub = useRef<number | null>(null);
  const handleY = useRef(0);

  const posted = props.transactions.filter((t) => t.status === 'posted');
  const chart = spendChart(posted, dates);
  const max = Math.max(1, chart.maxCents);
  const sel = selected ? dates.indexOf(selected) : -1;
  const focus = hover ?? (sel >= 0 ? sel : null);
  const inFocus = (t: Transaction) => (focus == null ? dates.includes(t.date) : t.date === dates[focus]);
  const spent = focus == null ? chart.days.reduce((s, d) => s + d.totalCents, 0) : chart.days[focus]!.totalCents;
  const received = posted.filter((t) => t.type === 'income' && inFocus(t)).reduce((s, t) => s + t.amountCents, 0);
  const cats = spendChart(posted, focus == null ? dates : [dates[focus]!]);
  const catTotal = cats.keys.reduce((s, k) => s + (cats.totals[k] ?? 0), 0);
  const catLabel = (key: string) => (key === OTHER ? S.transactions.chart.other : key === UNCATEGORISED ? S.common.uncategorised : (props.catName(key) ?? S.common.uncategorised));
  const barH = (v: number) => (v > 0 ? Math.max(8, Math.sqrt(v / max) * H) : 4);

  const indexAt = (e: PointerEvent) => {
    const r = (e.currentTarget as Element).getBoundingClientRect();
    return Math.max(0, Math.min(n - 1, Math.floor(((e.clientX - r.left) / r.width) * n)));
  };
  const onDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    scrub.current = indexAt(e);
    setHover(scrub.current);
  };
  const onMove = (e: PointerEvent) => {
    if (scrub.current == null) return;
    const i = indexAt(e);
    if (i !== scrub.current) {
      scrub.current = i;
      haptic(4);
      setHover(i);
    }
  };
  const onUp = () => {
    const i = scrub.current;
    scrub.current = null;
    setHover(null);
    if (i == null) return;
    props.onSelect(selected === dates[i] ? null : dates[i]!);
  };
  const onCancel = () => {
    scrub.current = null;
    setHover(null);
  };

  return (
    <>
      <div class="act-hero">
        <span class="act-hero__label">
          {S.transactions.spentLabel(focus == null ? S.transactions.last14 : props.dayLabel(dates[focus]!))}
        </span>
        <span class="act-hero__amount">
          <Amount c={spent} />
        </span>
        <span class="act-hero__in">
          {S.transactions.periodIn} <span class="num">+{money(received)}</span>
        </span>
      </div>

      <div class="act-panel">
        <div class="act-chart" role="group" aria-label={S.transactions.chart.label} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onCancel}>
          {chart.days.map((d, i) => (
            <span
              key={d.date}
              class={`act-chart__bar${d.totalCents > 0 ? ' act-chart__bar--some' : ''}${focus != null ? (i === focus ? ' act-chart__bar--on' : ' act-chart__bar--off') : ''}`}
              style={{ height: `${barH(d.totalCents)}px` }}
            />
          ))}
          {chart.averageCents > 0 && (
            <div class="act-chart__avg" style={{ bottom: `${Math.sqrt(chart.averageCents / max) * H}px` }}>
              <span>{S.transactions.chart.average(chart.averageCents)}</span>
            </div>
          )}
        </div>
        <div class="act-chart__axis">
          <span>{fmtDate(dates[0]!)}</span>
          <button type="button" class="act-chart__chip" data-on={selected != null} tabIndex={selected ? 0 : -1} onClick={() => props.onSelect(null)}>
            {selected ? props.dayLabel(selected) : ''} ✕
          </button>
          <span>{S.home.today}</span>
        </div>

        <button
          type="button"
          class="act-cats__head"
          aria-expanded={expanded}
          onPointerDown={(e) => (handleY.current = e.clientY)}
          onClick={(e) => {
            const dy = e.detail === 0 ? 0 : e.clientY - handleY.current; // 0 for a keyboard press
            setExpanded(dy > PULL ? true : dy < -PULL ? false : !expanded);
          }}
        >
          <span>{S.transactions.categories}</span>
          <ChevronRight />
        </button>
        <div class="act-cats" data-on={expanded}>
          <div class="act-cats__inner">
            {cats.keys.length === 0 ? (
              <p class="act-cats__empty">{S.transactions.chart.empty}</p>
            ) : (
              <>
                <div class="act-cats__bar">
                  {cats.keys.map((k, i) => (
                    <span key={k} style={{ width: `${((cats.totals[k] ?? 0) / catTotal) * 100}%`, background: SHADES[i] ?? SHADES[4] }} />
                  ))}
                </div>
                <ul class="act-cats__legend">
                  {cats.keys.map((k, i) => (
                    <li key={k}>
                      <i style={{ background: SHADES[i] ?? SHADES[4] }} />
                      <span class="act-cats__name">{catLabel(k)}</span>
                      <span class="num">{money(cats.totals[k] ?? 0)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
