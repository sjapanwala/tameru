import { useMemo, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { dayLabel, shortDate } from '../domain/dates';
import type { ForecastPoint } from '../domain/forecast';
import { formatMoney, minorUnitDigits } from '../domain/money';

interface Props {
  /** The plan as it stands. */
  points: ForecastPoint[];
  /** Same days with the what-if applied, when one is set. */
  scenario?: ForecastPoint[];
  scenarioLabel?: string;
  currency: string;
  today: string;
}

const W = 358;
const H = 196;
const PAD = { top: 14, right: 6, bottom: 24, left: 6 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

/** Round tick values covering [min, max]. */
function niceTicks(min: number, max: number, target = 3): number[] {
  const span = max - min || 1;
  const raw = span / target;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? raw;
  const ticks: number[] = [];
  for (let value = Math.ceil(min / step) * step; value <= max; value += step) ticks.push(value);
  return ticks;
}

/**
 * Projected balance over time. One series normally; two (plan vs what-if)
 * when a scenario is set, told apart by legend, colour and dash pattern.
 * Hover, drag or use the arrow keys to read any day.
 */
export function BalanceChart({
  points,
  scenario,
  scenarioLabel = 'What-if',
  currency,
  today,
}: Props) {
  const [picked, setPicked] = useState<number | null>(null);
  const last = points.length - 1;
  const index = Math.min(picked ?? last, last);
  const focusSeries = scenario ?? points;

  const geometry = useMemo(() => {
    const values = [...points, ...(scenario ?? [])].map((p) => p.balanceCents);
    let min = Math.min(...values);
    let max = Math.max(...values);
    const margin = (max - min || Math.abs(max) || 100) * 0.12;
    min -= margin * 2; // room under the low point for its label
    max += margin;
    const x = (i: number) => PAD.left + (last === 0 ? 0 : (i / last) * PLOT_W);
    const y = (cents: number) => PAD.top + (1 - (cents - min) / (max - min)) * PLOT_H;
    const path = (series: ForecastPoint[]) =>
      series
        .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.balanceCents).toFixed(1)}`)
        .join('');
    return { min, max, x, y, path, ticks: niceTicks(min, max) };
  }, [points, scenario, last]);

  const { x, y, ticks } = geometry;
  const compact = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  });
  const axisLabel = (cents: number) => compact.format(cents / 10 ** minorUnitDigits(currency));
  const money = (cents: number) => formatMoney(cents, currency);

  const lowIndex = focusSeries.reduce(
    (low, p, i) => (p.balanceCents < focusSeries[low]!.balanceCents ? i : low),
    0,
  );
  const low = focusSeries[lowIndex]!;
  const lowX = x(lowIndex);
  const lowY = y(low.balanceCents);
  const lowAnchor = lowX < 70 ? 'start' : lowX > W - 70 ? 'end' : 'middle';
  const lowLabelY = lowY + 20 > H - PAD.bottom ? lowY - 10 : lowY + 20;

  function pick(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = ((event.clientX - rect.left) / rect.width) * W;
    setPicked(Math.max(0, Math.min(last, Math.round(((ratio - PAD.left) / PLOT_W) * last))));
  }

  function onKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    setPicked(Math.max(0, Math.min(last, index + step * (event.shiftKey ? 7 : 1))));
  }

  const point = points[index]!;
  const scenarioPoint = scenario?.[index];
  const events = (scenarioPoint ?? point).events;
  const xLabels = [0, Math.round(last / 2), last];

  return (
    <figure className="chart">
      {scenario && (
        <ul className="legend" aria-label="Legend">
          <li>
            <svg width="22" height="8" aria-hidden="true">
              <line x1="1" y1="4" x2="21" y2="4" className="chart__line" />
            </svg>
            Current plan
          </li>
          <li>
            <svg width="22" height="8" aria-hidden="true">
              <line x1="1" y1="4" x2="21" y2="4" className="chart__line chart__line--scenario" />
            </svg>
            {scenarioLabel}
          </li>
        </ul>
      )}

      <div className="readout" aria-live="polite">
        <span className="readout__date">{dayLabel(point.date, today)}</span>
        <span className="readout__value num">
          {scenarioPoint ? (
            <>
              {money(point.balanceCents)}{' '}
              <span className="readout__vs">→ {money(scenarioPoint.balanceCents)}</span>
            </>
          ) : (
            money(point.balanceCents)
          )}
        </span>
        <span className="readout__events num">
          {events.length === 0
            ? 'Nothing scheduled'
            : events
                .map((e) => `${e.name} ${formatMoney(e.amountCents, currency, { signed: true })}`)
                .join(', ')}
        </span>
      </div>

      <svg
        className="chart__svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        tabIndex={0}
        aria-label={`Projected balance from ${shortDate(points[0]!.date)} to ${shortDate(points[last]!.date)}. Lowest ${money(low.balanceCents)} on ${shortDate(low.date)}. Use left and right arrow keys to read each day.`}
        onPointerDown={pick}
        onPointerMove={(event) => {
          if (event.pointerType === 'mouse' || event.buttons > 0) pick(event);
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === 'mouse') setPicked(null);
        }}
        onKeyDown={onKeyDown}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(tick)}
              y2={y(tick)}
              className={tick === 0 ? 'chart__grid chart__grid--zero' : 'chart__grid'}
            />
            <text x={PAD.left} y={y(tick) - 4} className="chart__tick">
              {axisLabel(tick)}
            </text>
          </g>
        ))}
        {xLabels.map((i, n) => (
          <text
            key={i}
            x={x(i)}
            y={H - 6}
            className="chart__tick"
            textAnchor={n === 0 ? 'start' : n === 2 ? 'end' : 'middle'}
          >
            {i === 0 ? 'Today' : shortDate(points[i]!.date)}
          </text>
        ))}

        <path d={geometry.path(points)} className="chart__line" />
        {scenario && (
          <path d={geometry.path(scenario)} className="chart__line chart__line--scenario" />
        )}

        {/* One direct label: the low point, which is the thing to watch. */}
        <circle
          cx={lowX}
          cy={lowY}
          r={5}
          className={scenario ? 'chart__dot chart__dot--scenario' : 'chart__dot'}
        />
        <text x={lowX} y={lowLabelY} className="chart__label" textAnchor={lowAnchor}>
          Low {axisLabel(low.balanceCents)}
        </text>

        {picked !== null && (
          <g>
            <line
              x1={x(index)}
              x2={x(index)}
              y1={PAD.top}
              y2={H - PAD.bottom}
              className="chart__cursor"
            />
            <circle cx={x(index)} cy={y(point.balanceCents)} r={5} className="chart__dot" />
            {scenarioPoint && (
              <circle
                cx={x(index)}
                cy={y(scenarioPoint.balanceCents)}
                r={5}
                className="chart__dot chart__dot--scenario"
              />
            )}
          </g>
        )}
      </svg>
    </figure>
  );
}
