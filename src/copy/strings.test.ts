import { describe, expect, it } from 'vitest';
import { BANNED_WORDS, reasonText, S } from './strings';

const SAMPLE_ARGS: unknown[][] = [
  [1234], [-1234], [1234, 1], [1234, true], [1234, false], ['Dining', 3000], ['Dining', 3000, true], ['Dining', '2026-01-05'],
  ['2026-01-05', true], [2, 'x', 3], [1, 2, 3, 4, 5], [{ name: 'Rent', days: 2, amountCents: 1000, date: '2026-01-05', coverFrom: 'Savings', milestone: 50 }],
];

/** Collect every string the copy file can produce, calling functions with sample args. */
function collect(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v);
  else if (typeof v === 'function') {
    for (const args of SAMPLE_ARGS) {
      try {
        collect((v as (...a: unknown[]) => unknown)(...args), out);
      } catch {
        /* wrong shape for this sample */
      }
    }
  } else if (Array.isArray(v)) v.forEach((x) => collect(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => collect(x, out));
  return out;
}

const REASON_CODES = [
  'fixed_bills', 'from_habit', 'default_habit', 'nudged_for_goals', 'trimmed_for_goals', 'at_floor', 'income_tight',
  'surplus_to_fund', 'fund_no_room', 'goal_needed', 'goal_one_year', 'goal_open', 'goal_reached', 'goal_capped', 'surplus_to_goal',
];

describe('copy tone', () => {
  it('never uses failure language', () => {
    const all = [...collect(S), ...REASON_CODES.map((code) => reasonText({ code, params: { count: 2, total: 100, weekly: 5000, percent: 5, remaining: 1, months: 3, needed: 2, given: 1, extra: 1 } }))]
      .join('\n')
      .toLowerCase();
    for (const w of BANNED_WORDS) expect(all, `found "${w}"`).not.toMatch(new RegExp(`\\b${w}(s|ed|ing)?\\b`));
  });
  it('explains every plan reason the generator emits', () => {
    for (const code of REASON_CODES) expect(reasonText({ code }), code).not.toBe('');
  });
});
