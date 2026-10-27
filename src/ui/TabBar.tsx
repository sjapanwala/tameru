// Floating pill tab bar. The active tab sits in a solid circle.
// Hold a tab for its shortcuts (add from Activity without opening it, and so on).

import { useEffect, useRef, useState } from 'preact/hooks';
import { S } from '../copy/strings';
import { ActivityIcon, ArrowDownLeft, BellIcon, CameraIcon, CardIcon, GearIcon, HomeIcon, MoreIcon, PlanIcon, PlusIcon, SparkIcon, SwapIcon, UploadIcon } from './Icons';
import type { MenuItem } from './CardMenu';
import { go } from './router';
import { scanReceipt } from './scan';
import { TabMenu } from './TabMenu';
import { useLongPress } from './useLongPress';

/** Screens reached from More still highlight the More tab. */
export const MORE_PATHS = ['/more', '/recurring', '/settings', '/debug'];

type TabKey = 'home' | 'activity' | 'plan' | 'accounts' | 'more';

const TABS: [string, TabKey, () => preact.JSX.Element][] = [
  ['/', 'home', HomeIcon],
  ['/transactions', 'activity', ActivityIcon],
  ['/plan', 'plan', PlanIcon],
  ['/accounts', 'accounts', CardIcon],
  ['/more', 'more', MoreIcon],
];

const M = S.tabMenu;
const spend: MenuItem = { label: M.spend, icon: <PlusIcon />, run: () => go('/add') };
const income: MenuItem = { label: M.income, icon: <ArrowDownLeft />, run: () => go('/add?type=income') };
const transfer: MenuItem = { label: M.transfer, icon: <SwapIcon />, run: () => go('/add?type=transfer') };
const photo: MenuItem = { label: M.photo, icon: <CameraIcon />, run: () => scanReceipt('camera') };
const upload: MenuItem = { label: M.upload, icon: <UploadIcon />, run: () => scanReceipt('upload') };

const SHORTCUTS: Record<TabKey, MenuItem[]> = {
  home: [spend, income, photo],
  activity: [spend, income, transfer, photo, upload],
  plan: [{ label: M.suggest, icon: <SparkIcon />, run: () => go('/plan?do=suggest') }, spend],
  accounts: [{ label: M.addAccount, icon: <CardIcon />, run: () => go('/accounts?id=new') }, transfer],
  more: [
    { label: S.nav.recurring, icon: <BellIcon />, run: () => go('/recurring') },
    { label: S.nav.settings, icon: <GearIcon />, run: () => go('/settings') },
    { label: M.whatsNew, icon: <SparkIcon />, run: () => go('/whats-new') },
  ],
};

export function TabBar({ path }: { path: string }) {
  const active = (p: string) => (p === '/more' ? MORE_PATHS.includes(path) : path === p);
  const [menu, setMenu] = useState<{ key: TabKey; rect: DOMRect; barTop: number } | null>(null);
  const held = useRef<Element | null>(null); // the tab still under the finger: its release can pick a shortcut
  useEffect(() => setMenu(null), [path]); // tapped another tab instead
  return (
    <>
      <nav class="tabbar" aria-label={S.nav.tabs}>
        {TABS.map(([p, key, Icon]) => (
          <Tab key={p} path={p} label={S.nav[key]} current={active(p)} onHold={(el) => {
              held.current = el;
              setMenu({ key, rect: el.getBoundingClientRect(), barTop: el.closest('.tabbar')!.getBoundingClientRect().top });
            }}>
            <Icon />
          </Tab>
        ))}
      </nav>
      {menu && <TabMenu rect={menu.rect} barTop={menu.barTop} holder={held} items={SHORTCUTS[menu.key]} onClose={() => setMenu(null)} />}
    </>
  );
}

function Tab(props: { path: string; label: string; current: boolean; onHold: (el: HTMLElement) => void; children: preact.ComponentChildren }) {
  const hold = useLongPress(props.onHold);
  return (
    <a class="tab" href={`#${props.path}`} aria-current={props.current ? 'page' : undefined} {...hold}>
      {props.children}
      <span class="sr-only">{props.label}</span>
    </a>
  );
}
