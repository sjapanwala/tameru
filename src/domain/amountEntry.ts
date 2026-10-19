// Keypad amount entry as a pure string state machine: "", "12", "12.", "12.5", "12.50".

export type KeypadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '.' | 'back';

export const MAX_WHOLE_DIGITS = 7; // up to $9,999,999

export function pressKey(entry: string, key: KeypadKey): string {
  if (key === 'back') return entry.slice(0, -1);
  const [whole, frac] = entry.split('.');
  if (key === '.') {
    if (entry.includes('.')) return entry;
    return entry === '' ? '0.' : `${entry}.`;
  }
  if (frac !== undefined) return frac.length >= 2 ? entry : entry + key;
  if (whole === '0') return key; // no leading zeros
  if ((whole ?? '').length >= MAX_WHOLE_DIGITS) return entry;
  return entry + key;
}

/** Integer cents for an entry ("" → 0). */
export function entryToCents(entry: string): number {
  const [whole = '', frac = ''] = entry.split('.');
  return Number(whole || '0') * 100 + Number(frac.padEnd(2, '0') || '0');
}

/** Display parts: "$1,234" + ".5" as typed (cents only once the user types a dot). */
export function entryDisplay(entry: string): { whole: string; frac: string | null } {
  const [whole = '', frac] = entry.split('.');
  const grouped = (whole || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return { whole: grouped, frac: frac === undefined ? null : `.${frac}` };
}

export function keyFromKeyboard(k: string): KeypadKey | null {
  if (/^[0-9]$/.test(k)) return k as KeypadKey;
  if (k === '.' || k === ',') return '.';
  if (k === 'Backspace') return 'back';
  return null;
}
