// State machine behind the Quick Add number pad. The entry is the literal
// string the user has typed ("", "12", "12.", "12.5"), so the display can
// mirror keystrokes exactly.

export type PadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '.' | 'back';

export const PAD_KEYS: PadKey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'];

const MAX_WHOLE_DIGITS = 7;

export function pressKey(entry: string, key: PadKey, decimals = 2): string {
  if (key === 'back') return entry.slice(0, -1);

  const [whole = '', frac] = entry.split('.');
  if (key === '.') {
    if (decimals === 0 || frac !== undefined) return entry;
    return entry === '' ? '0.' : `${entry}.`;
  }
  if (frac !== undefined) {
    return frac.length >= decimals ? entry : entry + key;
  }
  if (whole === '0') return key;
  if (whole.length >= MAX_WHOLE_DIGITS) return entry;
  return entry + key;
}

export function entryToCents(entry: string, decimals = 2): number {
  const [whole = '', frac = ''] = entry.split('.');
  const fracPadded = (frac + '0'.repeat(decimals)).slice(0, decimals);
  return Number(whole || '0') * 10 ** decimals + Number(fracPadded || '0');
}

/** Inverse of entryToCents, trimmed the way a person would type it. */
export function centsToEntry(cents: number, decimals = 2): string {
  const abs = Math.abs(cents);
  const unit = 10 ** decimals;
  const whole = Math.floor(abs / unit);
  const frac = abs % unit;
  if (decimals === 0 || frac === 0) return whole === 0 ? '' : String(whole);
  return `${whole}.${String(frac).padStart(decimals, '0')}`;
}
