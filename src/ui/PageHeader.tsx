import { BackIcon, GearIcon } from './Icons';

interface PageHeaderProps {
  title: string;
  /** Show a back link instead of the settings link. */
  backTo?: string;
}

export function PageHeader({ title, backTo }: PageHeaderProps) {
  return (
    <header className="page-header">
      {backTo !== undefined && (
        <a className="icon-btn" href={`#${backTo}`} aria-label="Back">
          <BackIcon />
        </a>
      )}
      <h1 className="page-header__title">{title}</h1>
      {backTo === undefined && (
        <a className="icon-btn" href="#/settings" aria-label="Settings">
          <GearIcon />
        </a>
      )}
    </header>
  );
}
