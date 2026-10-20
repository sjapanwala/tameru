import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { hashPasscode, isValidPasscode, newSalt, sameHash, sha256, toHex } from './passcode';

describe('passcode', () => {
  it('computes SHA-256 like the standard (including multi-block inputs)', () => {
    expect(toHex(sha256(new TextEncoder().encode('abc')))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(toHex(sha256(new Uint8Array()))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    for (const len of [55, 56, 63, 64, 65, 200]) {
      const bytes = new Uint8Array(len).map((_, i) => (i * 7) & 255);
      expect(toHex(sha256(bytes))).toBe(createHash('sha256').update(bytes).digest('hex'));
    }
  });

  it('hashes with a salt so the same code gives different hashes, and verifies', () => {
    const s1 = newSalt();
    const s2 = newSalt();
    expect(s1).toMatch(/^[0-9a-f]{32}$/);
    const h1 = hashPasscode('123456', s1, 50);
    expect(hashPasscode('123456', s1, 50)).toBe(h1);
    expect(hashPasscode('123456', s2, 50)).not.toBe(h1);
    expect(sameHash(hashPasscode('123456', s1, 50), h1)).toBe(true);
    expect(sameHash(hashPasscode('123457', s1, 50), h1)).toBe(false);
  });

  it('accepts only the chosen number of digits', () => {
    expect(isValidPasscode('1234', 4)).toBe(true);
    expect(isValidPasscode('12345', 4)).toBe(false);
    expect(isValidPasscode('12a456', 6)).toBe(false);
  });
});
