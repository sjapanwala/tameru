// Shared UI hooks: the app context and a data loader that re-runs after any mutation.

import { createContext } from 'preact';
import { useContext, useEffect, useState } from 'preact/hooks';
import type { App } from '../services/app';

export const AppCtx = createContext<{ app: App; version: number; bump: () => void } | null>(null);

export function useApp() {
  const v = useContext(AppCtx);
  if (!v) throw new Error('AppCtx missing');
  return v;
}

/** Loads data with fn(app); reloads whenever anything calls bump(). */
export function useLoad<T>(fn: (app: App) => Promise<T>, deps: unknown[] = []): T | undefined {
  const { app, version } = useApp();
  const [data, setData] = useState<T>();
  useEffect(() => {
    let live = true;
    fn(app).then((d) => live && setData(d));
    return () => {
      live = false;
    };
  }, [version, ...deps]);
  return data;
}
