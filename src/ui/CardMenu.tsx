// iOS-style context menu for a held card: the card lifts above a dimmed screen
// and a short menu appears beneath it (or above, if there's no room).

import { createPortal } from 'preact/compat';
import { useEffect, useState } from 'preact/hooks';
import { reducedMotion } from './motion';

export interface MenuItem {
  label: string;
  icon: preact.ComponentChildren;
  destructive?: boolean;
  run: () => void;
}

const CLOSE_MS = 260;

export function CardMenu({ rect, card, items, onClose }: { rect: DOMRect; card: preact.ComponentChildren; items: MenuItem[]; onClose: () => void }) {
  const [closing, setClosing] = useState(false);
  const close = (then?: () => void) => {
    const done = () => {
      onClose();
      then?.();
    };
    if (reducedMotion()) return done();
    setClosing(true);
    window.setTimeout(done, CLOSE_MS);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    document.body.classList.add('sheet-open'); // also tucks the tab bar away
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.classList.remove('sheet-open');
    };
  }, []);

  const menuH = items.length * 50 + 8;
  const below = rect.bottom + 14 + menuH < window.innerHeight - 16;
  const menuTop = below ? rect.bottom + 14 : Math.max(16, rect.top - 14 - menuH);
  // At the end of <body>, so no transformed ancestor can trap the fixed overlay.
  return createPortal(
    <div class={`card-menu${closing ? ' card-menu--closing' : ''}`} role="dialog" aria-modal="true">
      <div class="card-menu__backdrop" onClick={() => close()} />
      <div class="card-menu__card" style={{ top: `${rect.top}px`, left: `${rect.left}px`, width: `${rect.width}px` }} aria-hidden="true">
        {card}
      </div>
      <ul class="card-menu__list" role="menu" style={{ top: `${menuTop}px`, left: `${rect.left + rect.width / 2}px`, transformOrigin: below ? 'top center' : 'bottom center' }}>
        {items.map((it) => (
          <li key={it.label} role="none">
            <button type="button" role="menuitem" class={it.destructive ? 'destructive' : ''} onClick={() => close(it.run)}>
              <span>{it.label}</span>
              {it.icon}
            </button>
          </li>
        ))}
      </ul>
    </div>,
    document.body,
  );
}
