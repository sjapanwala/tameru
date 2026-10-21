// "What's new": the release notes for the versions since the user last opened the app.

import { S } from '../copy/strings';
import type { Release } from '../domain/releases';
import { Sheet } from './Sheet';

export function WhatsNew({ releases, onClose }: { releases: Release[]; onClose: () => void }) {
  const [latest, ...earlier] = releases;
  if (!latest) return null;
  return (
    <Sheet label={S.whatsNew.title} onClose={onClose}>
      <div class="whats-new">
        <p class="eyebrow">{S.whatsNew.title}</p>
        <h2>{S.whatsNew.version(latest.version)}</h2>
        <Notes release={latest} />
        {earlier.map((r) => (
          <section key={r.version} class="whats-new__earlier">
            <p class="field-label">{S.whatsNew.version(r.version)}</p>
            <Notes release={r} />
          </section>
        ))}
        <div class="sheet__actions">
          <button type="button" class="primary block" onClick={onClose}>
            {S.whatsNew.done}
          </button>
        </div>
      </div>
    </Sheet>
  );
}

function Notes({ release }: { release: Release }) {
  return (
    <ol class="whats-new__list">
      {release.items.map((it, i) => (
        <li key={it.title}>
          <span class="whats-new__n">{String(i + 1).padStart(2, '0')}</span>
          <span>
            <strong>{it.title}</strong>
            <small>{it.body}</small>
          </span>
        </li>
      ))}
    </ol>
  );
}
