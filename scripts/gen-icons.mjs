// Generates the app icons (dark "mon coin": bone coin with a T-shaped hole on
// a night ground, a stone ring behind it) as PNGs with no dependencies.
// Run with `npm run icons`.
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const NIGHT = [0x1b, 0x1a, 0x18];
const BONE = [0xec, 0xe5, 0xd7];
const STONE = [0x4a, 0x47, 0x40];

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

// Geometry is in the design's 100-unit space. Painted back to front: stone ring
// behind, the coin with its T-shaped hole, then a faint rim line on the coin.
const BACK_RING = { cx: 55, cy: 55, r: 30, width: 1.6 };
const COIN = { cx: 47, cy: 47, r: 30 };
const RIM = { cx: 47, cy: 47, r: 25.5, width: 0.9, opacity: 0.35 };
// T hole: [left, top, right, bottom]
const HOLE = [
  [36, 36, 58, 43],
  [43.5, 43, 50.5, 62],
];

const onRing = (x, y, { cx, cy, r, width }) =>
  Math.abs(Math.hypot(x - cx, y - cy) - r) <= width / 2;

const mix = (from, to, t) => from.map((c, i) => c + (to[i] - c) * t);

function sample(x, y) {
  let colour = onRing(x, y, BACK_RING) ? STONE : NIGHT;
  const inCoin = Math.hypot(x - COIN.cx, y - COIN.cy) <= COIN.r;
  const inHole = HOLE.some(([l, t, r, b]) => x >= l && x <= r && y >= t && y <= b);
  if (inCoin && !inHole) {
    colour = onRing(x, y, RIM) ? mix(BONE, NIGHT, RIM.opacity) : BONE;
  }
  return colour;
}

function icon(size, scale) {
  const SS = 4;
  return encodePng(size, (x, y) => {
    const sum = [0, 0, 0];
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const u = ((x + (sx + 0.5) / SS) / size - 0.5) / scale + 0.5;
        const v = ((y + (sy + 0.5) / SS) / size - 0.5) / scale + 0.5;
        sample(u * 100, v * 100).forEach((c, i) => (sum[i] += c));
      }
    }
    return sum.map((c) => Math.round(c / (SS * SS)));
  });
}

const out = new URL('../public/icons/', import.meta.url);
mkdirSync(out, { recursive: true });
const files = [
  ['icon-192.png', 192, 1],
  ['icon-512.png', 512, 1],
  ['apple-touch-icon.png', 180, 1],
  // Maskable: keep artwork inside the central safe zone.
  ['maskable-512.png', 512, 0.8],
];
for (const [name, size, scale] of files) {
  writeFileSync(new URL(name, out), icon(size, scale));
  console.log(`public/icons/${name}`);
}
