// A list row that swipes sideways, as in iOS Mail: drag left to delete, right to edit.
// Past the threshold the action runs on release; short of it the row springs back.
// Vertical drags are left to the page so the list still scrolls.

import { useRef } from 'preact/hooks';
import { haptic } from './motion';

/** Fraction of the row's width a drag must pass to trigger its action. */
const TRIGGER = 0.3;

export function SwipeRow(props: {
  onDelete: () => void;
  onEdit?: () => void;
  deleteLabel: string;
  editLabel: string;
  deleteIcon: preact.ComponentChildren;
  editIcon: preact.ComponentChildren;
  children: preact.ComponentChildren;
}) {
  const row = useRef<HTMLDivElement>(null);
  const g = useRef<{ x: number; y: number; id: number; dx: number; on: boolean; armed: boolean } | null>(null);
  const swallowClick = useRef(false);

  const set = (dx: number, animate: boolean) => {
    const el = row.current!;
    el.style.transition = animate ? '' : 'none';
    el.style.transform = dx ? `translateX(${dx}px)` : '';
    el.parentElement!.dataset.swipe = dx < 0 ? 'delete' : dx > 0 ? 'edit' : '';
  };

  const onDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    swallowClick.current = false;
    g.current = { x: e.clientX, y: e.clientY, id: e.pointerId, dx: 0, on: false, armed: false };
  };
  const onMove = (e: PointerEvent) => {
    const s = g.current;
    if (!s || e.pointerId !== s.id) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (!s.on) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) return void (g.current = null); // scrolling
      if (Math.abs(dx) < 10) return;
      if (dx > 0 && !props.onEdit) return void (g.current = null);
      s.on = true;
      row.current!.setPointerCapture(e.pointerId);
    }
    const w = row.current!.offsetWidth;
    // No edit action: resist dragging right. Past the threshold, a small haptic says "let go now".
    s.dx = dx > 0 && !props.onEdit ? 0 : dx;
    const armed = Math.abs(s.dx) > w * TRIGGER;
    if (armed !== s.armed) {
      s.armed = armed;
      if (armed) haptic(8);
      row.current!.parentElement!.classList.toggle('swipe--armed', armed);
    }
    set(s.dx, false);
  };
  const onUp = (e: PointerEvent) => {
    const s = g.current;
    g.current = null;
    if (!s || e.pointerId !== s.id || !s.on) return;
    swallowClick.current = true; // the release after a drag isn't a tap
    const el = row.current!;
    el.parentElement!.classList.remove('swipe--armed');
    if (s.armed && s.dx < 0) {
      set(-el.offsetWidth, true);
      window.setTimeout(props.onDelete, 220);
      return;
    }
    set(0, true);
    if (s.armed && s.dx > 0) props.onEdit?.();
  };

  return (
    <div class="swipe">
      <div class="swipe__action swipe__action--edit" aria-hidden="true">
        {props.editIcon}
        <span>{props.editLabel}</span>
      </div>
      <div class="swipe__action swipe__action--delete" aria-hidden="true">
        <span>{props.deleteLabel}</span>
        {props.deleteIcon}
      </div>
      <div
        ref={row}
        class="swipe__row"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onClickCapture={(e) => {
          if (!swallowClick.current) return;
          swallowClick.current = false;
          e.stopPropagation();
          e.preventDefault();
        }}
      >
        {props.children}
      </div>
    </div>
  );
}
