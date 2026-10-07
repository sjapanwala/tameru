// Merchant cleanup and rule matching.
//
// cleanMerchant turns a raw card descriptor into a display name:
//   "SQ *JOES COFFEE 4412" -> "Joe's Coffee"
// It is a heuristic, deliberately conservative with input that already has
// mixed case (assumed to be typed by a person and left mostly alone).

import type { MerchantRule } from './types';

/** Payment-processor and bank noise at the start of a descriptor. */
const PREFIXES: RegExp[] = [
  /^(sq|tst|pp|paypal|sp|gpay|google|apl|py|fs|ic|dd|in)\s*\*\s*/i,
  /^(pos|interac|debit|visa debit|point of sale)\s+(retail\s+)?(purchase|payment)\s*[-–:#]?\s*/i,
  /^(pos|purchase|payment|pre-?authorized (debit|payment))\s*[-–:]\s*/i,
];

/** Well-known brands whose descriptors carry trailing junk. Checked in order. */
const ALIASES: [RegExp, string][] = [
  [/^(amzn|amazon)\b/, 'Amazon'],
  [/^uber\s*\*?\s*eats\b/, 'Uber Eats'],
  [/^uber\b/, 'Uber'],
  [/^lyft\b/, 'Lyft'],
  [/^netflix\b/, 'Netflix'],
  [/^spotify\b/, 'Spotify'],
  [/^tim hortons?\b/, 'Tim Hortons'],
  [/^starbucks\b/, 'Starbucks'],
  [/^shoppers drug ?mart\b/, 'Shoppers Drug Mart'],
  [/^presto\b/, 'Presto'],
];

/** Words with a fixed spelling: possessives that lose their apostrophe, acronyms. */
const KNOWN_WORDS = new Map<string, string>([
  ['joes', "Joe's"],
  ['wendys', "Wendy's"],
  ['mcdonalds', "McDonald's"],
  ['dennys', "Denny's"],
  ['arbys', "Arby's"],
  ['harveys', "Harvey's"],
  ['kelseys', "Kelsey's"],
  ['moxies', "Moxie's"],
  ['caseys', "Casey's"],
  ['sams', "Sam's"],
  ['jacks', "Jack's"],
  ['tonys', "Tony's"],
  ['johns', "John's"],
  ['lowes', "Lowe's"],
  ['macys', "Macy's"],
  ['dominos', "Domino's"],
  ['nandos', "Nando's"],
  ['lcbo', 'LCBO'],
  ['ttc', 'TTC'],
  ['bmo', 'BMO'],
  ['rbc', 'RBC'],
  ['cibc', 'CIBC'],
  ['td', 'TD'],
  ['kfc', 'KFC'],
  ['iga', 'IGA'],
  ['ikea', 'IKEA'],
  ['atm', 'ATM'],
  ['a&w', 'A&W'],
  ['h&m', 'H&M'],
]);

const SMALL_WORDS = new Set(['and', 'of', 'the', 'de', 'la', 'le', 'du', 'at', 'in', 'on', 'for']);

/** Province / country codes that trail a descriptor ("... TORONTO ON CA"). */
const REGIONS = new Set([
  'ON',
  'QC',
  'BC',
  'AB',
  'MB',
  'SK',
  'NS',
  'NB',
  'NL',
  'PE',
  'YT',
  'NT',
  'NU',
  'CA',
  'CAN',
  'US',
  'USA',
]);

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function titleWord(word: string, index: number): string {
  const lower = word.toLowerCase();
  const known = KNOWN_WORDS.get(lower.replace(/['’]/g, ''));
  if (known) return known;
  if (index > 0 && SMALL_WORDS.has(lower)) return lower;
  return lower
    .split('-')
    .map((part) => {
      if (/^mc\p{L}{2,}/u.test(part)) return `Mc${capitalise(part.slice(2))}`;
      // O'REILLY -> O'Reilly, but JOE'S -> Joe's
      return capitalise(part).replace(
        /(['’])(\p{L})(?=\p{L}{2})/gu,
        (_, quote: string, letter: string) => quote + letter.toUpperCase(),
      );
    })
    .join('-');
}

function isNoiseToken(token: string, allUpper: boolean): boolean {
  if (/^\d{3,}$/.test(token)) return true; // store / terminal numbers
  if (/^\d+[-/]\d+/.test(token)) return true; // phone numbers, dates
  // Reference codes like "2K4RT9" or "T0412", only in bank-style descriptors.
  if (allUpper && /\p{L}/u.test(token) && (token.match(/\d/g)?.length ?? 0) >= 2) return true;
  return false;
}

export function cleanMerchant(raw: string): string {
  const original = raw.normalize('NFKC').replace(/\s+/g, ' ').trim();
  let s = original;

  for (let changed = true; changed;) {
    changed = false;
    for (const prefix of PREFIXES) {
      const next = s.replace(prefix, '');
      if (next !== s) {
        s = next;
        changed = true;
      }
    }
  }

  const letters = s.replace(/[^\p{L}]/gu, '');
  const allUpper = letters !== '' && letters === letters.toUpperCase();
  const allLower = letters !== '' && letters === letters.toLowerCase();

  // Aliases apply to anything that looks like a bank descriptor, not to
  // plain mixed-case typing ("Amazon Prime" stays as typed).
  if (allUpper || /[*#]|\d{3,}/.test(s)) {
    const lower = s.toLowerCase();
    for (const [pattern, name] of ALIASES) {
      if (pattern.test(lower)) return name;
    }
  }

  s = s
    .replace(/\.(com|ca|net|org|io)\b/gi, '')
    .replace(/#\s*\d+/g, ' ')
    .replace(/\*/g, ' ');

  const tokens = s.split(' ').filter(Boolean);
  const kept = tokens.filter((token, i) => i === 0 || !isNoiseToken(token, allUpper));
  while (kept.length > 1 && /^\d{3,}$/.test(kept[0]!)) kept.shift();
  if (allUpper) {
    while (kept.length > 1 && REGIONS.has(kept[kept.length - 1]!)) kept.pop();
  }

  const words = allUpper || allLower ? kept.map(titleWord) : kept;
  const cleaned = words.join(' ').replace(/^[\s\-–,.:;]+|[\s\-–,.:;]+$/g, '');

  return cleaned || original;
}

/**
 * Canonical form used for rule patterns and for de-duplicating merchants:
 * lowercase, no accents or apostrophes, letters and digits separated by
 * single spaces. "Joe's Coffee" -> "joes coffee".
 */
export function merchantKey(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

type RuleLike = Pick<MerchantRule, 'pattern' | 'cleanName' | 'categoryId' | 'updatedAt'>;

/**
 * Find the rule for a merchant. A rule matches when the merchant's key equals
 * its pattern or starts with it at a word boundary. The longest pattern wins;
 * ties go to the most recently updated rule.
 */
export function matchRule<R extends RuleLike>(merchant: string, rules: readonly R[]): R | null {
  const key = merchantKey(merchant);
  if (!key) return null;
  let best: R | null = null;
  for (const rule of rules) {
    if (!rule.pattern) continue;
    if (key !== rule.pattern && !key.startsWith(`${rule.pattern} `)) continue;
    if (
      !best ||
      rule.pattern.length > best.pattern.length ||
      (rule.pattern.length === best.pattern.length && rule.updatedAt > best.updatedAt)
    ) {
      best = rule;
    }
  }
  return best;
}

export interface ResolvedMerchant<R> {
  merchant: string;
  categoryId: string | null;
  rule: R | null;
}

/** Clean a raw descriptor and apply the matching rule, if any. */
export function resolveMerchant<R extends RuleLike>(
  raw: string,
  rules: readonly R[],
): ResolvedMerchant<R> {
  if (!raw.trim()) return { merchant: '', categoryId: null, rule: null };
  const cleaned = cleanMerchant(raw);
  const rule = matchRule(cleaned, rules);
  return {
    merchant: rule?.cleanName || cleaned,
    categoryId: rule?.categoryId ?? null,
    rule,
  };
}

export interface RuleSuggestion {
  pattern: string;
  cleanName: string;
  categoryId: string;
}

/**
 * The rule worth offering after the user filed `merchant` under `categoryId`,
 * or null when an existing rule already says the same thing.
 */
export function suggestRule(
  merchant: string,
  categoryId: string | null,
  rules: readonly RuleLike[],
): RuleSuggestion | null {
  const pattern = merchantKey(merchant);
  if (!pattern || !categoryId) return null;
  if (matchRule(merchant, rules)?.categoryId === categoryId) return null;
  return { pattern, cleanName: merchant.trim(), categoryId };
}
