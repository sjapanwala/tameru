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

export const defaultNewId = (): string => crypto.randomUUID();
