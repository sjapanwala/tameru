// Hand-drawn inline illustrations in the brand palette. All decorative: the
// control or heading beside each one carries the meaning.

import type { ReactNode } from 'react';

function Art({ children, size = 56, box = 64 }: { children: ReactNode; size?: number; box?: number }) {
  return (
    <svg
      className="art"
      width={size}
      height={size}
      viewBox={`0 0 ${box} ${box}`}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** A single coin with the Tameru "T". */
export function Coin({ x = 0, y = 0, r = 9 }: { x?: number; y?: number; r?: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r={r} className="art-coin" />
      <circle r={r * 0.72} className="art-coin-rim" />
      <path d={`M${-r * 0.36} ${-r * 0.3}h${r * 0.72}M0 ${-r * 0.3}v${r * 0.66}`} className="art-coin-mark" />
    </g>
  );
}

const SLOTS: [number, number][] = [
  [26, 66],
  [44, 67],
  [35, 57],
  [24, 50],
  [46, 51],
  [35, 42],
];

/**
 * Progress jar. `coins` (0–6) is how many chapters are done; the newest coin
 * carries the drop animation.
 */
export function Jar({ coins, size = 72 }: { coins: number; size?: number }) {
  return (
    <svg
      className="jar"
      width={size}
      height={(size * 84) / 70}
      viewBox="0 0 70 84"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="20" y="4" width="30" height="7" rx="2.5" className="art-ink-fill" />
      <path d="M22 11v5c-8 3-12 8-12 16v36a10 10 0 0 0 10 10h30a10 10 0 0 0 10-10V32c0-8-4-13-12-16v-5" className="art-glass" />
      {SLOTS.slice(0, coins).map(([x, y], i) => (
        <g key={i} className={i === coins - 1 ? 'jar__coin jar__coin--new' : 'jar__coin'}>
          <Coin x={x} y={y} r={8.5} />
        </g>
      ))}
      <path d="M17 34v20" className="art-shine" />
    </svg>
  );
}

export const ArtChequing = () => (
  <Art>
    <rect x="8" y="18" width="48" height="30" rx="5" className="art-surface" />
    <path d="M8 27h48" className="art-ink" />
    <path d="M15 38h14M15 42h8" className="art-dim" />
    <circle cx="45" cy="39" r="5" className="art-accent" />
  </Art>
);

export const ArtSavings = () => (
  <Art>
    <rect x="12" y="14" width="40" height="38" rx="6" className="art-surface" />
    <circle cx="32" cy="33" r="9" className="art-ink" />
    <path d="M32 27v6l4 3" className="art-accent-line" />
    <path d="M20 52v4M44 52v4" className="art-ink" />
  </Art>
);

export const ArtCash = () => (
  <Art>
    <rect x="8" y="24" width="48" height="24" rx="4" className="art-surface" />
    <rect x="12" y="18" width="40" height="10" rx="3" className="art-surface" />
    <circle cx="32" cy="36" r="6" className="art-accent" />
    <path d="M15 31v10M49 31v10" className="art-dim" />
  </Art>
);

export const ArtInvesting = () => (
  <Art>
    <path d="M10 52h44" className="art-ink" />
    <path d="M14 44l11-11 8 7 16-18" className="art-accent-line" />
    <path d="M42 22h7v7" className="art-accent-line" />
    <path d="M25 52V40M33 52v-6M41 52V36" className="art-dim" />
  </Art>
);

export const ArtCards = () => (
  <Art size={72}>
    <rect x="14" y="14" width="42" height="27" rx="5" className="art-surface" transform="rotate(-8 35 27)" />
    <rect x="8" y="24" width="44" height="28" rx="5" className="art-accent" />
    <path d="M8 33h44" className="art-on-accent-line" />
    <path d="M14 44h12" className="art-on-accent-line" />
  </Art>
);

export const ArtCalendar = () => (
  <Art>
    <rect x="10" y="14" width="44" height="40" rx="6" className="art-surface" />
    <path d="M10 25h44M22 9v9M42 9v9" className="art-ink" />
    <rect x="34" y="34" width="12" height="12" rx="3" className="art-accent" />
    <path d="M18 34h8M18 42h8" className="art-dim" />
  </Art>
);

export const ArtPaycheque = () => (
  <Art>
    <rect x="6" y="20" width="52" height="28" rx="4" className="art-surface" />
    <path d="M13 29h18M13 36h10" className="art-dim" />
    <path d="M36 40c3-6 5 4 8-2s4 3 7 0" className="art-accent-line" />
    <circle cx="48" cy="29" r="4" className="art-accent" />
  </Art>
);

export const ArtVaries = () => (
  <Art>
    <path d="M8 40c6-16 10-16 16 0s10 16 16 0 10-16 16 0" className="art-accent-line" />
    <path d="M8 52h48" className="art-dim" />
  </Art>
);

export const ArtShield = () => (
  <Art>
    <path d="M32 9l18 7v14c0 12-8 20-18 25-10-5-18-13-18-25V16z" className="art-surface" />
    <path d="M24 32l6 6 11-12" className="art-accent-line" />
  </Art>
);

export const ArtPlane = () => (
  <Art>
    <path d="M8 34l48-22-16 42-9-17z" className="art-surface" />
    <path d="M31 37l25-25" className="art-accent-line" />
  </Art>
);

export const ArtBag = () => (
  <Art>
    <path d="M14 24h36l-3 30H17z" className="art-surface" />
    <path d="M24 24a8 8 0 0 1 16 0" className="art-ink" />
    <circle cx="32" cy="40" r="5" className="art-accent" />
  </Art>
);

export const ArtSprout = () => (
  <Art>
    <path d="M32 54V30" className="art-ink" />
    <path d="M32 34c0-10 6-15 16-15 0 10-6 15-16 15z" className="art-accent" />
    <path d="M32 40c0-7-5-11-13-11 0 7 5 11 13 11z" className="art-surface" />
    <path d="M22 54h20" className="art-dim" />
  </Art>
);

export const ArtStar = () => (
  <Art>
    <path d="M32 10l6.500 14 15 2-11 10.500 3 15-13.500-7.500-13.500 7.500 3-15-11-10.500 15-2z" className="art-surface" />
    <circle cx="32" cy="33" r="4" className="art-accent" />
  </Art>
);

export const ArtCardPayoff = () => (
  <Art>
    <rect x="8" y="18" width="48" height="30" rx="5" className="art-surface" />
    <path d="M8 27h48" className="art-ink" />
    <path d="M22 38l6 6 12-12" className="art-accent-line" />
  </Art>
);
