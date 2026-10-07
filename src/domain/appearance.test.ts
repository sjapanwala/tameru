import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE, parseAppearance } from './appearance';

describe('parseAppearance', () => {
  it('reads a stored choice', () => {
    expect(parseAppearance('{"theme":"dark","accent":"navy"}')).toEqual({
      theme: 'dark',
      accent: 'navy',
    });
  });

  it('falls back to the defaults when nothing usable is stored', () => {
    expect(parseAppearance(null)).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance('not json')).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance('"dark"')).toEqual(DEFAULT_APPEARANCE);
  });

  it('keeps the valid field when the other is unknown', () => {
    expect(parseAppearance('{"theme":"sepia","accent":"sage"}')).toEqual({
      theme: 'system',
      accent: 'sage',
    });
  });
});
