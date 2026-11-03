// Floating pill tab bar. The active tab sits in a solid circle.
// Hold a tab for its shortcuts (add from Activity without opening it, and so on).
// Slide a finger along the bar and the circle follows it from tab to tab; let go to
// open the tab under it.

import { useEffect, useRef, useState } from 'preact/hooks';
import { S } from '../copy/strings';
import { ActivityIcon, ArrowDownLeft, BellIcon, CameraIcon, CardIcon, GearIcon, HomeIcon, MoreIcon, PlanIcon, PlusIcon, SparkIcon, SwapIcon, UploadIcon } from './Icons';
import type { MenuItem } from './CardMenu';
import { haptic } from './motion';
import { go } from './router';
import { scanReceipt } from './scan';
import { TabMenu } from './TabMenu';
import { useLongPress } from './useLongPress';

/** Screens reached from More still highlight the More tab. */
export const MORE_PATHS = ['/more', '/recurring', '/settings', '/debug'];

type TabKey = 'home' | 'activity' | 'plan' | 'accounts' | 'more';

const SCRUB = 10; // px sideways before a press on the bar becomes a slide

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

  // Sliding along the bar: `preview` is the tab under the finger while it moves.
  const nav = useRef<HTMLElement>(null);
  const slide = useRef<{ x: number; on: boolean } | null>(null);
  const [preview, setPreview] = useState<number | null>(null);
  const [fingerX, setFingerX] = useState<number | null>(null); // the circle's x while sliding
  const current = TABS.findIndex(([p]) => active(p));
  // Where the circle sits over tab i, measured from the tabs themselves.
  const tabLeft = (i: number) => (nav.current?.querySelectorAll<HTMLElement>('.tab')[i]?.offsetLeft ?? 6 + i * 52);
  // Which tab a point is over, from the tabs' own boxes (a finger's touch adjustment
  // would snap to the nearest tab anyway; this keeps the slide steady between them).
  const tabAt = (x: number) => {
    const tabs = Array.from(nav.current?.querySelectorAll<HTMLElement>('.tab') ?? []);
    let best = 0;
    let dist = Infinity;
    tabs.forEach((t, i) => {
      const r = t.getBoundingClientRect();
      const d = Math.abs(x - (r.left + r.width / 2));
      if (d < dist) (dist = d), (best = i);
    });
    return best;
  };
  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0];
    slide.current = t && e.touches.length === 1 ? { x: t.clientX, on: false } : null;
  };
  const onTouchMove = (e: TouchEvent) => {
    const s = slide.current;
    const t = e.touches[0];
    if (!s || !t || menu) return; // holding opened the shortcuts: that gesture wins
    if (!s.on) {
      if (Math.abs(t.clientX - s.x) < SCRUB) return;
      s.on = true;
    }
    // The circle follows the finger, kept between the first and last tab.
    const box = nav.current!.getBoundingClientRect();
    const first = tabLeft(0);
    const last = tabLeft(TABS.length - 1);
    setFingerX(Math.max(first, Math.min(last, t.clientX - box.left - 25)));
    const i = tabAt(t.clientX);
    if (i !== preview) {
      haptic(4);
      setPreview(i);
    }
  };
  const onTouchEnd = (e: TouchEvent) => {
    const s = slide.current;
    slide.current = null;
    if (!s?.on) return; // a tap: the tab's own link handles it
    e.preventDefault(); // no click on the tab the slide started from
    const i = preview;
    setPreview(null);
    setFingerX(null); // springs onto the tab
    if (i !== null) go(TABS[i]![0]);
  };

  return (
    <>
      <nav
        ref={nav}
        class={`tabbar${preview !== null ? ' tabbar--sliding' : ''}`}
        aria-label={S.nav.tabs}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={() => ((slide.current = null), setPreview(null), setFingerX(null))}
      >
        {/* One circle behind the tabs: it glides between them, and follows a sliding finger. */}
        {(current >= 0 || preview !== null) && (
          <span
            class={`tabbar__dot${fingerX !== null ? ' tabbar__dot--drag' : ''}`}
            aria-hidden="true"
            style={{ transform: `translateX(${fingerX ?? tabLeft(preview ?? current)}px)` }}
          />
        )}
        {TABS.map(([p, key, Icon], i) => (
          <Tab key={p} path={p} label={S.nav[key]} current={preview !== null ? preview === i : active(p)} onHold={(el) => {
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
