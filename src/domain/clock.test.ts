import { describe, expect, it } from 'vitest';
import { MutableClock } from './clock';

describe('clock', () => {
  it('pins and advances', () => {
    const c = new MutableClock('2026-02-27');
    expect(c.today()).toBe('2026-02-27');
    c.advance(3);
    expect(c.today()).toBe('2026-03-02');
    expect(c.now().getDate()).toBe(2);
    c.set(null);
    expect(c.isPinned).toBe(false);
  });
});
