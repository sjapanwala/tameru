// Loads the bundled card-art manifest (cards/card-art, served at card-art/).
// Same origin as the app: no third-party requests. The service worker keeps the
// manifest and every image once seen, so cards still render offline.

import { applyCovers, parseManifest, type CatalogCard } from '../domain/cardCatalog';

export const CARD_ART_BASE = `${import.meta.env.BASE_URL}card-art/`;

let memo: Promise<CatalogCard[]> | null = null;

/** The catalog, or [] if it can't be loaded (cards then fall back to drawn faces). */
export function loadCatalog(): Promise<CatalogCard[]> {
  const get = (name: string) => fetch(`${CARD_ART_BASE}${name}`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))));
  memo ??= Promise.all([get('manifest.json'), get('clean/index.json').catch(() => null)])
    .then(([manifest, covers]) => applyCovers(parseManifest(manifest), covers))
    .catch(() => {
      memo = null; // try again next time
      return [];
    });
  return memo;
}

const url = (file: string) => `${CARD_ART_BASE}${file.split('/').map(encodeURIComponent).join('/')}`;

export const artImageUrl = (card: Pick<CatalogCard, 'file'>): string => url(card.file);

/** The cleaned copy of the art (printed name/number removed), when one exists. */
export const cleanImageUrl = (card: Pick<CatalogCard, 'cover'>): string | null => (card.cover?.method === 'clean' ? url(card.cover.file) : null);
