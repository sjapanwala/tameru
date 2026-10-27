// Shortcuts for a held tab: a column of round icon buttons, as wide as the tab,
// that rises out of it one after another and sinks back in when closed.

import { createPortal } from 'preact/compat';
import { useEffect, useState } from 'preact/hooks';
import type { MenuItem } from './CardMenu';
import { reducedMotion } from './motion';

const CLOSE_MS = 220;
const GAP = 10; // between the tab bar and the first button

export function TabMenu({ rect, items, onClose }: { rect: DOMRect; items: MenuItem[]; onClose: () => void }) {
  const [closing, setClosing] = useState(false);
  const close = (then?: () => void) => {
    // The action runs inside the tap (the camera only opens from one); the menu sinks after.
    then?.();
    if (reducedMotion()) return onClose();
    setClosing(true);
    window.setTimeout(onClose, CLOSE_MS);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    document.body.classList.add('tab-menu-open');
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.classList.remove('tab-menu-open');
    };
  }, []);

  return createPortal(
    <div class={`tab-menu${closing ? ' tab-menu--closing' : ''}`} role="dialog" aria-modal="true">
      <div class="tab-menu__backdrop" onClick={() => close()} />
      <ul class="tab-menu__stack" role="menu" style={{ left: `${rect.left}px`, width: `${rect.width}px`, bottom: `${window.innerHeight - rect.top + GAP}px` }}>
        {items.map((it, i) => (
          <li key={it.label} role="none" style={{ '--i': i, '--n': items.length }}>
            <button type="button" role="menuitem" aria-label={it.label} title={it.label} onClick={() => close(it.run)}>
              {it.icon}
            </button>
          </li>
        ))}
      </ul>
    </div>,
    document.body,
  );
}
