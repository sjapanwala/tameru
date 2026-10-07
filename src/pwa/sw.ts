import { registerSW } from 'virtual:pwa-register';

type Apply = () => void;

let started = false;
let pending: Apply | null = null;
let listener: ((apply: Apply) => void) | null = null;

/**
 * Register the service worker (once, from main.tsx).
 * - 'auto': a new version is applied straight away. Used by the install
 *   gate, where there is nothing to lose by reloading.
 * - 'prompt': the app is told an update is waiting (see onUpdateReady) and
 *   decides when to reload, so an entry in progress isn't lost.
 */
export function initServiceWorker(mode: 'auto' | 'prompt'): void {
  if (started) return;
  started = true;
  const update = registerSW({
    onNeedRefresh() {
      const apply = () => void update(true);
      if (mode === 'auto') apply();
      else if (listener) listener(apply);
      else pending = apply;
    },
  });
}

/** Be told when a new version has been downloaded and is ready to apply. */
export function onUpdateReady(callback: (apply: Apply) => void): void {
  listener = callback;
  if (pending) {
    callback(pending);
    pending = null;
  }
}
