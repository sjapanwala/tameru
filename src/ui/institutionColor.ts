// An institution's primary colour, taken from its own card art (canvas sampling)
// and remembered per device. Custom institutions carry their own colour.

import { useEffect, useState } from 'preact/hooks';
import { artImageUrl } from '../data/cardArt';
import { dominantColor, type CatalogCard } from '../domain/cardCatalog';

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

/** Colour for a bundled institution: its first credit card's art (or any of its cards). */
export function institutionColor(id: string, catalog: readonly CatalogCard[]): Promise<string | undefined> {
  const known = memory.get(id);
  if (known) return Promise.resolve(known);
  const card = catalog.find((c) => c.institutionId === id && c.kind === 'credit') ?? catalog.find((c) => c.institutionId === id);
  if (!card) return Promise.resolve(undefined);
  let p = pending.get(id);
  if (!p) {
    p = sample(artImageUrl(card)).then((color) => {
      pending.delete(id);
      if (color) remember(id, color);
      return color;
    });
    pending.set(id, p);
  }
  return p;
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
