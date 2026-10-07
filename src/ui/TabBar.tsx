import type { ReactNode } from 'react';
import { ForecastIcon, HomeIcon, ListIcon, PlanIcon, PlusIcon } from './Icons';

function Tab({
  href,
  label,
  active,
  children,
}: {
  href: string;
  label: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <a className="tab" href={`#${href}`} aria-current={active ? 'page' : undefined}>
      {children}
      <span className="tab__label">{label}</span>
    </a>
  );
}

export function TabBar({ route, onAdd }: { route: string; onAdd(): void }) {
  return (
    <nav className="tabbar" aria-label="Main">
      <Tab href="/" label="Home" active={route === '/'}>
        <HomeIcon />
      </Tab>
      <Tab href="/activity" label="Activity" active={route === '/activity'}>
        <ListIcon />
      </Tab>
      <button type="button" className="tab tab--add" onClick={onAdd}>
        <span className="tab__fab">
          <PlusIcon size={28} />
        </span>
        <span className="tab__label">Add</span>
      </button>
      <Tab href="/forecast" label="Forecast" active={route === '/forecast'}>
        <ForecastIcon />
      </Tab>
      <Tab href="/plan" label="Plan" active={route === '/plan'}>
        <PlanIcon />
      </Tab>
    </nav>
  );
}
