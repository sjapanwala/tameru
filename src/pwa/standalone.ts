// Decides whether the real app may run. Pure helpers are exported for tests.

export type Platform = 'ios' | 'android' | 'other';

export function detectPlatform(userAgent: string, maxTouchPoints = 0): Platform {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios';
  // iPadOS reports a Mac user agent but has touch.
  if (/Macintosh/i.test(userAgent) && maxTouchPoints > 1) return 'ios';
  if (/Android/i.test(userAgent)) return 'android';
  return 'other';
}

export interface GateInput {
  requireInstall: boolean; // VITE_REQUIRE_INSTALL; the gate is off unless this is set
  standalone: boolean;
  search: string; // location.search
  envAllowBrowser: boolean; // VITE_ALLOW_BROWSER
  sessionBypass: boolean; // ?dev=1 seen earlier this session
}

/** True when the app should run; false shows the install gate. */
export function shouldRunApp(i: GateInput): boolean {
  return !i.requireInstall || i.standalone || i.envAllowBrowser || i.sessionBypass || hasDevFlag(i.search);
}

export const hasDevFlag = (search: string): boolean => new URLSearchParams(search).get('dev') === '1';

/** Dev features (debug panel) are on in dev builds or when the bypass is active. */
export function devMode(): boolean {
  return import.meta.env.DEV || browserBypassActive();
}

const BYPASS_KEY = 'tameru.devBypass';

function browserBypassActive(): boolean {
  try {
    return import.meta.env.VITE_ALLOW_BROWSER === 'true' || sessionStorage.getItem(BYPASS_KEY) === '1';
  } catch {
    return false;
  }
}

export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
}

export function runAppInThisWindow(): boolean {
  const search = window.location.search;
  if (hasDevFlag(search)) {
    try {
      sessionStorage.setItem(BYPASS_KEY, '1');
    } catch {
      /* private mode: the flag still works for this load */
    }
  }
  return shouldRunApp({
    requireInstall: import.meta.env.VITE_REQUIRE_INSTALL === 'true',
    standalone: isStandalone(),
    search,
    envAllowBrowser: import.meta.env.VITE_ALLOW_BROWSER === 'true',
    sessionBypass: browserBypassActive(),
  });
}
