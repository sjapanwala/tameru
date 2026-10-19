// Merchant string normalisation and fuzzy matching.

// Payment-processor and POS prefixes that carry no meaning.
const PREFIXES = /^(sq|tst|sp|pp|pos|ach|interac|purchase|debit|visa|mc|e-transfer|paypal)\s*\*?\s+/;

/**
 * "SQ *JOE'S COFFEE #4412 TORONTO ON" → "joes coffee toronto on"
 * Lowercases, strips processor prefixes, store numbers and punctuation.
 */
export function merchantKey(raw: string): string {
  let s = raw.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
  s = s.replace(/['’`]/g, '');
  s = s.replace(/\*/g, ' * ');
  for (let i = 0; i < 3 && PREFIXES.test(s.replace(/\s+/g, ' ').trim()); i++) s = s.replace(/\s+/g, ' ').trim().replace(PREFIXES, '');
  s = s.replace(/#\s*\d+/g, ' '); // #4412
  s = s.replace(/\b(store|str|no|unit)\s*\d+\b/g, ' ');
  s = s.replace(/[^a-z0-9]+/g, ' ');
  s = s
    .split(' ')
    // Tokens with 3+ digits are store/terminal numbers; short numbers ("7-eleven") stay.
    .filter((t) => t && (t.match(/\d/g)?.length ?? 0) < 3)
    .join(' ');
  return s.trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]!;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length]!;
}

/** 0..1 similarity of two merchant keys: best of edit-distance ratio, token overlap and prefix match. */
export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const lev = 1 - levenshtein(a, b) / Math.max(a.length, b.length);
  const ta = new Set(a.split(' '));
  const tb = new Set(b.split(' '));
  const inter = [...ta].filter((t) => tb.has(t)).length;
  const jac = inter / new Set([...ta, ...tb]).size;
  // "starbucks" vs "starbucks queen st": the shorter is a word-boundary prefix of the longer
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  const prefix = short.length >= 4 && (long.startsWith(`${short} `) || long === short) ? 0.9 : 0;
  return Math.max(lev, jac, prefix);
}

export const FUZZY_THRESHOLD = 0.8;

/** Best fuzzy match from candidates, or null below the threshold. */
export function bestMatch<T>(key: string, candidates: readonly T[], keyOf: (c: T) => string): { item: T; score: number } | null {
  let best: { item: T; score: number } | null = null;
  for (const c of candidates) {
    const score = similarity(key, keyOf(c));
    if (score >= FUZZY_THRESHOLD && (!best || score > best.score)) best = { item: c, score };
  }
  return best;
}
