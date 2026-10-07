import { useSyncExternalStore } from 'react';
import { parseAppearance, type Appearance } from '../domain/appearance';

// Theme and accent are how this device shows the app, not app data, so they
// live in localStorage: readable before first paint and by the install gate.
const KEY = 'tameru.appearance';

// Page colours for the browser/status bar (--bg in tokens.css).
const BAR = { light: '#F5F4EF', dark: '#0E100F' };

function read(): Appearance {
  try {
    return parseAppearance(localStorage.getItem(KEY));
  } catch {
    return parseAppearance(null);
  }
}

let current = read();
const listeners = new Set<() => void>();

function apply({ theme, accent }: Appearance): void {
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
  if (accent === 'shu') delete root.dataset.accent;
  else root.dataset.accent = accent;

  // index.html has one theme-color per system scheme; a fixed theme sets both.
  for (const scheme of ['light', 'dark'] as const) {
    document
      .querySelector(`meta[name="theme-color"][media*="${scheme}"]`)
      ?.setAttribute('content', BAR[theme === 'system' ? scheme : theme]);
  }
}

/** Called once from main.tsx, before the first render. */
export function initAppearance(): void {
  apply(current);
}

export function setAppearance(change: Partial<Appearance>): void {
  current = { ...current, ...change };
  apply(current);
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Ignore: the choice still holds until the app is closed.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAppearance(): Appearance {
  return useSyncExternalStore(subscribe, () => current);
}
