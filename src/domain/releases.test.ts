import { describe, expect, it } from 'vitest';
import { compareVersions, unseenReleases, type Release } from './releases';

const r = (version: string): Release => ({ version, items: [{ title: version, body: '' }] });
const ALL = [r('0.5.7'), r('0.5.8'), r('0.6.0'), r('0.10.0')];

describe('release notes', () => {
  it('compares versions numerically', () => {
    expect(compareVersions('0.10.0', '0.9.9')).toBeGreaterThan(0);
    expect(compareVersions('0.6', '0.6.0')).toBe(0);
    expect(compareVersions('0.5.8', '0.6.0')).toBeLessThan(0);
  });
  it('picks what came out since the version last run, newest first', () => {
    expect(unseenReleases(ALL, '0.5.7', '0.6.0').map((x) => x.version)).toEqual(['0.6.0', '0.5.8']);
    expect(unseenReleases(ALL, '0.6.0', '0.6.0')).toEqual([]); // same version, new build: nothing to show
    expect(unseenReleases(ALL, '0.1.0', '0.10.0', 2).map((x) => x.version)).toEqual(['0.10.0', '0.6.0']);
  });
});
