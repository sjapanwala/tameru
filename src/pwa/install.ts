import { useSyncExternalStore } from 'react';

// Chrome/Android fire beforeinstallprompt once, early. Capture it at module
// load (imported from main.tsx) so the install gate can use it later.

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferred = event as BeforeInstallPromptEvent;
  notify();
});

window.addEventListener('appinstalled', () => {
  deferred = null;
  installed = true;
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

/** True once the browser reports the app was installed from this tab. */
export function useJustInstalled(): boolean {
  return useSyncExternalStore(subscribe, () => installed);
}

export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferred) return 'unavailable';
  const event = deferred;
  await event.prompt();
  const { outcome } = await event.userChoice;
  // The event can only be used once.
  deferred = null;
  if (outcome === 'accepted') installed = true;
  notify();
  return outcome;
}
