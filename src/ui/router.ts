import { useSyncExternalStore } from 'react';

// Minimal hash router: "#/activity" -> "/activity". Hash routing means any
// static host works without rewrite rules.

function currentPath(): string {
  const path = window.location.hash.replace(/^#/, '');
  return path.startsWith('/') ? path : '/';
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

export function useRoute(): string {
  return useSyncExternalStore(subscribe, currentPath);
}

export function navigate(path: string): void {
  window.location.hash = path;
}
