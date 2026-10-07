import { isStandalone } from './standalone';

// The outcome of the first-run persist() call is a fact about this device,
// not app data, so it lives in localStorage and is never exported.
const KEY = 'tameru.persist';

export interface PersistAttempt {
  requestedAt: string;
  granted: boolean;
}

export interface StorageStatus {
  supported: boolean;
  persisted: boolean;
  usageBytes: number | null;
  quotaBytes: number | null;
  firstRun: PersistAttempt | null;
}

function readAttempt(): PersistAttempt | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PersistAttempt) : null;
  } catch {
    return null;
  }
}

function writeAttempt(attempt: PersistAttempt): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(attempt));
  } catch {
    // Ignore: we'll simply ask again next launch.
  }
}

const supported = () => typeof navigator.storage?.persist === 'function';

/** Ask the browser not to evict our data. Safe to call repeatedly. */
export async function requestPersistence(): Promise<boolean> {
  if (!supported()) return false;
  const granted = await navigator.storage.persist();
  writeAttempt({ requestedAt: new Date().toISOString(), granted });
  return granted;
}

/**
 * Called at boot, before the app mounts: requests persistence the first time
 * we run installed. Resolves once the browser has answered, so Settings can
 * show the result from the very first screen.
 */
export async function requestPersistenceOnFirstRun(): Promise<void> {
  if (!isStandalone() || readAttempt()) return;
  try {
    await requestPersistence();
  } catch {
    // Non-fatal; Settings shows the current state and offers a retry.
  }
}

export async function getStorageStatus(): Promise<StorageStatus> {
  const status: StorageStatus = {
    supported: supported(),
    persisted: false,
    usageBytes: null,
    quotaBytes: null,
    firstRun: readAttempt(),
  };
  try {
    if (status.supported) status.persisted = await navigator.storage.persisted();
    if (typeof navigator.storage?.estimate === 'function') {
      const { usage, quota } = await navigator.storage.estimate();
      status.usageBytes = usage ?? null;
      status.quotaBytes = quota ?? null;
    }
  } catch {
    // Leave the defaults.
  }
  return status;
}
