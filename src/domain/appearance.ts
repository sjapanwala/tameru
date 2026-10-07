// How the app looks on this device: theme and accent colour. Pure; the
// browser side (storage, applying it to the document) is in pwa/appearance.ts.

export const THEMES = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const;

export const ACCENTS = [
  { value: 'shu', label: 'Orange' },
  { value: 'navy', label: 'Navy' },
  { value: 'sage', label: 'Sage' },
] as const;

export type Theme = (typeof THEMES)[number]['value'];
export type Accent = (typeof ACCENTS)[number]['value'];

export interface Appearance {
  theme: Theme;
  accent: Accent;
}

export const DEFAULT_APPEARANCE: Appearance = { theme: 'system', accent: 'shu' };

/** Reads a stored appearance, falling back field by field on anything unexpected. */
export function parseAppearance(raw: string | null): Appearance {
  let stored: Partial<Record<keyof Appearance, unknown>> = {};
  try {
    const value: unknown = raw ? JSON.parse(raw) : null;
    if (value && typeof value === 'object') stored = value;
  } catch {
    // Not JSON: use the defaults.
  }
  return {
    theme: THEMES.find((t) => t.value === stored.theme)?.value ?? DEFAULT_APPEARANCE.theme,
    accent: ACCENTS.find((a) => a.value === stored.accent)?.value ?? DEFAULT_APPEARANCE.accent,
  };
}
