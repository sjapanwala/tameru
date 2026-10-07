import { DEFAULT_CURRENCY } from './defaults';

const digitsCache = new Map<string, number>();

/** Number of minor-unit digits for a currency (2 for CAD, 0 for JPY). */
export function minorUnitDigits(currency: string = DEFAULT_CURRENCY): number {
  let digits = digitsCache.get(currency);
  if (digits === undefined) {
    try {
      digits =
        new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
          .maximumFractionDigits ?? 2;
    } catch {
      digits = 2;
    }
    digitsCache.set(currency, digits);
  }
  return digits;
}

export interface FormatMoneyOptions {
  locale?: string;
  /** Always show a sign for non-zero amounts (+ for income, − for spend). */
  signed?: boolean;
}

/** Format integer minor units as a currency string. */
export function formatMoney(
  cents: number,
  currency: string = DEFAULT_CURRENCY,
  { locale, signed = false }: FormatMoneyOptions = {},
): string {
  const digits = minorUnitDigits(currency);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    signDisplay: signed ? 'exceptZero' : 'auto',
  }).format(cents / 10 ** digits);
}

/** The currency symbol as the locale would print it ("$", "US$", "€"). */
export function currencySymbol(currency: string = DEFAULT_CURRENCY, locale?: string): string {
  const parts = new Intl.NumberFormat(locale, { style: 'currency', currency }).formatToParts(0);
  return parts.find((p) => p.type === 'currency')?.value ?? currency;
}

/**
 * Parse user-typed money ("1,234.50", "$12", "12,5") into integer minor units
 * without going through floats. Returns null when it isn't a number.
 */
export function parseMoneyInput(text: string, currency: string = DEFAULT_CURRENCY): number | null {
  const digits = minorUnitDigits(currency);
  let s = text.replace(/[^\d.,-]/g, '');
  const negative = s.startsWith('-');
  s = s.replace(/-/g, '');
  // A lone comma followed by 1–2 digits at the end is a decimal comma.
  if (!s.includes('.') && /^\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.');
  s = s.replace(/,/g, '');
  if (!/^\d*\.?\d*$/.test(s) || !/\d/.test(s)) return null;

  const [whole = '', frac = ''] = s.split('.');
  const fracPadded = (frac + '0'.repeat(digits)).slice(0, digits);
  const cents = Number(whole || '0') * 10 ** digits + Number(fracPadded || '0');
  if (!Number.isSafeInteger(cents)) return null;
  return negative && cents !== 0 ? -cents : cents;
}

/** Plain decimal string for pre-filling an amount input ("12.50"; "" for zero). */
export function centsToInput(cents: number, currency: string = DEFAULT_CURRENCY): string {
  if (cents === 0) return '';
  const digits = minorUnitDigits(currency);
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 10 ** digits);
  const text =
    digits === 0 ? String(whole) : `${whole}.${String(abs % 10 ** digits).padStart(digits, '0')}`;
  return cents < 0 ? `-${text}` : text;
}
