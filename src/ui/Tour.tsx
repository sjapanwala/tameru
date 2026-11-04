// The tour: every page in turn. Each page opens with a card saying what's on it (take
// it or skip to the next page), then a spotlight on each feature with what it does
// and, where there's a gesture, how to try it. Chapter tabs on the note jump between
// pages. It runs once after onboarding (settings.tourPending) and again from Settings.
// A feature that isn't on screen (no credit card yet, say) is passed over.

import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { S } from '../copy/strings';
import { useApp } from './hooks';
import { ActivityIcon, BellIcon, CardIcon, CloseIcon, GearIcon, HomeIcon, MoreIcon, PlanIcon, PlusIcon } from './Icons';
import { haptic, reducedMotion } from './motion';
import { go } from './router';

type Chapter = 'home' | 'activity' | 'plan' | 'accounts' | 'upcoming' | 'add' | 'more' | 'settings';
type Target = string | (() => Element | null | undefined);

interface Stop {
  id: string; // key into S.tour.stops, or "<chapter>.intro"
  chapter: Chapter;
  path: string;
  target?: Target; // none: the chapter's intro card
}

const CHAPTERS: { id: Chapter; path: string; icon: () => preact.JSX.Element }[] = [
  { id: 'home', path: '/', icon: HomeIcon },
  { id: 'activity', path: '/transactions', icon: ActivityIcon },
  { id: 'plan', path: '/plan', icon: PlanIcon },
  { id: 'accounts', path: '/accounts', icon: CardIcon },
  { id: 'upcoming', path: '/recurring', icon: BellIcon },
  { id: 'add', path: '/add?type=expense', icon: PlusIcon },
  { id: 'more', path: '/more', icon: MoreIcon },
  { id: 'settings', path: '/settings', icon: GearIcon },
];

/** What follows a section heading with this text (the list or panel it heads). */
const under = (text: string) => () => {
  const h = [...document.querySelectorAll('main h2')].find((x) => x.textContent?.trim() === text);
  return (h?.closest('.section-head') ?? h)?.nextElementSibling;
};
/** A Settings group by its title. */
const group = (title: string) => () => [...document.querySelectorAll('.settings-group')].find((g) => g.querySelector('.settings-group__title')?.textContent === title);
/** A credit card's analysis panel that holds `inner`. */
const panelWith = (inner: string) => () => document.querySelector(inner)?.closest('.cardx-panel');

const FEATURES: Record<Chapter, [string, Target][]> = {
  home: [
    ['home.profile', '.home .mark'],
    ['home.bell', '.home a[href="#/recurring"]'],
    ['home.cardsHead', '.home .section-head--cards'],
    ['home.stack', '.home .stack'],
    ['home.safe', '.home .today'],
    ['home.bar', '.home .today__bar'],
    ['home.actions', '.home .actions'],
    ['home.quick', '.home .quick'],
    ['home.recent', '.home .txlist'],
  ],
  activity: [
    ['activity.tools', '.activity .head-actions'],
    ['activity.hero', '.activity .act-hero'],
    ['activity.chart', '.activity .act-chart'],
    ['activity.cats', '.activity .act-cats__head'],
    ['activity.cards', '.activity .act-cards-wrap[data-on="true"]'],
    ['activity.filters', '.activity .act-tools'],
    ['activity.list', '.activity .day'],
  ],
  plan: [
    ['plan.wheel', '.plan .wheel'],
    ['plan.head', '.plan .head-actions'],
    ['plan.categories', '.plan .prow-list'],
    ['plan.goals', under(S.plan.goals)],
  ],
  accounts: [
    ['accounts.roll', '.accounts .roll'],
    ['accounts.head', '.accounts .head-actions'],
    ['accounts.headline', '.accounts .acct__head'],
    ['accounts.todo', '.accounts .cardx-todo'],
    ['accounts.cycle', panelWith('.cardx-track')],
    ['accounts.pay', '.accounts .cardx-pay'],
    ['accounts.history', panelWith('.cardx-bars, .cardx-headrow')],
    ['accounts.use', panelWith('.cardx-use')],
    ['accounts.outlook', '.accounts .cardx-tiles'],
    ['accounts.tiles', '.accounts .acct > .tiles'],
    ['accounts.recent', under(S.home.recent)],
  ],
  upcoming: [
    ['upcoming.head', '.upcoming .head-actions'],
    ['upcoming.needs', '.upcoming .up-cards'],
    ['upcoming.timeline', under(S.upcoming.timeline)],
    ['upcoming.all', '.upcoming .up-seg'],
  ],
  add: [
    ['add.type', '.add > .segmented'],
    ['add.amount', '.add .entry'],
    ['add.more', '.add .add__more'],
  ],
  more: [
    ['more.profile', '.more .more-profile'],
    ['more.rows', '.more .more-group'],
  ],
  settings: [
    ['settings.theme', '.settings .theme-picker'],
    ['settings.budget', group(S.settings.groups.budget)],
    ['settings.reminders', group(S.settings.groups.notifications)],
    ['settings.security', group(S.settings.groups.security)],
    ['settings.fresh', group(S.settings.groups.freshStart)],
    ['settings.data', group(S.settings.data)],
    ['settings.tour', () => [...document.querySelectorAll('.settings-row')].find((r) => r.textContent?.includes(S.settings.tour))],
  ],
};

const STOPS: Stop[] = [
  ...CHAPTERS.flatMap((c) => [
    { id: `${c.id}.intro`, chapter: c.id, path: c.path },
    ...FEATURES[c.id].map(([id, target]) => ({ id, chapter: c.id, path: c.path, target })),
  ]),
  { id: 'end.tabbar', chapter: 'settings' as Chapter, path: '/', target: '.tabbar' },
];

const find = (t: Target): Element | null => (typeof t === 'string' ? document.querySelector(t) : (t() ?? null));
const PAD = 8;
const GAP = 14;

export function Tour({ onEnd }: { onEnd: () => void }) {
  const { app, bump } = useApp();
  const [i, setI] = useState(0);
  const dir = useRef<1 | -1>(1);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [noteH, setNoteH] = useState(260);
  const note = useRef<HTMLDivElement>(null);
  const stop = STOPS[i]!;
  const chapter = CHAPTERS.find((c) => c.id === stop.chapter)!;
  const intro = !stop.target;
  const last = i === STOPS.length - 1;
  const inChapter = STOPS.filter((s) => s.chapter === stop.chapter && s.target && s.id !== 'end.tabbar');
  const at = inChapter.findIndex((s) => s.id === stop.id);

  const finish = async () => {
    await app.repos.settings.update({ tourPending: false });
    bump();
    go('/');
    onEnd();
  };
  const to = (n: number) => {
    dir.current = n < i ? -1 : 1;
    haptic(6);
    setI(Math.max(0, Math.min(STOPS.length - 1, n)));
  };
  const nextChapter = () => {
    const n = STOPS.findIndex((s, k) => k > i && !s.target);
    n < 0 ? to(STOPS.length - 1) : to(n);
  };
  const jumpTo = (c: Chapter) => to(STOPS.findIndex((s) => s.chapter === c));

  // Go to the stop's page, wait for its feature to appear, bring it into view, measure.
  useEffect(() => {
    // Already on its page, the feature is there or it isn't: don't keep the screen dark
    // waiting. After moving page, give the new page a moment to draw.
    const samePage = location.hash.replace(/^#/, '').split('?')[0] === stop.path.split('?')[0];
    go(stop.path);
    setRect(null);
    if (!stop.target) return;
    const patience = samePage ? 3 : 24;
    let tries = 0;
    let timer = 0;
    let raf = 0;
    const look = () => {
      const el = find(stop.target!);
      if (!el || (el as HTMLElement).offsetParent === null) {
        if (++tries < patience) timer = window.setTimeout(look, 60);
        else setI((k) => Math.max(0, Math.min(STOPS.length - 1, k + dir.current))); // not here: pass it over
        return;
      }
      // Bring it up near the top, so the note has room underneath. (Things near the
      // end of a page can't go that far; the note then sits above them.)
      (el as HTMLElement).style.scrollMarginTop = 'calc(env(safe-area-inset-top) + 56px)';
      el.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' });
      timer = window.setTimeout(() => (raf = requestAnimationFrame(() => setRect(el.getBoundingClientRect()))), reducedMotion() ? 0 : 420);
    };
    timer = window.setTimeout(look, 80);
    return () => (clearTimeout(timer), cancelAnimationFrame(raf));
  }, [i]);

  // Keep the spotlight on its feature as the page scrolls or the window changes.
  useLayoutEffect(() => {
    if (!stop.target) return;
    const re = () => {
      const el = find(stop.target!);
      if (el) setRect(el.getBoundingClientRect());
    };
    window.addEventListener('resize', re);
    window.addEventListener('scroll', re, true);
    return () => (window.removeEventListener('resize', re), window.removeEventListener('scroll', re, true));
  }, [i]);

  useLayoutEffect(() => {
    if (note.current) setNoteH(note.current.offsetHeight);
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
      if (e.key === 'ArrowRight') last ? finish() : to(i + 1);
      if (e.key === 'ArrowLeft' && i > 0) to(i - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [i]);

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const hole = rect && {
    top: Math.max(6, rect.top - PAD),
    left: Math.max(6, rect.left - PAD),
    right: Math.min(vw - 6, rect.right + PAD),
    bottom: Math.min(vh - 6, rect.bottom + PAD),
  };
  // The note goes where there's room: under the feature, over it, or failing both,
  // pinned to the bottom of the screen.
  const place = (() => {
    if (!hole) return { top: `${Math.max(16, (vh - noteH) / 2)}px` };
    if (vh - hole.bottom >= noteH + GAP + 12) return { top: `${hole.bottom + GAP}px` };
    if (hole.top >= noteH + GAP + 12) return { top: `${hole.top - GAP - noteH}px` };
    return { bottom: 'calc(16px + env(safe-area-inset-bottom))' };
  })();

  const copy = intro ? undefined : S.tour.stops[stop.id]!;
  const ch = S.tour.chapters[stop.chapter]!;
  const Icon = chapter.icon;

  return (
    <div class="tour" role="dialog" aria-modal="true" aria-label={intro ? ch.title : copy!.title}>
      <div class={`tour__scrim${hole ? ' is-clear' : ''}`} />
      {hole && <div class="tour__hole" style={{ top: `${hole.top}px`, left: `${hole.left}px`, width: `${hole.right - hole.left}px`, height: `${hole.bottom - hole.top}px` }} />}

      {(intro || hole) && (
        <div ref={note} class={`tour__note${intro ? ' tour__note--intro' : ''}`} key={i} style={place}>
          {/* the pages, to jump between */}
          <nav class="tour__chapters" aria-label={S.tour.onThisPage}>
            {CHAPTERS.map((c) => {
              const CI = c.icon;
              return (
                <button type="button" key={c.id} class={c.id === stop.chapter ? 'is-on' : ''} aria-label={S.tour.chapters[c.id]!.title} aria-current={c.id === stop.chapter} onClick={() => jumpTo(c.id)}>
                  <CI />
                </button>
              );
            })}
            <button type="button" class="tour__end" aria-label={S.tour.skip} onClick={finish}>
              <CloseIcon />
            </button>
          </nav>

          {intro ? (
            <>
              <span class="tour__icon" aria-hidden="true">
                <Icon />
              </span>
              <h2>{ch.title}</h2>
              <p>{ch.summary}</p>
              <p class="tour__label">{S.tour.onThisPage}</p>
              <ol class="tour__list">
                {inChapter.map((s) => (
                  <li key={s.id}>{S.tour.stops[s.id]!.title}</li>
                ))}
              </ol>
              <div class="tour__actions">
                <button type="button" class="link" onClick={nextChapter}>
                  {S.tour.skipPage}
                </button>
                <button type="button" class="primary" onClick={() => to(i + 1)}>
                  {S.tour.showMe}
                </button>
              </div>
            </>
          ) : (
            <>
              {at >= 0 && (
                <div class="tour__progress" aria-label={S.tour.step(at + 1, inChapter.length)}>
                  {inChapter.map((s, k) => (
                    <span key={s.id} class={k < at ? 'is-done' : k === at ? 'is-on' : ''} />
                  ))}
                </div>
              )}
              <p class="tour__eyebrow">
                {stop.id === 'end.tabbar' ? S.tour.lastThing : ch.title}
                {at >= 0 && <span class="num"> · {S.tour.step(at + 1, inChapter.length)}</span>}
              </p>
              <h2>{copy!.title}</h2>
              <p>{copy!.body}</p>
              {copy!.tip && (
                <p class="tour__tip">
                  <b>{S.tour.tryIt}</b> {copy!.tip}
                </p>
              )}
              <div class="tour__actions">
                <button type="button" class="link" disabled={i === 0} onClick={() => to(i - 1)}>
                  {S.tour.back}
                </button>
                <button type="button" class="primary" onClick={() => (last ? finish() : to(i + 1))}>
                  {last ? S.tour.done : S.tour.next}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
