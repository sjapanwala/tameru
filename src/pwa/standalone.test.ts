import { describe, expect, it } from 'vitest';
import { detectPlatform, shouldRunApp } from './standalone';

describe('install gate', () => {
  const base = { requireInstall: true, standalone: false, search: '', envAllowBrowser: false, sessionBypass: false };
  it('runs anywhere while the gate is switched off', () => {
    expect(shouldRunApp({ ...base, requireInstall: false })).toBe(true);
  });
  it('runs only when standalone unless bypassed', () => {
    expect(shouldRunApp(base)).toBe(false);
    expect(shouldRunApp({ ...base, standalone: true })).toBe(true);
    expect(shouldRunApp({ ...base, search: '?dev=1' })).toBe(true);
    expect(shouldRunApp({ ...base, search: '?dev=0' })).toBe(false);
    expect(shouldRunApp({ ...base, envAllowBrowser: true })).toBe(true);
    expect(shouldRunApp({ ...base, sessionBypass: true })).toBe(true);
  });
  it('detects platforms', () => {
    expect(detectPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe('ios');
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe('ios');
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe('other');
    expect(detectPlatform('Mozilla/5.0 (Linux; Android 15; Pixel 9)')).toBe('android');
  });
});
