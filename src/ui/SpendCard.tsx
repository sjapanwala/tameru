// Activity's "Spent this period" card. Pull it down (or tap its handle) and it grows,
// like Home's wallet: the 14-day bars get taller and split into categories, with a
// daily-average line, day labels and a legend. One value, p (0 closed → 1 open),
// drives it all: it follows the finger while dragging and glides to 0 or 1 on release.

import { useEffect } from 'preact/hooks';
import { fmtDate, money, S } from '../copy/strings';
import { addDays } from '../domain/dates';
import { OTHER, spendChart, UNCATEGORISED } from '../domain/spendChart';
import type { Cents, Transaction } from '../domain/types';
import { Amount } from './components';
import { reducedMotion } from './motion';
import { useWalletPull } from './Wallet';

const DAYS = 14;
const CLOSED_H = 44; // bar area height, closed
const OPEN_H = 176; // bar area height, open
const EXTRA_H = 120; // labels + legend, revealed as it opens
/** Category shades on the dark card, largest series first; "Other" is hatched. */
const SHADES = ['#f5f5f5', '#b8b8b8', '#858585', '#5a5a5a'];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function SpendCard(props: { spentCents: Cents; receivedCents: Cents; transactions: Transaction[]; today: string; catName: (id?: string) => string | undefined }) {
  const pull = useWalletPull();
  useEffect(() => pull.setTravel(OPEN_H - CLOSED_H + EXTRA_H), []);
  const dates = Array.from({ length: DAYS }, (_, i) => addDays(props.today, i - (DAYS - 1)));
  const chart = spendChart(props.transactions, dates);
  const p = Math.max(0, Math.min(1.08, pull.p));
  const open = Math.min(1, p);
  const h = lerp(CLOSED_H, OPEN_H, p);
  const scale = chart.maxCents > 0 ? h / chart.maxCents : 0;
  const shade = (key: string) => (key === OTHER ? 'hatch' : SHADES[chart.keys.indexOf(key)] ?? SHADES[3]);
  const label = (key: string) => (key === OTHER ? S.transactions.chart.other : key === UNCATEGORISED ? S.common.uncategorised : (props.catName(key) ?? S.common.uncategorised));
  const animate = !pull.dragging && !reducedMotion();

  return (
    <div
      ref={pull.ref}
      class={`summary-card spend-card${animate ? ' spend-card--animate' : ''}${pull.open ? ' spend-card--open' : ''}`}
      style={{ ...pull.bind.style, '--p': String(open) }}
      onPointerDown={pull.bind.onPointerDown}
      onPointerMove={pull.bind.onPointerMove}
      onPointerUp={pull.bind.onPointerUp}
      onPointerCancel={pull.bind.onPointerCancel}
      onClickCapture={pull.bind.onClickCapture}
    >
      <div class="summary-card__nums">
        <div>
          <p class="summary-card__label">{S.transactions.periodSpent}</p>
          <p class="summary-card__amount">
            <Amount c={props.spentCents} />
          </p>
        </div>
        <div class="summary-card__in">
          <p class="summary-card__label">{S.transactions.periodIn}</p>
          <p class="num">+{money(props.receivedCents)}</p>
        </div>
      </div>

      <div class="spend-chart" style={{ height: `${h}px` }} aria-hidden={!pull.open}>
        <div class="spark">
          {chart.days.map((d, i) => (
            <span key={d.date} class={`spark__bar${i === DAYS - 1 ? ' today' : ''}`} style={{ height: `${Math.max(6, d.totalCents * scale)}px`, animationDelay: `${i * 25}ms` }}>
              {d.parts.map((part) => (
                <i key={part.key} class={`spark__seg spark__seg--${shade(part.key) === 'hatch' ? 'hatch' : 'solid'}`} style={{ flexGrow: part.cents, background: shade(part.key) === 'hatch' ? undefined : shade(part.key) }} />
              ))}
            </span>
          ))}
        </div>
        {chart.averageCents > 0 && (
          <div class="spend-chart__avg" style={{ bottom: `${chart.averageCents * scale}px` }}>
            <span>{S.transactions.chart.average(chart.averageCents)}</span>
          </div>
        )}
      </div>

      <div class="spend-card__more" style={{ height: `${open * EXTRA_H}px` }}>
        <div class="spend-card__days">
          <span>{fmtDate(dates[0]!)}</span>
          <span>{S.home.today}</span>
        </div>
        <ul class="spend-card__legend">
          {chart.keys.map((key) => (
            <li key={key}>
              <span class={`spend-card__swatch${shade(key) === 'hatch' ? ' spend-card__swatch--hatch' : ''}`} style={shade(key) === 'hatch' ? undefined : { background: shade(key) }} />
              <span class="spend-card__name">{label(key)}</span>
              <Amount c={chart.totals[key] ?? 0} />
            </li>
          ))}
          {chart.keys.length === 0 && <li class="spend-card__empty">{S.transactions.chart.empty}</li>}
        </ul>
      </div>

      <button type="button" class="spend-card__handle" aria-label={pull.open ? S.transactions.chart.close : S.transactions.chart.open} aria-expanded={pull.open} onClick={() => pull.setOpen(!pull.open)}>
        <span />
      </button>
    </div>
  );
}
