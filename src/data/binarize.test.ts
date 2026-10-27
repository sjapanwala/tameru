import { describe, expect, it } from 'vitest';
import { binarize } from './binarize';

describe('adaptive black and white', () => {
  it('keeps dark ink as ink in both a bright and a shadowed half', () => {
    // 40×10: left half bright paper (220) with ink (120), right half in shadow (110) with ink (50).
    const w = 40;
    const h = 10;
    const px = new Uint8ClampedArray(w * h).map((_, i) => (i % w < 20 ? 220 : 110));
    px[5 * w + 10] = 120;
    px[5 * w + 30] = 50;
    binarize(px, w, h, 15);
    expect(px[5 * w + 10]).toBe(0);
    expect(px[5 * w + 30]).toBe(0);
    // shadowed paper stays white, though it's darker than the ink on the bright side
    expect(px[2 * w + 30]).toBe(255);
    expect(px[2 * w + 5]).toBe(255);
  });
});
