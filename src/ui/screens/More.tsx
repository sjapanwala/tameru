import { S } from '../../copy/strings';
import { devMode } from '../../pwa/standalone';
import { PageHeader } from '../components';

export function More() {
  const links: [string, string][] = [
    ['/recurring', S.nav.recurring],
    ['/forecast', S.nav.forecast],
    ['/settings', S.nav.settings],
    ...(devMode() ? ([['/debug', S.nav.debug]] as [string, string][]) : []),
  ];
  return (
    <section>
      <PageHeader title={S.nav.more} />
      <div class="menu">
        {links.map(([href, label]) => (
          <a key={href} href={`#${href}`}>
            {label}
          </a>
        ))}
      </div>
      <p class="colophon">{S.more.colophon}</p>
    </section>
  );
}
