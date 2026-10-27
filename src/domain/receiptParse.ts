// Turn OCR'd receipt text into a draft transaction: vendor, total, card last four,
// card network and date. Pure and forgiving: OCR text is noisy, so every field is
// optional and each is found by several independent clues.

import { addDays, isLocalDate, make } from './dates';
import type { CardNetwork } from './cardCatalog';
import type { LocalDate } from './types';
import type { ReceiptDraft } from './receipt';

// ---------- amounts ----------

// "12.45", "$12.45", "1,234.56", "12,45" (comma decimal), "$ 12.45", "12.45-" (credit)
const AMOUNT = /(?:\$\s?)?(\d{1,6}(?:[ ,]\d{3})*)[.,](\d{2})(?!\d)/g;

/** OCR reads 0 as O and 1 as l or I inside prices: "1O.4S" → "10.45" only where digits surround them. */
function fixDigits(line: string): string {
  return line.replace(/\$?[\dOoIlS]+[.,][\dOoIlS]{2}(?![A-Za-z\d])/g, (w) => (/\d/.test(w) ? w.replace(/[Oo]/g, '0').replace(/[Il]/g, '1').replace(/S(?=\d|$)/g, '5') : w));
}

function amountsIn(raw: string): number[] {
  const line = fixDigits(raw);
  const out: number[] = [];
  for (const m of line.matchAll(AMOUNT)) {
    const whole = m[1]!.replace(/[ ,]/g, '');
    const cents = Number(whole) * 100 + Number(m[2]);
    if (Number.isSafeInteger(cents)) out.push(cents);
  }
  return out;
}

/** Fix common OCR slips inside words that matter: T0TAL → TOTAL, AM0UNT → AMOUNT. */
function normaliseWords(line: string): string {
  return line.replace(/[A-Za-z0-9]+/g, (w) => (/[A-Za-z]/.test(w) && /0/.test(w) && w.replace(/0/g, 'O').match(/^[A-Za-z]+$/) ? w.replace(/0/g, 'O') : w));
}

const TOTAL_KEYS: [RegExp, number][] = [
  [/\b(grand\s*total|total\s*(due|to\s*pay|payable|amount|cad)|amount\s*(due|paid|charged)|balance\s*due|montant\s*(total|d[ûu]))\b/i, 3],
  [/\btotal\b/i, 2],
  [/\b(amount|montant|purchase|sale|achat)\b/i, 1],
];
const NOT_TOTAL = /\b(sub\s*-?\s*total|total\s*(savings|saved|discount|tax|items?|qty|quantity|points)|you\s*saved|savings|tax|gst|hst|pst|qst|tip|change|cash\s*back|rounding)\b/i;
const PAYMENT_LINE = /\b(visa|master\s*card|mc|amex|american\s*express|debit|interac|credit|card|approved|tender)\b/i;

const SUBTOTAL = /\bsub\s*-?\s*total\b/i;
const TAX = /\b(tax|gst|hst|pst|qst|tps|tvq|vat)\b/i;

/** Subtotal plus the tax lines, when both are printed: a check on (or stand-in for) the total. */
function subtotalPlusTax(lines: readonly string[]): number | undefined {
  let sub: number | undefined;
  let tax = 0;
  for (const raw of lines) {
    const line = normaliseWords(raw);
    const a = amountsIn(line);
    if (!a.length) continue;
    if (SUBTOTAL.test(line)) sub = a[a.length - 1];
    else if (TAX.test(line) && !/\b(total|incl|included)\b/i.test(line)) tax += a[a.length - 1]!;
  }
  return sub !== undefined && tax > 0 ? sub + tax : undefined;
}

export function findTotal(lines: readonly string[]): number | undefined {
  const labelled = findLabelledTotal(lines);
  const sum = subtotalPlusTax(lines);
  if (labelled === undefined || sum === undefined || labelled === sum) return labelled ?? sum;
  // The total was misread (8.15 for 8.75) but the sum is printed elsewhere, e.g. on the card line.
  return lines.some((l) => amountsIn(l).includes(sum)) ? sum : labelled;
}

function findLabelledTotal(lines: readonly string[]): number | undefined {
  let best: { cents: number; score: number; at: number } | undefined;
  lines.forEach((raw, i) => {
    const line = normaliseWords(raw);
    if (NOT_TOTAL.test(line)) return;
    const score = TOTAL_KEYS.find(([re]) => re.test(line))?.[1];
    if (!score) return;
    // The amount is usually on the same line; sometimes it's pushed to the next one.
    const here = amountsIn(line);
    const cents = here.length ? here[here.length - 1] : amountsIn(lines[i + 1] ?? '')[0];
    if (cents === undefined || cents <= 0) return;
    if (!best || score > best.score || (score === best.score && i > best.at)) best = { cents, score, at: i };
  });
  if (best) return best.cents;
  // No labelled total: the amount on the payment line, else the largest amount.
  for (let i = lines.length - 1; i >= 0; i--) {
    if (PAYMENT_LINE.test(lines[i]!) && !NOT_TOTAL.test(lines[i]!)) {
      const a = amountsIn(lines[i]!);
      if (a.length) return a[a.length - 1];
    }
  }
  const all = lines.flatMap((l) => (NOT_TOTAL.test(l) ? [] : amountsIn(l)));
  return all.length ? Math.max(...all) : undefined;
}

// ---------- card ----------

const MASKED = /(?:[*xX•#·.]{2,}[\s-]*)+(\d{4})(?!\d)/;
const ENDING = /\b(?:ending|ends|last\s*4|last\s*four)\s*(?:in|with|digits)?\s*[:#]?\s*[*xX•]*(\d{4})(?!\d)/i;
// OCR often reads a row of asterisks as letters ("sorpkorkkokk4821", "sctorkokok 4821",
// even "...xk4 821"). On a payment line, a run of non-digit junk followed by four digits
// (a stray space allowed) is a masked number.
const GARBLED = /[^\s\d]{6,}\s?(\d(?:\s?\d){3})(?!\s?\d)/;
const CARD_LINE = /\b(visa|master\s*card|mc|amex|american\s*express|debit|interac|credit|card|acct|account|d?pan)\b/i;

export function findLast4(lines: readonly string[]): string | undefined {
  // The payment block is at the bottom: prefer the last match.
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!;
    const m = MASKED.exec(line) ?? ENDING.exec(line) ?? (CARD_LINE.test(line) ? GARBLED.exec(line) : null);
    if (m) return m[1]!.replace(/\s/g, '');
  }
  return undefined;
}

/** Paid by phone or watch: the last four printed is the device account number, not the card's. */
export function findWallet(lines: readonly string[]): ReceiptDraft['wallet'] {
  const text = lines.join(' ').toLowerCase();
  if (/apple\s*pay|\bapple\b.*\bwallet\b/.test(text)) return 'apple_pay';
  if (/google\s*pay|\bg\s*pay\b|android\s*pay|samsung\s*pay/.test(text)) return 'google_pay';
  if (/\bd\s*pan\b|device\s*(acc(oun)?t|number)/.test(text)) return 'device';
  return undefined;
}

export function findNetwork(lines: readonly string[]): CardNetwork | undefined {
  const text = lines.join(' ').toLowerCase();
  if (/\bamex\b|american\s*express/.test(text)) return 'amex';
  if (/master\s*card|\bmc\b/.test(text)) return 'mastercard';
  if (/\bvisa\b/.test(text)) return 'visa';
  if (/\binterac\b|\bdebit\b/.test(text)) return 'interac';
  if (/\bdiscover\b/.test(text)) return 'discover';
  return undefined;
}

// ---------- date ----------

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** The receipt's date, if one is printed and it's plausible (within the last year, not in the future). */
export function findDate(lines: readonly string[], today: LocalDate): LocalDate | undefined {
  const plausible = (d: string) => isLocalDate(d) && d <= addDays(today, 1) && d >= addDays(today, -366);
  const year = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y));
  for (const line of lines) {
    let m = /\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/.exec(line);
    if (m) {
      const d = make(Number(m[1]), Number(m[2]), Number(m[3]));
      if (plausible(d)) return d;
    }
    m = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})\b/.exec(line);
    if (m) {
      const a = Number(m[1]);
      const b = Number(m[2]);
      const y = year(m[3]!);
      // North American receipts are usually MM/DD; take DD/MM only when MM/DD is impossible.
      for (const [mo, da] of [
        [a, b],
        [b, a],
      ] as const) {
        const d = make(y, mo, da);
        if (mo <= 12 && plausible(d)) return d;
      }
    }
    m = /\b([A-Za-z]{3})[a-z]*\.?[\s-]+(\d{1,2}),?[\s-]+(20\d{2}|\d{2})\b/.exec(line);
    if (m) {
      const mo = MONTHS.indexOf(m[1]!.toLowerCase()) + 1;
      if (mo > 0) {
        const d = make(year(m[3]!), mo, Number(m[2]));
        if (plausible(d)) return d;
      }
    }
    m = /\b(\d{1,2})[\s-]+([A-Za-z]{3})[a-z]*\.?[\s-]+(20\d{2}|\d{2})\b/.exec(line);
    if (m) {
      const mo = MONTHS.indexOf(m[2]!.toLowerCase()) + 1;
      if (mo > 0) {
        const d = make(year(m[3]!), mo, Number(m[1]));
        if (plausible(d)) return d;
      }
    }
  }
  return undefined;
}

// ---------- vendor ----------

const SKIP_LINE =
  /\b(welcome|bienvenue|receipt|re[çc]u|invoice|order|store\s*#?\d*|st\s*#|tel|phone|www\.|\.com|\.ca|gst|hst|reg|cashier|server|table|guest|transaction|trans|terminal|merchant\s*id|date|time)\b/i;
const ADDRESS = /^\d+[a-z]?\s+[\w .'-]+\b(st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|way|lane|ln|cres|crt|pkwy|hwy|unit|suite)\b/i;
const PHONE = /\(?\d{3}\)?[\s.-]?\d{3}[\s.-]\d{4}/;
const POSTAL = /\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b|\b\d{5}(-\d{4})?\b/;

const SMALL_WORDS = new Set(['of', 'and', 'the', 'de', 'du', 'la', 'le']);
const titleCase = (s: string) =>
  s
    .toLowerCase()
    .split(' ')
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');

/** Noise read off the paper's edge: "Ce eee", "Soo es". No word of three letters has three different ones. */
const isSpeckle = (line: string) => !(line.match(/[A-Za-zÀ-ÿ]{3,}/g) ?? []).some((w) => new Set(w.toLowerCase()).size >= 3);

/** The business name: the first real name line near the top. */
export function findVendor(lines: readonly string[]): string | undefined {
  for (const raw of lines.slice(0, 8)) {
    const line = raw.replace(/[|_~=*]+/g, ' ').replace(/\s+/g, ' ').trim();
    const letters = (line.match(/[A-Za-zÀ-ÿ]/g) ?? []).length;
    if (letters < 3 || letters / Math.max(1, line.replace(/\s/g, '').length) < 0.6) continue;
    if (SKIP_LINE.test(line) || ADDRESS.test(line) || PHONE.test(line) || POSTAL.test(line) || amountsIn(line).length || isSpeckle(line)) continue;
    const name = line
      .replace(/\s*(#\s*\d+|\b(store|no\.?|unit|loc)\s*#?\s*\d+)\s*$/i, '') // trailing store numbers
      .replace(/^[^A-Za-zÀ-ÿ0-9]+|[^A-Za-zÀ-ÿ0-9'&!.)]+$/g, '')
      .slice(0, 40);
    // ALL CAPS shop names read better in title case; short acronyms (LCBO, IKEA) stay as they are.
    const allCaps = name === name.toUpperCase();
    return allCaps && name.length > 5 ? titleCase(name) : name;
  }
  return undefined;
}

// ---------- all together ----------

export function parseReceipt(text: string, today: LocalDate): ReceiptDraft {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const merchant = findVendor(lines);
  const amountCents = findTotal(lines);
  const last4 = findLast4(lines);
  const network = findNetwork(lines);
  const date = findDate(lines, today);
  const wallet = findWallet(lines);
  const found = [merchant, amountCents, last4, date].filter((x) => x !== undefined).length;
  return {
    ...(merchant ? { merchant } : {}),
    ...(amountCents !== undefined ? { amountCents } : {}),
    ...(last4 ? { last4 } : {}),
    ...(network ? { network } : {}),
    ...(wallet ? { wallet } : {}),
    ...(date ? { date } : {}),
    confidence: found / 4,
  };
}

/** The better read leads; the other fills in whatever it missed. */
export function mergeDrafts(a: ReceiptDraft, b: ReceiptDraft): ReceiptDraft {
  const [lead, rest] = (b.confidence ?? 0) > (a.confidence ?? 0) || (a.amountCents === undefined && b.amountCents !== undefined) ? [b, a] : [a, b];
  const merged: ReceiptDraft = { ...rest, ...Object.fromEntries(Object.entries(lead).filter(([, v]) => v !== undefined)) };
  merged.confidence = [merged.merchant, merged.amountCents, merged.last4, merged.date].filter((x) => x !== undefined).length / 4;
  return merged;
}
