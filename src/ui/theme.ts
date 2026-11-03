// Applies the accent colour: a data-theme attribute on <html> picks the accent in
// tokens.css (the neutral base is shared). It's mirrored in localStorage so index.html can set it before the
// first paint, without waiting for the database.

import { THEME_IDS, type ThemeId } from '../domain/types';

export const THEME_KEY = 'tameru-theme';

/** The page colour, light and dark (as in tokens.css), for theme-color. Every accent shares it. */
const PAGE_BG: [light: string, dark: string] = ['#ffffff', '#000000'];

export function applyTheme(theme: ThemeId | undefined): void {
  // Blue is the default; a theme that no longer exists (Paper, Harbor, Kiln) falls back to it.
  const id: ThemeId = theme && THEME_IDS.includes(theme) ? theme : 'blue';
  const root = document.documentElement;
  if (id === 'blue') delete root.dataset.theme;
  else root.dataset.theme = id;
  try {
    if (id === 'blue') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, id);
  } catch {
    // private mode: it's still applied from settings on every launch
  }
  // Browser chrome and older iOS status bars follow theme-color.
  const [light, dark] = PAGE_BG;
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => (m.content = m.media.includes('dark') ? dark : light));
}
