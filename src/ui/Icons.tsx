import type { ReactNode } from 'react';

// Decorative inline icons. Always paired with visible text or an aria-label
// on the parent control, so they are hidden from assistive tech.
function icon(children: ReactNode, strokeWidth = 1.9) {
  return function Icon({ size = 24 }: { size?: number }) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        {children}
      </svg>
    );
  };
}

export const HomeIcon = icon(
  <>
    <path d="M4 11.2 12 4l8 7.2" />
    <path d="M6 10v9.5h12V10" />
  </>,
);

export const ListIcon = icon(
  <>
    <path d="M8.5 7H20M8.5 12H20M8.5 17H20" />
    <path d="M4.2 7h.1M4.2 12h.1M4.2 17h.1" strokeWidth={2.6} />
  </>,
);

export const PlusIcon = icon(<path d="M12 5v14M5 12h14" />, 2.4);

export const ForecastIcon = icon(
  <>
    <path d="M4 19.5h16" />
    <path d="m5 15 4.5-4.5 3.5 3L19 7" />
    <path d="M15 7h4v4" />
  </>,
);

export const PlanIcon = icon(
  <>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="3.2" />
  </>,
);

// Settings, drawn as sliders: reads clearly at 24px where a cog does not.
export const GearIcon = icon(
  <>
    <path d="M4 7.5h9M17.5 7.5H20M4 16.5h2.5M11 16.5h9" />
    <circle cx="15.25" cy="7.5" r="2.25" />
    <circle cx="8.75" cy="16.5" r="2.25" />
  </>,
);

export const SearchIcon = icon(
  <>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4 4" />
  </>,
);

export const CloseIcon = icon(<path d="M6 6l12 12M18 6 6 18" />, 2.2);

export const BackIcon = icon(<path d="M14.5 5.5 8 12l6.5 6.5" />, 2.2);

export const BackspaceIcon = icon(
  <>
    <path d="M9 5.5h10.5v13H9L3.5 12 9 5.5Z" />
    <path d="m12 9.5 5 5M17 9.5l-5 5" />
  </>,
);

export const CheckIcon = icon(<path d="m5 12.5 4.5 4.5L19 7.5" />, 2.4);

export const AlertIcon = icon(
  <>
    <path d="M12 4 21 19.5H3L12 4Z" />
    <path d="M12 10v4.5M12 17.2v.1" />
  </>,
);

export const ShareIcon = icon(
  <>
    <path d="M12 15V3.5M8 7l4-4 4 4" />
    <path d="M7.5 10.5H6v10h12v-10h-1.5" />
  </>,
);

export const AddSquareIcon = icon(
  <>
    <rect x="4" y="4" width="16" height="16" rx="4" />
    <path d="M12 8.5v7M8.5 12h7" />
  </>,
);

export const DotsIcon = icon(<path d="M12 5.5v.1M12 12v.1M12 18.5v.1" />, 2.8);
