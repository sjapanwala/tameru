// iOS 26 colours the status bar (and the fade below it) from a fixed element touching
// the top edge, falling back to the body's background (white here). While a dark hero
// sits under the status bar, this pins a strip in the hero's colour there so the bar
// reads as part of the hero. Once the hero scrolls away, it steps aside.

import { createPortal } from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/hooks';

export function StatusTint({ target }: { target: string }) {
  const [shown, setShown] = useState(true);
  const strip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let height = 0; // the status bar's height, measured while the strip is showing
    const check = () => {
      height = strip.current?.offsetHeight || height;
      const hero = document.querySelector(target);
      // Shown while any of the hero is still under the status bar.
      setShown(!!hero && hero.getBoundingClientRect().bottom > height);
    };
    check();
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    return () => {
      window.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
    };
  }, [target]);
  // At the end of <body> so no transformed ancestor can unpin it.
  return createPortal(<div ref={strip} class="status-tint" aria-hidden="true" hidden={!shown} />, document.body);
}
