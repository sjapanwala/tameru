// The dependencies every service receives. Swap the clock or repos in tests.

import type { Clock } from '../domain/clock';
import type { Repos } from '../data/repos/types';

export interface AppContext {
  clock: Clock;
  repos: Repos;
  newId(): string;
}

export const nowIso = (ctx: AppContext): string => ctx.clock.now().toISOString();

export function stamp<T extends object>(ctx: AppContext, row: T & { id?: string; createdAt?: string }) {
  const at = nowIso(ctx);
  return { ...row, id: row.id ?? ctx.newId(), createdAt: row.createdAt ?? at, updatedAt: at };
}

/**
 * A random v4 UUID. crypto.randomUUID only exists on secure pages (https, localhost) and
 * newer iOS, so fall back to getRandomValues, which works everywhere.
 */
export function defaultNewId(): string {
  if (typeof crypto.randomUUID === 'function' && globalThis.isSecureContext !== false) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40; // version 4
  b[8] = (b[8]! & 0x3f) | 0x80; // RFC 4122 variant
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
