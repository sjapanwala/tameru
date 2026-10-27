// Line icons for the tab bar. 24×24, 1.75 stroke, currentColor.

export const Svg = ({ children }: { children: preact.ComponentChildren }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export const HomeIcon = () => (
  <Svg>
    <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z" />
  </Svg>
);

export const ActivityIcon = () => (
  <Svg>
    <path d="M5 6h14M5 12h14M5 18h9" />
  </Svg>
);

export const PlusIcon = () => (
  <Svg>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const PlanIcon = () => (
  <Svg>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 4v8l5.5 5.5" />
  </Svg>
);

export const MoreIcon = () => (
  <Svg>
    <circle cx="6" cy="12" r="1" />
    <circle cx="12" cy="12" r="1" />
    <circle cx="18" cy="12" r="1" />
  </Svg>
);

export const ArrowUpRight = () => (
  <Svg>
    <path d="M7 17 17 7M8 7h9v9" />
  </Svg>
);

export const ArrowDownLeft = () => (
  <Svg>
    <path d="M17 7 7 17M16 17H7V8" />
  </Svg>
);

export const SwapIcon = () => (
  <Svg>
    <path d="M8 4v16M4 8l4-4 4 4M16 20V4M20 16l-4 4-4-4" />
  </Svg>
);

export const BellIcon = () => (
  <Svg>
    <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0" />
  </Svg>
);

export const CardIcon = () => (
  <Svg>
    <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
    <path d="M3 10h18M7 15h3" />
  </Svg>
);

export const PersonIcon = () => (
  <Svg>
    <circle cx="12" cy="8.5" r="3.5" />
    <path d="M5 20c1.2-3.6 4-5.5 7-5.5s5.8 1.9 7 5.5" />
  </Svg>
);

export const UploadIcon = () => (
  <Svg>
    <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 14v4.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V14" />
  </Svg>
);

export const CameraIcon = () => (
  <Svg>
    <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.5-2h6l1.5 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" />
    <circle cx="12" cy="13" r="3.5" />
  </Svg>
);

export const SearchIcon = () => (
  <Svg>
    <circle cx="11" cy="11" r="6" />
    <path d="m20 20-4.5-4.5" />
  </Svg>
);

export const PencilIcon = () => (
  <Svg>
    <path d="M14.5 5.5l4 4M4 20l4.2-.8L19 8.4a1.4 1.4 0 0 0 0-2l-1.4-1.4a1.4 1.4 0 0 0-2 0L4.8 15.8z" />
  </Svg>
);

export const ArrangeIcon = () => (
  <Svg>
    <rect x="4" y="4" width="7" height="7" rx="1.5" />
    <rect x="13" y="4" width="7" height="7" rx="1.5" />
    <rect x="4" y="13" width="7" height="7" rx="1.5" />
    <rect x="13" y="13" width="7" height="7" rx="1.5" />
  </Svg>
);

export const TrashIcon = () => (
  <Svg>
    <path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.9 12a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-12M10 11v6M14 11v6" />
  </Svg>
);

export const ChevronLeft = () => (
  <Svg>
    <path d="M14.5 5.5 8 12l6.5 6.5" />
  </Svg>
);

export const ChevronRight = () => (
  <Svg>
    <path d="M9.5 5.5 16 12l-6.5 6.5" />
  </Svg>
);

export const BankIcon = () => (
  <Svg>
    <path d="M3.5 9.5 12 4.5l8.5 5M5 10v7.5M9.5 10v7.5M14.5 10v7.5M19 10v7.5M3.5 20.5h17" />
  </Svg>
);

export const JarIcon = () => (
  <Svg>
    <path d="M8 3.5h8M8.5 3.5v2.5C6.5 7 5.5 8.6 5.5 11v7.5a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V11c0-2.4-1-4-3-5V3.5" />
    <path d="M9.5 13.5h5" />
  </Svg>
);

export const TrendIcon = () => (
  <Svg>
    <path d="M4 17.5 9.5 12l3.5 3.5L20 8.5M15 8.5h5v5" />
  </Svg>
);

export const CashIcon = () => (
  <Svg>
    <rect x="3" y="6.5" width="18" height="11" rx="2" />
    <circle cx="12" cy="12" r="2.5" />
    <path d="M6.5 9.5v5M17.5 9.5v5" />
  </Svg>
);

export const CheckIcon = () => (
  <Svg>
    <path d="M5.5 12.5 10 17l8.5-9.5" />
  </Svg>
);

export const CalendarIcon = () => (
  <Svg>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
    <path d="M3.5 10h17M8 3v4M16 3v4M8 14h2M12 14h2M8 17h2" />
  </Svg>
);

export const SparkIcon = () => (
  <Svg>
    <path d="M12 3.5v4M12 16.5v4M3.5 12h4M16.5 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />
  </Svg>
);

export const GearIcon = () => (
  <Svg>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M5.6 18.4l1.6-1.6M16.8 7.2l1.6-1.6" />
  </Svg>
);
