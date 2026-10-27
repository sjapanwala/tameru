// Adaptive black-and-white for receipt photos (Bradley's local-mean threshold).
// A single global cut-off loses text in a shadow or under glare; comparing each
// pixel with the average of its neighbourhood keeps ink dark everywhere.

/**
 * Greyscale values in, 0/255 out, in place. `window` is the neighbourhood size in
 * pixels; a pixel `darker` (a fraction) below its neighbourhood's mean becomes ink,
 * as long as that's at least `minGap` levels, so flat paper or table grain stays white.
 */
export function binarize(grey: Uint8ClampedArray | Uint8Array, width: number, height: number, window = Math.max(15, Math.round(width / 12)), darker = 0.15, minGap = 24): void {
  // Summed-area table: any rectangle's sum in four lookups.
  const sat = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      row += grey[y * width + x]!;
      sat[(y + 1) * (width + 1) + x + 1] = sat[y * (width + 1) + x + 1]! + row;
    }
  }
  const half = window >> 1;
  const out = new Uint8Array(grey.length);
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - half);
    const y1 = Math.min(height, y + half + 1);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - half);
      const x1 = Math.min(width, x + half + 1);
      const sum = sat[y1 * (width + 1) + x1]! - sat[y0 * (width + 1) + x1]! - sat[y1 * (width + 1) + x0]! + sat[y0 * (width + 1) + x0]!;
      const mean = sum / ((x1 - x0) * (y1 - y0));
      const v = grey[y * width + x]!;
      out[y * width + x] = v < mean * (1 - darker) && mean - v >= minGap ? 0 : 255;
    }
  }
  grey.set(out);
}
