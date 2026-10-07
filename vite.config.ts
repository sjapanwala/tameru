import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

// Developer escape hatch (see CLAUDE.md). Off unless explicitly set, and
// compiled to a constant so the bypass is dead code in normal builds.
const allowBrowser = process.env.VITE_ALLOW_BROWSER === 'true';
if (allowBrowser) {
  console.warn(
    '\n  VITE_ALLOW_BROWSER=true: the install gate is DISABLED. Do not deploy this build.\n',
  );
}

// Absolute address of the deployed app, for link previews (optional).
const siteUrl = (process.env.VITE_SITE_URL ?? '').replace(/\/?$/, '/');
const absolute = (path: string) => (process.env.VITE_SITE_URL ? siteUrl + path : path);

export default defineConfig({
  // Relative base + hash routing: deployable to any static host or sub-path.
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __ALLOW_BROWSER__: JSON.stringify(allowBrowser),
  },
  plugins: [
    react(),
    {
      // Link previews need absolute URLs; fill them in when the site URL is known.
      name: 'tameru-og',
      transformIndexHtml: (html) =>
        html
          .replace('%OG_IMAGE%', absolute('icons/icon-512.png'))
          .replace('%OG_URL%', process.env.VITE_SITE_URL ? siteUrl : './'),
    },
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'Tameru',
        short_name: 'Tameru',
        description: 'What can I safely spend today? Private, on-device budgeting.',
        lang: 'en',
        display: 'standalone',
        orientation: 'portrait',
        id: './',
        start_url: './',
        scope: './',
        theme_color: '#F5F4EF',
        background_color: '#F5F4EF',
        categories: ['finance', 'productivity'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: 'icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,webmanifest}'],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
