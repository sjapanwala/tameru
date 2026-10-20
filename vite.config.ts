import { execSync } from 'node:child_process';
import { cpSync, createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vitest/config';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

const CARD_ART_DIR = resolve(__dirname, 'cards/card-art');

/** Shown in the app (More) so it's clear which build is running: package version + commit. */
const APP_VERSION: string = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')).version;
const APP_BUILD = (() => {
  const sha = process.env.CF_PAGES_COMMIT_SHA; // set on Cloudflare Pages builds
  if (sha) return sha.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'dev';
  }
})();
const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.js': 'text/javascript',
  '.gz': 'application/octet-stream', // tesseract inflates the model itself; never send Content-Encoding
};

/**
 * Files served from outside public/: the card art, and the on-device OCR engine
 * (Tesseract worker, WASM core, English model) so receipt scanning never touches a CDN.
 * In dev they're served from their source folders; at build they're copied into dist.
 */
const MOUNTS: { url: string; dir: string; include?: (file: string) => boolean }[] = [
  { url: 'card-art', dir: CARD_ART_DIR },
  { url: 'ocr/core', dir: resolve(__dirname, 'node_modules/tesseract.js-core'), include: (f) => /-lstm\.wasm\.js$/.test(f) },
  { url: 'ocr/lang', dir: resolve(__dirname, 'node_modules/@tesseract.js-data/eng/4.0.0_best_int') },
  { url: 'ocr', dir: resolve(__dirname, 'node_modules/tesseract.js/dist'), include: (f) => f === 'worker.min.js' },
];

function staticMounts(): Plugin {
  let outDir = 'dist';
  let copy = false;
  // Longest prefix first so /ocr/core wins over /ocr.
  const mounts = [...MOUNTS].sort((a, b) => b.url.length - a.url.length);
  return {
    name: 'tameru-static-mounts',
    configResolved(c) {
      outDir = resolve(c.root, c.build.outDir);
      // Vitest resolves a throwaway build config; only real builds get the copies.
      copy = c.command === 'build' && !process.env.VITEST;
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = decodeURIComponent((req.url ?? '/').split('?')[0]!).replace(/^\/+/, '');
        const m = mounts.find((x) => path === x.url || path.startsWith(`${x.url}/`));
        if (!m) return next();
        const rel = normalize(path.slice(m.url.length)).replace(/^([/\\])+/, '');
        const file = join(m.dir, rel);
        if (!file.startsWith(m.dir) || (m.include && !m.include(rel)) || !existsSync(file) || !statSync(file).isFile()) return next();
        res.setHeader('Content-Type', MIME[extname(file).toLowerCase()] ?? 'application/octet-stream');
        createReadStream(file).pipe(res);
      });
    },
    closeBundle() {
      if (!copy) return;
      for (const m of MOUNTS) {
        if (!existsSync(m.dir)) continue;
        const include = m.include;
        cpSync(m.dir, join(outDir, m.url), {
          recursive: true,
          // With an include list, copy only matching files at the top level.
          filter: (src) => !include || src === m.dir || include(src.slice(m.dir.length + 1)),
        });
      }
    },
  };
}

export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __APP_BUILD__: JSON.stringify(APP_BUILD),
  },
  plugins: [
    preact(),
    staticMounts(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        id: './',
        name: 'Tameru',
        short_name: 'Tameru',
        description: 'A calm budget that lives on your phone.',
        categories: ['finance', 'productivity'],
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#ffffff',
        theme_color: '#ffffff',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // Shown in the install sheet's gallery (pwa-install, and Chrome's richer install UI).
        screenshots: [
          { src: 'screenshots/home.png', sizes: '780x1688', type: 'image/png', form_factor: 'narrow', label: 'Safe to spend today' },
          { src: 'screenshots/activity.png', sizes: '780x1688', type: 'image/png', form_factor: 'narrow', label: 'Every transaction, by day' },
          { src: 'screenshots/accounts.png', sizes: '780x1688', type: 'image/png', form_factor: 'narrow', label: 'Cards and accounts at a glance' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,woff2}'],
        // Fetched on demand (art per card; OCR on first scan), never at install. The screenshots
        // and the install sheet are only for the browser-tab install page, never the installed app.
        globIgnores: ['card-art/**', 'ocr/**', 'screenshots/**', 'assets/pwa-install*'],
        navigateFallback: 'index.html',
        // Card art: keep each image once it's been shown; refresh the manifest quietly.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/card-art/') && !url.pathname.endsWith('manifest.json'),
            handler: 'CacheFirst',
            options: { cacheName: 'card-art', expiration: { maxEntries: 120 }, cacheableResponse: { statuses: [200] } },
          },
          {
            // The OCR engine and model: downloaded on the first scan, then kept.
            urlPattern: ({ url }) => url.pathname.includes('/ocr/'),
            handler: 'CacheFirst',
            options: { cacheName: 'ocr', cacheableResponse: { statuses: [200] } },
          },
          {
            urlPattern: ({ url }) => url.pathname.endsWith('/card-art/manifest.json'),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'card-manifest' },
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
  },
});
