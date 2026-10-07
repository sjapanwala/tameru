// Developer override for the install gate: a code typed into the gate's
// hidden field lets this browser run the app in a tab. It's a fact about
// this device, so it lives in localStorage.
// TODO: a fixed code shipped in the bundle is not security. Replace it.
const KEY = 'tameru.gate';
const CODE = '0000';

export function isUnlocked(): boolean {
  try {
    return localStorage.getItem(KEY) === 'open';
  } catch {
    return false;
  }
}

/** Stores the override if the code is right. The caller reloads to apply it. */
export function unlock(code: string): boolean {
  if (code !== CODE) return false;
  try {
    localStorage.setItem(KEY, 'open');
    return true;
  } catch {
    return false;
  }
}

export function lock(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to remove.
  }
}
