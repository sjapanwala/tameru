// Generates the placeholder app icons (teal ground, three rising white bars)
// as PNGs with no dependencies. Run with `npm run icons`.
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const TEAL = [0x0a, 0x7a, 0x66];
const WHITE = [0xff, 0xff, 0xff];

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: RGB
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    const row = y * (size * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = rgb(x, y);
      raw[row + 1 + x * 3] = r;
      raw[row + 2 + x * 3] = g;
      raw[row + 3 + x * 3] = b;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Bars in unit space: [x, top, width, bottom]
const BARS = [
  [0.22, 0.56, 0.14, 0.78],
  [0.43, 0.4, 0.14, 0.78],
  [0.64, 0.22, 0.14, 0.78],
];
const RADIUS = 0.045;

function inBars(u, v) {
  return BARS.some(([x, top, w, bottom]) => {
    const cx = Math.min(Math.max(u, x + RADIUS), x + w - RADIUS);
    const cy = Math.min(Math.max(v, top + RADIUS), bottom - RADIUS);
    return Math.hypot(u - cx, v - cy) <= RADIUS;
  });
}

function icon(size, scale) {
  const SS = 4;
  return encodePng(size, (x, y) => {
    let hits = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const u = ((x + (sx + 0.5) / SS) / size - 0.5) / scale + 0.5;
        const v = ((y + (sy + 0.5) / SS) / size - 0.5) / scale + 0.5;
        if (inBars(u, v)) hits++;
      }
    }
    const t = hits / (SS * SS);
    return TEAL.map((c, i) => Math.round(c + (WHITE[i] - c) * t));
  });
}

const out = new URL('../public/icons/', import.meta.url);
mkdirSync(out, { recursive: true });
const files = [
  ['icon-192.png', 192, 1],
  ['icon-512.png', 512, 1],
  ['apple-touch-icon.png', 180, 1],
  // Maskable: keep artwork inside the central safe zone.
  ['maskable-512.png', 512, 0.7],
];
for (const [name, size, scale] of files) {
  writeFileSync(new URL(name, out), icon(size, scale));
  console.log(`public/icons/${name}`);
}
