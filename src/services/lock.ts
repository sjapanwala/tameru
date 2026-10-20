// App lock: an optional passcode, plus Face ID / Touch ID through a device passkey
// (WebAuthn) where the browser allows it. Everything stays on the device: the passkey
// is only asked to confirm it's you, there's no server, and the passcode is kept as a
// salted hash. It's a screen lock, not encryption.

import { hashPasscode, isValidPasscode, newSalt, sameHash } from '../domain/passcode';
import type { AppLock } from '../domain/types';
import type { AppContext } from './context';

export const RELOCK_OPTIONS_MS = [0, 60_000, 5 * 60_000, 15 * 60_000] as const;
export const DEFAULT_RELOCK_MS = 60_000;

export async function getLock(ctx: AppContext): Promise<AppLock | undefined> {
  return (await ctx.repos.settings.get()).lock;
}

export async function setPasscode(ctx: AppContext, code: string, digits: 4 | 6): Promise<void> {
  if (!isValidPasscode(code, digits)) throw new Error('passcode must be digits only');
  const cur = await getLock(ctx);
  const salt = newSalt();
  await ctx.repos.settings.update({ lock: { relockAfterMs: DEFAULT_RELOCK_MS, ...cur, digits, salt, hash: hashPasscode(code, salt) } });
}

export async function checkPasscode(ctx: AppContext, code: string): Promise<boolean> {
  const lock = await getLock(ctx);
  return !!lock && sameHash(hashPasscode(code, lock.salt), lock.hash);
}

export async function removeLock(ctx: AppContext): Promise<void> {
  await ctx.repos.settings.update({ lock: undefined });
}

export async function updateLock(ctx: AppContext, patch: Partial<Pick<AppLock, 'relockAfterMs' | 'passkeyId'>>): Promise<void> {
  const cur = await getLock(ctx);
  if (cur) await ctx.repos.settings.update({ lock: { ...cur, ...patch } });
}

// ---------- Face ID / Touch ID (WebAuthn platform passkey) ----------

const b64url = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));

/** Whether this device and page can use Face ID / Touch ID (needs https and a built-in authenticator). */
export async function passkeyAvailable(): Promise<boolean> {
  try {
    return window.isSecureContext && 'PublicKeyCredential' in window && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch {
    return false;
  }
}

/** Create a device passkey for unlocking and remember its id. */
export async function enablePasskey(ctx: AppContext, displayName: string): Promise<void> {
  const cred = (await navigator.credentials.create({
    publicKey: {
      rp: { name: 'Tameru' },
      user: { id: random(16), name: 'tameru-unlock', displayName: displayName || 'Tameru' },
      challenge: random(32),
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error('no passkey created');
  await updateLock(ctx, { passkeyId: b64url(cred.rawId) });
}

/** Ask for Face ID / Touch ID. True only if the device confirmed it's the owner. */
export async function passkeyUnlock(lock: AppLock): Promise<boolean> {
  if (!lock.passkeyId) return false;
  try {
    const got = await navigator.credentials.get({
      publicKey: {
        challenge: random(32),
        allowCredentials: [{ type: 'public-key', id: fromB64url(lock.passkeyId) }],
        userVerification: 'required',
        timeout: 60_000,
      },
    });
    return !!got;
  } catch {
    return false; // cancelled, or the passkey isn't on this device any more
  }
}
