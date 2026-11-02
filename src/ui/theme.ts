// Applies the colour theme: a data-theme attribute on <html> picks the token set in
// tokens.css. It's mirrored in localStorage so index.html can set it before the
// first paint, without waiting for the database.

import { THEME_IDS, type ThemeId } from '../domain/types';

export const THEME_KEY = 'tameru-theme';

/** Each theme's page colour, light and dark (as in tokens.css), for theme-color. */
export const THEME_BG: Record<ThemeId, [light: string, dark: string]> = {
  paper: ['#f6f4ef', '#191815'],
  harbor: ['#f2f5f6', '#0e1720'],
  kiln: ['#f7f0e8', '#1c130e'],
};

export function applyTheme(theme: ThemeId | undefined): void {
  // Paper is the default; a theme that no longer exists falls back to it.
  const id: ThemeId = theme && THEME_IDS.includes(theme) ? theme : 'paper';
  const root = document.documentElement;
  if (id === 'paper') delete root.dataset.theme;
  else root.dataset.theme = id;
  try {
    if (id === 'paper') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, id);
  } catch {
    // private mode: it's still applied from settings on every launch
  }
  // Browser chrome and older iOS status bars follow theme-color.
  const [light, dark] = THEME_BG[id];
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => (m.content = m.media.includes('dark') ? dark : light));
}
