// Workaround for iOS Home Screen web apps: the system's blur over the status bar can
// stick after launch. Briefly showing a near-transparent full-screen layer and sliding
// a panel across makes iOS recompose the screen without it. Nothing is visible or
// tappable (pointer-events: none), and it's gone after half a second.

import { isStandalone } from './standalone';

const SHOW_MS = 500;

export function resetIosBlur(): void {
  if (!isStandalone() || !/iPhone|iPad|iPod/.test(navigator.userAgent)) return;
  const run = () => {
    const cover = document.createElement('div');
    cover.className = 'blur-reset blur-reset__cover';
    const panel = document.createElement('div');
    panel.className = 'blur-reset blur-reset__panel';
    document.body.append(cover, panel);
    void panel.offsetWidth; // apply the off-screen start position before sliding
    requestAnimationFrame(() => {
      cover.classList.add('on');
      panel.classList.add('on');
      window.setTimeout(() => {
        cover.classList.remove('on');
        panel.classList.remove('on');
        window.setTimeout(() => (cover.remove(), panel.remove()), 400);
      }, SHOW_MS);
    });
  };
  if (document.readyState === 'complete') run();
  else window.addEventListener('load', run, { once: true });
}
