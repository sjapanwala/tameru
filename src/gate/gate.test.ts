import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// In a browser tab only the install gate may run, and it must not be able to
// reach the database. Rather than trust a runtime check, this walks the
// static import graph from the entry point: anything reachable without a
// dynamic import() is what a gated tab actually loads.

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STATIC_IMPORT = /^\s*import\s+(?!type\b)(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/gm;

function resolveLocal(from: string, specifier: string): string | null {
  const base = resolve(dirname(from), specifier);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, resolve(base, 'index.ts')]) {
    if (existsSync(candidate) && /\.(ts|tsx|css)$/.test(candidate)) return candidate;
  }
  return null;
}

function staticGraph(entry: string): { files: Set<string>; packages: Set<string> } {
  const files = new Set<string>();
  const packages = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (files.has(file)) continue;
    files.add(file);
    if (file.endsWith('.css')) continue;
    for (const [, specifier] of readFileSync(file, 'utf8').matchAll(STATIC_IMPORT)) {
      if (!specifier) continue;
      if (specifier.startsWith('.')) {
        const target = resolveLocal(file, specifier);
        if (target) queue.push(target);
      } else {
        packages.add(specifier);
      }
    }
  }
  return { files, packages };
}

describe('install gate isolation', () => {
  const { files, packages } = staticGraph(resolve(SRC, 'main.tsx'));
  const loaded = [...files].map((file) => relative(SRC, file));

  it('loads the gate from the entry point', () => {
    expect(loaded).toContain('Root.tsx');
    expect(loaded).toContain('gate/InstallGate.tsx');
  });

  it('never statically loads the database, the app shell or any screen', () => {
    const forbidden = loaded.filter(
      (file) => file.startsWith('db/') || file.startsWith('pages/') || file === 'App.tsx',
    );
    expect(forbidden).toEqual([]);
    expect([...packages].filter((name) => name.startsWith('dexie'))).toEqual([]);
  });

  it('reaches the app only through a dynamic import', () => {
    const root = readFileSync(resolve(SRC, 'Root.tsx'), 'utf8');
    expect(root).toMatch(/import\(\s*['"]\.\/App['"]\s*\)/);
    expect(root).not.toMatch(/^\s*import\s[^;]*from\s+['"]\.\/App['"]/m);
  });

  it('keeps IndexedDB out of everything the gate loads', () => {
    const offenders = [...files].filter(
      (file) => !file.endsWith('.css') && /indexedDB|IDBFactory/.test(readFileSync(file, 'utf8')),
    );
    expect(offenders.map((file) => relative(SRC, file))).toEqual([]);
  });
});
