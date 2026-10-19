import { describe, expect, it } from 'vitest';
import { bestMatch, merchantKey, similarity } from './merchant';

describe('merchantKey', () => {
  it('normalises descriptors', () => {
    expect(merchantKey("SQ *JOE'S COFFEE #4412")).toBe('joes coffee');
    expect(merchantKey('TST* Pizza Pizza 0231')).toBe('pizza pizza');
    expect(merchantKey('Starbucks Store 1234')).toBe('starbucks');
    expect(merchantKey('NETFLIX.COM')).toBe('netflix com');
    expect(merchantKey('Café Olé!')).toBe('cafe ole');
    expect(merchantKey('7-Eleven')).toBe('7 eleven');
  });
});

describe('similarity', () => {
  it('scores near-duplicates high and unrelated low', () => {
    expect(similarity('starbucks', 'starbucks queen st')).toBeGreaterThanOrEqual(0.8);
    expect(similarity('loblaws', 'loblaw')).toBeGreaterThanOrEqual(0.8);
    expect(similarity('netflix', 'shell')).toBeLessThan(0.5);
    expect(bestMatch('tim hortons', [{ k: 'tim hortons dt' }, { k: 'esso' }], (x) => x.k)?.item.k).toBe('tim hortons dt');
    expect(bestMatch('zzz', [{ k: 'esso' }], (x) => x.k)).toBeNull();
  });
});
