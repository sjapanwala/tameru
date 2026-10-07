import { PlusIcon } from './Icons';

const TABS = [
  { href: '/', label: 'Home', routes: ['/'] },
  { href: '/activity', label: 'Activity', routes: ['/activity'] },
  // Forecast lives inside Plan.
  { href: '/plan', label: 'Plan', routes: ['/plan', '/forecast'] },
];

/** Floating three-tab pill with a separate Add button. */
export function TabBar({ route, onAdd }: { route: string; onAdd(): void }) {
  return (
    <nav className="nav" aria-label="Main">
      <div className="nav__tabs">
        {TABS.map((tab) => (
          <a
            key={tab.href}
            className="nav__tab"
            href={`#${tab.href}`}
            aria-current={tab.routes.includes(route) ? 'page' : undefined}
          >
            {tab.label}
          </a>
        ))}
      </div>
      <button type="button" className="nav__add" aria-label="Add transaction" onClick={onAdd}>
        <PlusIcon size={22} />
      </button>
    </nav>
  );
}

/** Plan and Forecast share one tab; this switches between them. */
export function PlanTabs({ route }: { route: '/plan' | '/forecast' }) {
  return (
    <nav className="subtabs" aria-label="Plan sections">
      <a
        className="subtabs__tab"
        href="#/plan"
        aria-current={route === '/plan' ? 'page' : undefined}
      >
        Plan
      </a>
      <a
        className="subtabs__tab"
        href="#/forecast"
        aria-current={route === '/forecast' ? 'page' : undefined}
      >
        Forecast
      </a>
    </nav>
  );
}
