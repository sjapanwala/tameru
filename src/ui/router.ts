// Minimal hash router: '#/path?x=1'. No dependency, works on any static host.

import { useEffect, useState } from 'preact/hooks';

export interface Route {
  path: string;
  params: URLSearchParams;
}

function read(): Route {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [path, query] = raw.split('?');
  return { path: path || '/', params: new URLSearchParams(query ?? '') };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => setRoute(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export function go(path: string): void {
  window.location.hash = path;
}
