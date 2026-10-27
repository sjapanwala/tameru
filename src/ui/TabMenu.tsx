// Shortcuts for a held tab: a column of round icon buttons, as wide as the tab,
// that rises out of it one after another and sinks back in when closed.
// Without lifting the finger, slide up onto one and let go to pick it (as with
// iOS context menus); or let go first and tap.

import { createPortal } from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { MenuItem } from './CardMenu';
import { haptic, reducedMotion } from './motion';

const CLOSE_MS = 220;
const GAP = 16; // between the tab bar and the first button

export function TabMenu({ rect, barTop, holder, items, onClose }: { rect: DOMRect; barTop: number; holder: { current: Element | null }; items: MenuItem[]; onClose: () => void }) {
  const [closing, setClosing] = useState(false);
  const close = (then?: () => void) => {
    // The action runs inside the tap (the camera only opens from one); the menu sinks after.
    then?.();
    if (reducedMotion()) return onClose();
    setClosing(true);
    window.setTimeout(onClose, CLOSE_MS);
  };
  // The button under the finger while it slides from the held tab.
  const [hot, setHot] = useState<number | null>(null);
  const hotRef = useRef<number | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    const under = (e: PointerEvent) => {
      const b = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('.tab-menu__stack button');
      return b ? Number(b.dataset.i) : null;
    };
    const onMove = (e: PointerEvent) => {
      const i = under(e);
      if (i !== hotRef.current && i !== null) haptic(8);
      hotRef.current = i;
      setHot(i);
    };
    // Letting go on a button picks it (a touch pointerup still counts as a tap, so the camera can open).
    const onUp = (e: PointerEvent) => {
      const i = under(e);
      hotRef.current = null;
      setHot(null);
      if (i !== null && holder.current?.contains(e.target as Node)) close(items[i]!.run);
      holder.current = null;
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    document.body.classList.add('tab-menu-open');
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.classList.remove('tab-menu-open');
    };
  }, []);

  return createPortal(
    <div class={`tab-menu${closing ? ' tab-menu--closing' : ''}`} role="dialog" aria-modal="true">
      <div class="tab-menu__backdrop" onClick={() => close()} />
      <ul class="tab-menu__stack" role="menu" style={{ left: `${rect.left}px`, width: `${rect.width}px`, bottom: `${window.innerHeight - barTop + GAP}px` }}>
        {items.map((it, i) => (
          <li key={it.label} role="none" style={{ '--i': i, '--n': items.length }}>
            <button type="button" role="menuitem" data-i={i} class={hot === i ? 'hot' : ''} aria-label={it.label} title={it.label} onClick={() => close(it.run)}>
              {it.icon}
            </button>
          </li>
        ))}
      </ul>
    </div>,
    document.body,
  );
}
