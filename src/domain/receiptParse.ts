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

function amountsIn(line: string): number[] {
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

export function findTotal(lines: readonly string[]): number | undefined {
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

const MASKED = /(?:[*xX•#]{2,}[\s-]*)+(\d{4})(?!\d)/;
const ENDING = /\b(?:ending|ends|last\s*4|last\s*four)\s*(?:in|with|digits)?\s*[:#]?\s*[*xX•]*(\d{4})(?!\d)/i;
// OCR often reads a row of asterisks as letters ("sorpkorkkokk4821"). On a payment
// line, a run of non-digit junk glued straight onto four digits is a masked number.
const GARBLED = /[^\s\d]{6,}(\d{4})(?!\d)/;
const CARD_LINE = /\b(visa|master\s*card|mc|amex|american\s*express|debit|interac|credit|card|acct|account)\b/i;

export function findLast4(lines: readonly string[]): string | undefined {
  // The payment block is at the bottom: prefer the last match.
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!;
    const m = MASKED.exec(line) ?? ENDING.exec(line) ?? (CARD_LINE.test(line) ? GARBLED.exec(line) : null);
    if (m) return m[1];
  }
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
    m = /\b([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(20\d{2})\b/.exec(line) ?? null;
    if (m) {
      const mo = MONTHS.indexOf(m[1]!.toLowerCase()) + 1;
      if (mo > 0) {
        const d = make(Number(m[3]), mo, Number(m[2]));
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

/** The business name: the first real name line near the top. */
export function findVendor(lines: readonly string[]): string | undefined {
  for (const raw of lines.slice(0, 8)) {
    const line = raw.replace(/[|_~=*]+/g, ' ').replace(/\s+/g, ' ').trim();
    const letters = (line.match(/[A-Za-zÀ-ÿ]/g) ?? []).length;
    if (letters < 3 || letters / Math.max(1, line.replace(/\s/g, '').length) < 0.6) continue;
    if (SKIP_LINE.test(line) || ADDRESS.test(line) || PHONE.test(line) || POSTAL.test(line) || amountsIn(line).length) continue;
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
  const found = [merchant, amountCents, last4, date].filter((x) => x !== undefined).length;
  return {
    ...(merchant ? { merchant } : {}),
    ...(amountCents !== undefined ? { amountCents } : {}),
    ...(last4 ? { last4 } : {}),
    ...(network ? { network } : {}),
    ...(date ? { date } : {}),
    confidence: found / 4,
  };
}
