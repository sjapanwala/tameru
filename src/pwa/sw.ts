import { registerSW } from 'virtual:pwa-register';

/**
 * Register the service worker. `onUpdateReady` is called when a new version
 * has been downloaded; call the function it receives to activate it and
 * reload. We never reload on our own, so an entry in progress isn't lost.
 */
let started = false;

export function initServiceWorker(onUpdateReady: (apply: () => void) => void): void {
  if (started) return;
  started = true;
  const update = registerSW({
    onNeedRefresh() {
      onUpdateReady(() => void update(true));
    },
  });
}
