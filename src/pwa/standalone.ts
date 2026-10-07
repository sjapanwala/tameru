import { isStandalone as detectStandalone, platform, type Platform } from '../domain/platform';

/** True when launched from the home screen rather than a browser tab. */
export function isStandalone(): boolean {
  return detectStandalone({
    matchMedia: (query) => window.matchMedia(query),
    standalone: (navigator as Navigator & { standalone?: boolean }).standalone,
  });
}

export function currentPlatform(): Platform {
  return platform({ userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints });
}
