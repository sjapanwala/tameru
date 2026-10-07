// Line icons for well-known category names. Categories have no icon field;
// the name picks the glyph, and anything unrecognised gets its initial.

const PATHS: Record<string, string> = {
  coffee:
    'M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 10h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5v2.5M11 3.5v2.5',
  groceries: 'M6 8h12l-1 12H7zM9 8a3 3 0 0 1 6 0',
  'dining out': 'M7 3v18M5 3v5a2 2 0 0 0 4 0V3M17 21V3c-2 0-3 2-3 5s1 4 3 4',
  transport: 'M6 4h12a1 1 0 0 1 1 1v11H5V5a1 1 0 0 1 1-1zM5 11h14M8 16v3M16 16v3',
  fun: 'M4 7h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4zM14 7v10',
  health: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z',
  shopping: 'M3 12V4h8l9 9-8 8zM7.5 7.5h.01',
  bills: 'M7 3h10v18l-2.5-1.5L12 21l-2.5-1.5L7 21zM10 8h4M10 12h4',
  rent: 'M4 10.5 12 4l8 6.5V20h-5v-6H9v6H4z',
  subscriptions: 'M4 12a8 8 0 0 1 14-5l2 2M20 12a8 8 0 0 1-14 5l-2-2M20 4v5h-5M4 20v-5h5',
  travel: 'M3 13l18-8-6 16-3-7z',
  gifts: 'M4 10h16v10H4zM3 7h18v3H3zM12 7v13M12 7c-1-3-5-3-5 0M12 7c1-3 5-3 5 0',
};

export function CategoryIcon({ name, size = 22 }: { name: string; size?: number }) {
  const path = PATHS[name.trim().toLowerCase()];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {path ? (
        <path d={path} />
      ) : (
        <text
          x="12"
          y="16.5"
          textAnchor="middle"
          fill="currentColor"
          stroke="none"
          fontSize="13"
          fontWeight="600"
        >
          {name.trim().charAt(0).toUpperCase()}
        </text>
      )}
    </svg>
  );
}
