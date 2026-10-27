// Applies the colour theme: a data-theme attribute on <html> picks the token set in
// tokens.css. It's mirrored in localStorage so index.html can set it before the
// first paint, without waiting for the database.

import { THEME_IDS, type ThemeId } from '../domain/types';

export const THEME_KEY = 'tameru-theme';

/** Each theme's page colour, light and dark (as in tokens.css), for theme-color. */
export const THEME_BG: Record<ThemeId, [light: string, dark: string]> = {
  ink: ['#ffffff', '#0e0e0e'],
  paper: ['#f6f3ec', '#12110e'],
  slate: ['#f7f8fa', '#0b0e12'],
  sage: ['#f6f7f3', '#0d0f0c'],
  dusk: ['#f8f6f7', '#100d0f'],
};

export function applyTheme(theme: ThemeId | undefined): void {
  const id: ThemeId = theme && THEME_IDS.includes(theme) ? theme : 'ink';
  const root = document.documentElement;
  if (id === 'ink') delete root.dataset.theme;
  else root.dataset.theme = id;
  try {
    if (id === 'ink') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, id);
  } catch {
    // private mode: it's still applied from settings on every launch
  }
  // Browser chrome and older iOS status bars follow theme-color.
  const [light, dark] = THEME_BG[id];
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => (m.content = m.media.includes('dark') ? dark : light));
}
