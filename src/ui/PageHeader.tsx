import { BackIcon, GearIcon } from './Icons';

interface PageHeaderProps {
  title: string;
  /** Small monospaced line under the title (Home's date line). */
  sub?: string;
  /** Show a back link instead of the settings link. */
  backTo?: string;
}

export function PageHeader({ title, sub, backTo }: PageHeaderProps) {
  return (
    <header className={`page-header${sub ? ' page-header--month' : ''}`}>
      {backTo !== undefined && (
        <a className="icon-btn icon-btn--back" href={`#${backTo}`} aria-label="Back">
          <BackIcon size={22} />
        </a>
      )}
      <h1 className="page-header__title">
        {title}
        {sub && <span className="page-header__sub mono">{sub}</span>}
      </h1>
      {backTo === undefined && (
        <a
          className={`icon-btn${sub ? '' : ' icon-btn--surface'}`}
          href="#/settings"
          aria-label="Settings"
        >
          <GearIcon size={20} />
        </a>
      )}
    </header>
  );
}
