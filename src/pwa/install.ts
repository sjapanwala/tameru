import { useSyncExternalStore } from 'react';

// Chrome/Android fire beforeinstallprompt once, early. Capture it at module
// load (imported from main.tsx) so the install screen can use it later.

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferred = event as BeforeInstallPromptEvent;
  notify();
});

window.addEventListener('appinstalled', () => {
  deferred = null;
  notify();
});

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Whether the browser has offered a native install prompt we can trigger. */
export function useCanPromptInstall(): boolean {
  return useSyncExternalStore(subscribe, () => deferred !== null);
}

export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferred) return 'unavailable';
  const event = deferred;
  await event.prompt();
  const { outcome } = await event.userChoice;
  // The event can only be used once.
  deferred = null;
  notify();
  return outcome;
}

// Per-session escape hatch for using the app in a browser tab. Session-scoped
// UI state, not app data.
const BROWSER_OK_KEY = 'tameru.browserOk';

export function getBrowserOverride(): boolean {
  try {
    return sessionStorage.getItem(BROWSER_OK_KEY) === '1';
  } catch {
    return false;
  }
}

export function setBrowserOverride(): void {
  try {
    sessionStorage.setItem(BROWSER_OK_KEY, '1');
  } catch {
    // Storage blocked: the override just lasts until reload.
  }
}
