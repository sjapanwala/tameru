// Keeps the installed app on the latest build. iOS resumes a suspended PWA without
// navigating, so the browser never looks for a new service worker on its own: we ask
// whenever the app comes back, and swap to the new build only when the reload can't
// interrupt anything (just opened, or switched away, and no sheet half filled in).

import { registerSW } from 'virtual:pwa-register';

const CHECK_EVERY_MS = 30 * 60_000;
const MIN_GAP_MS = 60_000; // flicking between apps shouldn't hit the network each time
const GRACE_MS = 3_000; // a reload this soon after opening, before any tap, costs nothing

export interface Moment {
  hidden: boolean;
  sheetOpen: boolean;
  touched: boolean; // any tap or key since the app was opened or resumed
  sinceOpenMs: number;
}

/** Whether a waiting build can take over right now without losing anything. */
export function safeToReload(m: Moment): boolean {
  if (m.sheetOpen) return false;
  return m.hidden || (!m.touched && m.sinceOpenMs < GRACE_MS);
}

export function checkDue(lastCheck: number, now: number): boolean {
  return now - lastCheck >= MIN_GAP_MS;
}

export function keepUpdated(): void {
  let reg: ServiceWorkerRegistration | undefined;
  let lastCheck = Date.now();
  let openedAt = Date.now();
  let touched = false;
  let waiting = false;

  const tryApply = () => {
    const now: Moment = {
      hidden: document.visibilityState === 'hidden',
      sheetOpen: document.body.classList.contains('sheet-open'),
      touched,
      sinceOpenMs: Date.now() - openedAt,
    };
    if (waiting && safeToReload(now)) void updateSW(true);
  };
  const check = () => {
    if (!reg || !navigator.onLine || !checkDue(lastCheck, Date.now())) return;
    lastCheck = Date.now();
    reg.update().catch(() => {}); // offline or a flaky network: the next resume tries again
  };

  const updateSW = registerSW({
    immediate: true,
    onRegisteredSW(_url, r) {
      reg = r;
      if (r) setInterval(() => document.visibilityState === 'visible' && check(), CHECK_EVERY_MS);
    },
    onNeedRefresh() {
      waiting = true;
      tryApply();
    },
  });

  const onTouch = () => void (touched = true);
  window.addEventListener('pointerdown', onTouch, { capture: true, passive: true });
  window.addEventListener('keydown', onTouch, { capture: true });
  window.addEventListener('online', check);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      openedAt = Date.now();
      touched = false;
      check();
    }
    tryApply();
  });
}
