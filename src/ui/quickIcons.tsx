// Icons for quick transactions. Original line drawings in the app's style
// (SF Symbols can't be used outside Apple platforms).

import { Svg } from './Icons';

export const QUICK_ICONS: Record<string, { draw: () => preact.JSX.Element }> = {
  coffee: {
    draw: () => (
      <Svg>
        <path d="M5 10h11v4a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 11h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5c-.6.8-.6 1.7 0 2.5M11.5 3.5c-.6.8-.6 1.7 0 2.5" />
      </Svg>
    ),
  },
  food: {
    draw: () => (
      <Svg>
        <path d="M7 3v7a2 2 0 0 0 2 2v9M11 3v7a2 2 0 0 1-2 2M9 3v6M17 21V3c-2 1-3 3.5-3 7h3" />
      </Svg>
    ),
  },
  groceries: {
    draw: () => (
      <Svg>
        <path d="M3.5 9h17l-2 10a1.5 1.5 0 0 1-1.5 1.2H7a1.5 1.5 0 0 1-1.5-1.2zM8 9l3-5M16 9l-3-5M9 13v4M15 13v4" />
      </Svg>
    ),
  },
  bag: {
    draw: () => (
      <Svg>
        <path d="M5 8h14l-1 12H6zM9 8V7a3 3 0 0 1 6 0v1" />
      </Svg>
    ),
  },
  car: {
    draw: () => (
      <Svg>
        <path d="M4 16v-3l2-5h12l2 5v3M3.5 16h17v2h-17zM7 18v2M17 18v2M7.5 13h.01M16.5 13h.01" />
      </Svg>
    ),
  },
  parking: {
    draw: () => (
      <Svg>
        <rect x="4" y="4" width="16" height="16" rx="4" />
        <path d="M10 16V8h3a2.5 2.5 0 0 1 0 5h-3" />
      </Svg>
    ),
  },
  fuel: {
    draw: () => (
      <Svg>
        <path d="M5 20V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v15M4 20h11M5 10h9M14 8h2l2.5 2.5V17a1.5 1.5 0 0 1-3 0v-3H14" />
      </Svg>
    ),
  },
  bus: {
    draw: () => (
      <Svg>
        <rect x="5" y="3.5" width="14" height="14" rx="3" />
        <path d="M5 11h14M8 17.5V20M16 17.5V20M8.5 14.5h.01M15.5 14.5h.01" />
      </Svg>
    ),
  },
  ticket: {
    draw: () => (
      <Svg>
        <path d="M4 7h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4zM14 7v10" />
      </Svg>
    ),
  },
  drink: {
    draw: () => (
      <Svg>
        <path d="M5 4h14l-7 8zM12 12v8M8 20h8" />
      </Svg>
    ),
  },
  gym: {
    draw: () => (
      <Svg>
        <path d="M3 12h18M6 8v8M9 6v12M15 6v12M18 8v8" />
      </Svg>
    ),
  },
  health: {
    draw: () => (
      <Svg>
        <rect x="3.5" y="8.5" width="17" height="7" rx="3.5" transform="rotate(-45 12 12)" />
        <path d="M9.5 9.5l5 5" />
      </Svg>
    ),
  },
  book: {
    draw: () => (
      <Svg>
        <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5zM20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z" />
      </Svg>
    ),
  },
  gift: {
    draw: () => (
      <Svg>
        <path d="M4 9h16v4H4zM5.5 13h13v7h-13zM12 9v11M12 9c-1.5-4-5-4-5-1.5S10 9 12 9c2 0 5-.5 5-1.5S13.5 5 12 9" />
      </Svg>
    ),
  },
  laundry: {
    draw: () => (
      <Svg>
        <path d="M9 4 4 7l2 4 2-1v10h8V10l2 1 2-4-5-3a3 3 0 0 1-6 0z" />
      </Svg>
    ),
  },
  haircut: {
    draw: () => (
      <Svg>
        <circle cx="6.5" cy="17" r="2.5" />
        <circle cx="17.5" cy="17" r="2.5" />
        <path d="M8.5 15.5 18 4M15.5 15.5 6 4" />
      </Svg>
    ),
  },
};

export const QUICK_ICON_KEYS = Object.keys(QUICK_ICONS);

export function QuickIcon({ name }: { name: string }) {
  const icon = QUICK_ICONS[name] ?? QUICK_ICONS.bag!;
  return icon.draw();
}
