import { describe, expect, it } from 'vitest';
import { centsForPercent, percentOf, shareTicks } from './allocation';

describe('plan dial allocation', () => {
  it('turns cents into whole ticks that never add up past what is planned', () => {
    const t = shareTicks([{ key: 'a', cents: 3333 }, { key: 'b', cents: 3333 }, { key: 'c', cents: 3334 }], 10000);
    expect(t.map((x) => x.ticks)).toEqual([33, 33, 34]);
    expect(shareTicks([{ key: 'a', cents: 2550 }, { key: 'b', cents: 2450 }], 10000).map((x) => x.ticks)).toEqual([26, 24]);
    // half planned: 50 ticks, the rest stay empty
    expect(shareTicks([{ key: 'a', cents: 5000 }], 10000)[0]!.ticks).toBe(50);
  });

  it('scales an over-planned budget to fill the dial, and copes with no income', () => {
    const t = shareTicks([{ key: 'a', cents: 9000 }, { key: 'b', cents: 3000 }], 10000);
    expect(t.map((x) => x.ticks)).toEqual([75, 25]);
    expect(shareTicks([{ key: 'a', cents: 0 }], 0)[0]!.ticks).toBe(0);
  });

  it('converts between percentages and whole-dollar cents', () => {
    expect(percentOf(42000, 300000)).toBeCloseTo(14);
    expect(percentOf(100, 0)).toBe(0);
    expect(centsForPercent(14, 314166)).toBe(44000);
    expect(centsForPercent(0, 314166)).toBe(0);
  });
});
