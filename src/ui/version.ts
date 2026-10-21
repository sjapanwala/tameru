// Which build is running, and a one-time "What's new" after a new version loads.

import { RELEASES } from '../copy/releases';
import { S } from '../copy/strings';
import { unseenReleases, type Release } from '../domain/releases';
import { toast } from './toast';

export const APP_VERSION = __APP_VERSION__;
export const APP_BUILD = __APP_BUILD__;
/** "v0.2.0 · efed703" */
export const versionLabel = `v${APP_VERSION} · ${APP_BUILD}`;

const SEEN_KEY = 'tameru.seenBuild';

/**
 * After an update, say so once: returns the release notes to show, or toasts when a
 * build has none (a fix). Nothing on the very first run.
 */
export function announceUpdate(): Release[] {
  try {
    const seen = localStorage.getItem(SEEN_KEY);
    const now = `${APP_VERSION}+${APP_BUILD}`;
    if (seen !== now) localStorage.setItem(SEEN_KEY, now);
    if (!seen || seen === now) return [];
    const notes = unseenReleases(RELEASES, seen.split('+')[0] ?? '', APP_VERSION);
    if (!notes.length) toast(S.more.updated(APP_VERSION));
    return notes;
  } catch {
    return []; /* storage blocked: skip it */
  }
}

/** The latest notes, for "What's new" under More. */
export const latestReleases = (): Release[] => unseenReleases(RELEASES, '0', APP_VERSION, 3);
