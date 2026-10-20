// Floating pill tab bar. The active tab sits in a solid circle.

import { S } from '../copy/strings';
import { ActivityIcon, CardIcon, HomeIcon, MoreIcon, PlanIcon } from './Icons';

/** Screens reached from More still highlight the More tab. */
export const MORE_PATHS = ['/more', '/recurring', '/settings', '/debug'];

const TABS: [string, keyof typeof S.nav, () => preact.JSX.Element][] = [
  ['/', 'home', HomeIcon],
  ['/transactions', 'activity', ActivityIcon],
  ['/plan', 'plan', PlanIcon],
  ['/accounts', 'accounts', CardIcon],
  ['/more', 'more', MoreIcon],
];

export function TabBar({ path }: { path: string }) {
  const active = (p: string) => (p === '/more' ? MORE_PATHS.includes(path) : path === p);
  return (
    <nav class="tabbar" aria-label={S.nav.tabs}>
      {TABS.map(([p, key, Icon]) => (
        <a key={p} class="tab" href={`#${p}`} aria-current={active(p) ? 'page' : undefined}>
          <Icon />
          <span class="sr-only">{S.nav[key]}</span>
        </a>
      ))}
    </nav>
  );
}
