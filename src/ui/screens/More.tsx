// More: everything that isn't a tab. A profile card leads to Settings; below it, grouped
// rows (an icon tile, a live subtitle, a chevron): Upcoming with what's due next, then
// Settings (showing the accent), What's new (the version) and, in dev builds, Debug.

import { fmtDate, money, S } from '../../copy/strings';
import { THEME_IDS } from '../../domain/types';
import { initials } from '../../domain/onboarding';
import { devMode } from '../../pwa/standalone';
import { upcoming } from '../../services/recurring';
import { PageHeader } from '../components';
import { useLoad } from '../hooks';
import { BellIcon, ChevronRight, GearIcon, PersonIcon, SparkIcon } from '../Icons';
import { versionLabel } from '../version';

const UPCOMING_DAYS = 30;

interface Row {
  href: string;
  icon: preact.ComponentChildren;
  title: string;
  sub?: string;
  badge?: number;
}

export function More() {
  const settings = useLoad((a) => a.repos.settings.get());
  const next = useLoad((a) => upcoming(a, UPCOMING_DAYS));
  const pending = useLoad(async (a) => (await a.repos.transactions.all()).filter((t) => t.status === 'pending').length);
  const name = settings?.userName?.trim();
  const theme = settings?.theme && THEME_IDS.includes(settings.theme) ? settings.theme : 'blue';
  const soonest = next?.[0];

  const moneyRows: Row[] = [
    {
      href: '/recurring',
      icon: <BellIcon />,
      title: S.nav.recurring,
      sub: soonest ? S.more.nextUp(soonest.item.name, money(soonest.amountCents), fmtDate(soonest.date)) : next ? S.more.nothingDue : undefined,
      badge: pending || undefined,
    },
  ];
  const appRows: Row[] = [
    { href: '/settings', icon: <GearIcon />, title: S.nav.settings, sub: S.more.accent(S.settings.themes[theme]) },
    { href: '/whats-new', icon: <SparkIcon />, title: S.whatsNew.title, sub: versionLabel },
    ...(devMode() ? [{ href: '/debug', icon: <GearIcon />, title: S.nav.debug, sub: S.more.debugSub }] : []),
  ];

  return (
    <section class="more">
      <PageHeader title={S.nav.more} />

      <a class="more-profile" href="#/settings">
        <span class="more-profile__mark" aria-hidden="true">
          {initials(name) || <PersonIcon />}
        </span>
        <span class="more-profile__text">
          <span class="more-profile__name">{name || S.settings.addName}</span>
          <span class="more-profile__sub">{S.more.profileSub}</span>
        </span>
        <ChevronRight />
      </a>

      <Group title={S.more.money} rows={moneyRows} />
      <Group title={S.more.app} rows={appRows} />

      <p class="colophon">
        {S.more.colophon}
        <br />
        {versionLabel}
      </p>
    </section>
  );
}

function Group({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <>
      <h2 class="more-group__title">{title}</h2>
      <ul class="more-group">
        {rows.map((r) => (
          <li key={r.href}>
            <a class="more-row" href={`#${r.href}`}>
              <span class="more-row__icon" aria-hidden="true">
                {r.icon}
              </span>
              <span class="more-row__text">
                <span class="more-row__title">{r.title}</span>
                {r.sub && <span class="more-row__sub">{r.sub}</span>}
              </span>
              {r.badge !== undefined && (
                <span class="more-row__badge" aria-label={S.home.pending(r.badge)}>
                  {r.badge}
                </span>
              )}
              <ChevronRight />
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}
