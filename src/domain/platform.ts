// Where is Tameru running? Pure: callers pass in what they read from the
// browser, so this is testable with plain objects.

export interface DisplayEnv {
  /** window.matchMedia, or something shaped like it. */
  matchMedia?: (query: string) => { matches: boolean };
  /** navigator.standalone: iOS Safari's flag for home-screen apps. */
  standalone?: boolean;
}

/** True when launched from the home screen rather than a browser tab. */
export function isStandalone({ matchMedia, standalone }: DisplayEnv): boolean {
  if (standalone === true) return true;
  return matchMedia?.('(display-mode: standalone)').matches === true;
}

export type Platform =
  | 'ios_safari'
  | 'ios_other_browser'
  | 'ios_in_app_browser'
  | 'android_chrome'
  | 'android_other'
  | 'desktop';

export interface AgentEnv {
  userAgent: string;
  /** navigator.maxTouchPoints; tells an iPad from the Mac it claims to be. */
  maxTouchPoints?: number;
}

// Apps that open links in their own embedded browser.
const IN_APP =
  /Instagram|FBAN|FBAV|FB_IAB|Messenger|Line\/|Twitter|TikTok|musical_ly|BytedanceWebview|Snapchat|LinkedInApp|Pinterest|WhatsApp|WeChat|MicroMessenger|GSA\//i;
const IOS_OTHER_BROWSER = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|DuckDuckGo|Brave|YaBrowser|Focus\//;
const ANDROID_NOT_CHROME =
  /SamsungBrowser|EdgA|OPR\/|Firefox|DuckDuckGo|YaBrowser|UCBrowser|; wv\)/;

/** Which install instructions fit this browser. */
export function platform({ userAgent, maxTouchPoints = 0 }: AgentEnv): Platform {
  const ios =
    /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
  if (ios) {
    // Real Safari always sends "Safari/"; embedded web views usually don't.
    if (IN_APP.test(userAgent) || !/Safari\//.test(userAgent)) return 'ios_in_app_browser';
    if (IOS_OTHER_BROWSER.test(userAgent)) return 'ios_other_browser';
    return 'ios_safari';
  }
  if (/Android/.test(userAgent)) {
    if (IN_APP.test(userAgent) || ANDROID_NOT_CHROME.test(userAgent)) return 'android_other';
    return /Chrome\//.test(userAgent) ? 'android_chrome' : 'android_other';
  }
  return 'desktop';
}

/**
 * The one decision at the app root: in a browser tab, show only the install
 * gate. `allowBrowser` is the developer escape hatch (VITE_ALLOW_BROWSER);
 * `unlocked` is the code typed into the gate's hidden field.
 */
export function shouldShowGate(input: {
  standalone: boolean;
  allowBrowser: boolean;
  unlocked: boolean;
}): boolean {
  return !input.standalone && !input.allowBrowser && !input.unlocked;
}
