// Release notes: which ones a user hasn't seen yet, given the version they last ran.

export interface Release {
  version: string; // "0.6.0"
  items: { title: string; body: string }[];
}

/** Compare "0.6.0"-style versions numerically; missing parts count as 0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** Releases after `seen` up to and including `current`, newest first, at most `limit`. */
export function unseenReleases(releases: readonly Release[], seen: string, current: string, limit = 3): Release[] {
  return releases
    .filter((r) => compareVersions(r.version, seen) > 0 && compareVersions(r.version, current) <= 0)
    .sort((a, b) => compareVersions(b.version, a.version))
    .slice(0, limit);
}
