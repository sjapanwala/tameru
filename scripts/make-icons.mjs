#!/usr/bin/env node
// Draws the app icon and renders every size the app needs.
//
// The mark is the app's own dial: a ring of 40 ticks on the accent blue, three
// quarters of the way round, with the dial's knob where the lit ticks end, and a
// rounded "t" in the middle. Run `node scripts/make-icons.mjs`; it writes the app's
// public/favicon.svg and public/icons/*.png, and the site's logo.svg, apple-touch-icon.png
// and icon-512.png (rendered with headless Chrome).

import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const S = 1024; // drawing size; everything below is in these units
const C = { x: 512, y: 512 };

const TICKS = 40;
const LIT = 0.74; // share of the ring that's lit
const R_OUT = 352;
const R_SHORT = 312;
const R_LONG = 290;

function ticks() {
  let out = '';
  for (let i = 0; i < TICKS; i++) {
    const a = (i / TICKS) * 2 * Math.PI - Math.PI / 2;
    const r1 = i % 5 === 0 ? R_LONG : R_SHORT;
    const lit = i / TICKS < LIT;
    const [x1, y1, x2, y2] = [C.x + Math.cos(a) * r1, C.y + Math.sin(a) * r1, C.x + Math.cos(a) * R_OUT, C.y + Math.sin(a) * R_OUT].map((n) => n.toFixed(1));
    out += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#fff" stroke-opacity="${lit ? 1 : 0.3}"/>`;
  }
  return out;
}

function knob() {
  const a = LIT * 2 * Math.PI - Math.PI / 2;
  const r = (R_OUT + R_SHORT) / 2;
  const x = (C.x + Math.cos(a) * r).toFixed(1);
  const y = (C.y + Math.sin(a) * r).toFixed(1);
  return `<circle cx="${x}" cy="${y}" r="44" fill="#fff" filter="url(#lift)"/><circle cx="${x}" cy="${y}" r="20" fill="url(#bg)"/>`;
}

// A rounded lowercase t, centred in the ring.
const T = `<path transform="translate(512 520) scale(0.8) translate(-502 -507)" d="M492 330V600a84 84 0 0 0 84 84H608M396 452H608" fill="none" stroke="#fff" stroke-width="84" stroke-linecap="round" stroke-linejoin="round"/>`;

/** The full-bleed square (iOS and Android round the corners themselves). */
function icon({ corner = 0 } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0.35" y2="1">
    <stop offset="0" stop-color="#3b9bff"/>
    <stop offset="0.55" stop-color="#0a77f5"/>
    <stop offset="1" stop-color="#0058d6"/>
  </linearGradient>
  <radialGradient id="glow" cx="0.3" cy="0.18" r="0.75">
    <stop offset="0" stop-color="#fff" stop-opacity="0.22"/>
    <stop offset="1" stop-color="#fff" stop-opacity="0"/>
  </radialGradient>
  <filter id="lift" x="-50%" y="-50%" width="200%" height="200%">
    <feDropShadow dx="0" dy="6" stdDeviation="9" flood-color="#002a6e" flood-opacity="0.35"/>
  </filter>
</defs>
<rect width="${S}" height="${S}" rx="${corner}" fill="url(#bg)"/>
<rect width="${S}" height="${S}" rx="${corner}" fill="url(#glow)"/>
<g stroke-width="26" stroke-linecap="round">${ticks()}</g>
${knob()}
${T}
</svg>`;
}

const root = new URL('..', import.meta.url).pathname;
const tmp = mkdtempSync(join(tmpdir(), 'tameru-icon-'));
const square = join(tmp, 'icon.svg');
writeFileSync(square, icon());
const rounded = icon({ corner: 230 }).replace(/\n/g, '');
writeFileSync(join(root, 'public/favicon.svg'), rounded);
writeFileSync(join(root, 'site/public/logo.svg'), rounded);

// Headless Chrome screenshots the SVG at each size.
for (const [name, px] of [
  ['icon-512.png', 512],
  ['icon-192.png', 192],
  ['apple-touch-icon.png', 180],
]) {
  const page = join(tmp, `${px}.html`);
  writeFileSync(page, `<html><body style="margin:0;background:#000"><img src="file://${square}" width="${px}" height="${px}" style="display:block"></body></html>`);
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', `--window-size=${px},${px}`, `--screenshot=${join(root, 'public/icons', name)}`, `file://${page}`], { stdio: 'ignore' });
  console.log(`wrote public/icons/${name}`);
}
// The site uses the same files.
copyFileSync(join(root, 'public/icons/apple-touch-icon.png'), join(root, 'site/public/apple-touch-icon.png'));
copyFileSync(join(root, 'public/icons/icon-512.png'), join(root, 'site/public/icon-512.png'));
console.log('wrote public/favicon.svg, site/public/logo.svg, site/public/apple-touch-icon.png, site/public/icon-512.png');
