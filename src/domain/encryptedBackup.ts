// Passphrase-encrypted backup envelope: PBKDF2-SHA-256 -> AES-256-GCM, all
// through Web Crypto. The envelope is JSON so it survives share sheets and
// email; only `data` is secret. Losing the passphrase loses the backup.

export const ENCRYPTED_KIND = 'tameru-encrypted-backup';
export const PBKDF2_ITERATIONS = 600_000;
export const MIN_PASSPHRASE_LENGTH = 8;

export interface EncryptedEnvelope {
  kind: typeof ENCRYPTED_KIND;
  v: 1;
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string };
  cipher: { name: 'AES-GCM'; iv: string };
  data: string;
}

export class WrongPassphraseError extends Error {
  constructor() {
    super('Wrong passphrase, or the file is damaged.');
    this.name = 'WrongPassphraseError';
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveKey(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase.normalize('NFKC')),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Encrypt `plaintext` (the backup JSON) under a passphrase. Fresh salt and IV each time. */
export async function encryptBackup(
  plaintext: string,
  passphrase: string,
  iterations = PBKDF2_ITERATIONS,
): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, iterations);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  const envelope: EncryptedEnvelope = {
    kind: ENCRYPTED_KIND,
    v: 1,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: toBase64(salt) },
    cipher: { name: 'AES-GCM', iv: toBase64(iv) },
    data: toBase64(new Uint8Array(encrypted)),
  };
  return JSON.stringify(envelope);
}

export function isEncryptedBackup(json: unknown): json is EncryptedEnvelope {
  if (typeof json !== 'object' || json === null) return false;
  const e = json as Partial<EncryptedEnvelope>;
  return (
    e.kind === ENCRYPTED_KIND &&
    e.v === 1 &&
    e.kdf?.name === 'PBKDF2' &&
    typeof e.kdf.salt === 'string' &&
    Number.isInteger(e.kdf.iterations) &&
    e.kdf.iterations > 0 &&
    e.kdf.iterations <= 10_000_000 &&
    e.cipher?.name === 'AES-GCM' &&
    typeof e.cipher.iv === 'string' &&
    typeof e.data === 'string'
  );
}

/** Decrypt an envelope. Throws WrongPassphraseError if authentication fails. */
export async function decryptBackup(
  envelope: EncryptedEnvelope,
  passphrase: string,
): Promise<string> {
  try {
    const key = await deriveKey(passphrase, fromBase64(envelope.kdf.salt), envelope.kdf.iterations);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(envelope.cipher.iv) },
      key,
      fromBase64(envelope.data),
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    throw new WrongPassphraseError();
  }
}
