import { describe, expect, it } from 'vitest';
import { isStandalone, platform, shouldShowGate } from './platform';

const media = (matching: string[]) => (query: string) => ({ matches: matching.includes(query) });

describe('isStandalone', () => {
  it('is true for display-mode: standalone', () => {
    expect(isStandalone({ matchMedia: media(['(display-mode: standalone)']) })).toBe(true);
  });

  it('is true for iOS navigator.standalone even when the media query says no', () => {
    expect(isStandalone({ matchMedia: media([]), standalone: true })).toBe(true);
  });

  it('is false in an ordinary tab', () => {
    expect(isStandalone({ matchMedia: media([]), standalone: false })).toBe(false);
    expect(isStandalone({ matchMedia: media(['(display-mode: browser)']) })).toBe(false);
    expect(isStandalone({})).toBe(false);
  });

  it('does not treat other display modes as installed', () => {
    expect(isStandalone({ matchMedia: media(['(display-mode: minimal-ui)']) })).toBe(false);
  });
});

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)';
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko)';
const MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15';

describe('platform', () => {
  it.each([
    ['iPhone Safari', `${IPHONE} Version/18.5 Mobile/15E148 Safari/604.1`, 0, 'ios_safari'],
    ['iPad Safari (claims to be a Mac)', MAC, 5, 'ios_safari'],
    [
      'Chrome on iOS',
      `${IPHONE} CriOS/139.0.7258.76 Mobile/15E148 Safari/604.1`,
      0,
      'ios_other_browser',
    ],
    [
      'Firefox on iOS',
      `${IPHONE} FxiOS/141.0 Mobile/15E148 Safari/605.1.15`,
      0,
      'ios_other_browser',
    ],
    [
      'Edge on iOS',
      `${IPHONE} Version/18.0 EdgiOS/138.0 Mobile/15E148 Safari/605.1.15`,
      0,
      'ios_other_browser',
    ],
    [
      'Instagram on iOS',
      `${IPHONE} Mobile/22F76 Instagram 389.0.0.49.87 (iPhone16,2; iOS 18_5)`,
      0,
      'ios_in_app_browser',
    ],
    [
      'Facebook on iOS',
      `${IPHONE} Mobile/22F76 [FBAN/FBIOS;FBAV/520.0.0;FBDV/iPhone16,2]`,
      0,
      'ios_in_app_browser',
    ],
    [
      'TikTok on iOS',
      `${IPHONE} Mobile/15E148 musical_ly_40.1.0 BytedanceWebview/d8a21c6`,
      0,
      'ios_in_app_browser',
    ],
    [
      'Google app on iOS',
      `${IPHONE} GSA/380.0.788317806 Mobile/15E148 Safari/604.1`,
      0,
      'ios_in_app_browser',
    ],
    ['an unnamed iOS web view', `${IPHONE} Mobile/15E148`, 0, 'ios_in_app_browser'],
    ['Chrome on Android', `${ANDROID} Chrome/139.0.0.0 Mobile Safari/537.36`, 5, 'android_chrome'],
    [
      'Samsung Internet',
      `${ANDROID} SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36`,
      5,
      'android_other',
    ],
    [
      'Firefox on Android',
      'Mozilla/5.0 (Android 15; Mobile; rv:141.0) Gecko/141.0 Firefox/141.0',
      5,
      'android_other',
    ],
    [
      'Edge on Android',
      `${ANDROID} Chrome/138.0.0.0 Mobile Safari/537.36 EdgA/138.0.0.0`,
      5,
      'android_other',
    ],
    [
      'an Android web view',
      'Mozilla/5.0 (Linux; Android 15; Pixel 9 Build/AP4A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/139.0.0.0 Mobile Safari/537.36',
      5,
      'android_other',
    ],
    [
      'Instagram on Android',
      `${ANDROID} Chrome/139.0.0.0 Mobile Safari/537.36 Instagram 389.0.0.42.84 Android`,
      5,
      'android_other',
    ],
    ['Safari on a Mac', MAC, 0, 'desktop'],
    [
      'Chrome on Windows',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
      0,
      'desktop',
    ],
    [
      'a touchscreen Windows laptop',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
      10,
      'desktop',
    ],
  ])('%s', (_, userAgent, maxTouchPoints, expected) => {
    expect(platform({ userAgent, maxTouchPoints })).toBe(expected);
  });
});

describe('shouldShowGate', () => {
  it('gates every browser tab unless the developer flag is on', () => {
    expect(shouldShowGate({ standalone: false, allowBrowser: false })).toBe(true);
    expect(shouldShowGate({ standalone: false, allowBrowser: true })).toBe(false);
    expect(shouldShowGate({ standalone: true, allowBrowser: false })).toBe(false);
  });
});
