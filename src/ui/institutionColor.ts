// Card and institution colours, taken from card art (canvas sampling) and remembered
// per device. Custom institutions, and cards the user coloured, carry their own colour.

import { useEffect, useState } from 'preact/hooks';
import { artImageUrl } from '../data/cardArt';
import { dominantColor, type CatalogCard } from '../domain/cardCatalog';
import type { Account, CustomInstitution } from '../domain/types';

const KEY = 'tameru.institutionColors';
const memory = new Map<string, string>(read());
const pending = new Map<string, Promise<string | undefined>>();

function read(): [string, string][] {
  try {
    return Object.entries(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, string>);
  } catch {
    return [];
  }
}

function remember(id: string, color: string) {
  memory.set(id, color);
  try {
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(memory)));
  } catch {
    /* storage unavailable: memory copy is enough */
  }
}

function sample(url: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = 48;
        c.height = 30;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        if (!ctx) return resolve(undefined);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        resolve(dominantColor(ctx.getImageData(0, 0, c.width, c.height).data));
      } catch {
        resolve(undefined);
      }
    };
    img.onerror = () => resolve(undefined);
    img.src = url;
  });
}

/** Sample a card's art once per device; `key` is what the colour is remembered under. */
function sampled(key: string, card: CatalogCard): Promise<string | undefined> {
  const known = memory.get(key);
  if (known) return Promise.resolve(known);
  let p = pending.get(key);
  if (!p) {
    p = sample(artImageUrl(card)).then((color) => {
      pending.delete(key);
      if (color) remember(key, color);
      return color;
    });
    pending.set(key, p);
  }
  return p;
}

/** Colour for a bundled institution: its first credit card's art (or any of its cards). */
export function institutionColor(id: string, catalog: readonly CatalogCard[]): Promise<string | undefined> {
  const known = memory.get(id);
  if (known) return Promise.resolve(known);
  const card = catalog.find((c) => c.institutionId === id && c.kind === 'credit') ?? catalog.find((c) => c.institutionId === id);
  return card ? sampled(id, card) : Promise.resolve(undefined);
}

export function useInstitutionColor(id: string | undefined, catalog: readonly CatalogCard[]): string | undefined {
  const [color, setColor] = useState(id ? memory.get(id) : undefined);
  useEffect(() => {
    if (!id || id.startsWith('custom/')) return setColor(undefined);
    let live = true;
    institutionColor(id, catalog).then((c) => live && setColor(c));
    return () => {
      live = false;
    };
  }, [id, catalog.length]);
  return color;
}

/**
 * A card's primary colour: the colour the user picked, else its own art's, else its
 * institution's (a custom institution's own colour, or one sampled from the bank's art).
 */
export function cardColor(account: Account, catalog: readonly CatalogCard[], custom: readonly CustomInstitution[]): Promise<string | undefined> {
  const f = account.face;
  if (f?.color) return Promise.resolve(f.color);
  const art = f?.artId ? catalog.find((c) => c.id === f.artId) : undefined;
  if (art) return sampled(`art/${art.id}`, art);
  const instId = f?.institutionId;
  if (!instId) return Promise.resolve(undefined);
  const own = custom.find((i) => i.id === instId);
  return own ? Promise.resolve(own.color) : institutionColor(instId, catalog);
}

/** Primary colours for a set of cards, by account id (missing until sampled, or when unknown). */
export function useCardColors(accounts: readonly Account[], catalog: readonly CatalogCard[], custom: readonly CustomInstitution[]): Record<string, string> {
  const [colors, setColors] = useState<Record<string, string>>({});
  const key = accounts.map((a) => `${a.id}:${a.face?.artId ?? ''}:${a.face?.institutionId ?? ''}:${a.face?.color ?? ''}`).join('|');
  useEffect(() => {
    let live = true;
    Promise.all(accounts.map(async (a) => [a.id, await cardColor(a, catalog, custom)] as const)).then((pairs) => {
      if (!live) return;
      setColors(Object.fromEntries(pairs.filter((p): p is readonly [string, string] => !!p[1])));
    });
    return () => {
      live = false;
    };
  }, [key, catalog.length, custom.length]);
  return colors;
}
