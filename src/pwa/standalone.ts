import { useSyncExternalStore } from 'react';

const DISPLAY_MODES = ['standalone', 'fullscreen', 'minimal-ui'].map(
  (mode) => `(display-mode: ${mode})`,
);

/** True when launched from the home screen rather than a browser tab. */
export function isStandalone(): boolean {
  // iOS Safari's own flag; display-mode covers everything else.
  if ((navigator as Navigator & { standalone?: boolean }).standalone === true) return true;
  return DISPLAY_MODES.some((query) => window.matchMedia(query).matches);
}

function subscribe(onChange: () => void): () => void {
  const lists = DISPLAY_MODES.map((query) => window.matchMedia(query));
  lists.forEach((list) => list.addEventListener('change', onChange));
  return () => lists.forEach((list) => list.removeEventListener('change', onChange));
}

export function useStandalone(): boolean {
  return useSyncExternalStore(subscribe, isStandalone);
}

export type Platform = 'ios-safari' | 'ios-other' | 'android' | 'desktop';

export function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; touch points give it away.
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (ios) return /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua) ? 'ios-other' : 'ios-safari';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}
