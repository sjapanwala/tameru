// Which build is running, and a one-time "Updated" toast after a new version loads.

import { S } from '../copy/strings';
import { toast } from './toast';

export const APP_VERSION = __APP_VERSION__;
export const APP_BUILD = __APP_BUILD__;
/** "v0.2.0 · efed703" */
export const versionLabel = `v${APP_VERSION} · ${APP_BUILD}`;

const SEEN_KEY = 'tameru.seenBuild';

/** After an update, say so once. Nothing on the very first run. */
export function announceUpdate(): void {
  try {
    const seen = localStorage.getItem(SEEN_KEY);
    const now = `${APP_VERSION}+${APP_BUILD}`;
    if (seen !== now) localStorage.setItem(SEEN_KEY, now);
    if (seen && seen !== now) toast(S.more.updated(APP_VERSION));
  } catch {
    /* storage blocked: skip the toast */
  }
}
