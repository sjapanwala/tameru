import { describe, expect, it } from 'vitest';
import { account, recurring } from '../../tests/factories';
import { dueOccurrences, recurringOriginKey } from './materialise';

describe('dueOccurrences', () => {
  const acc = account({ id: 'acc', openingDate: '2026-01-15' });
  const rent = recurring({ id: 'rent', schedule: { freq: 'monthly', day: 1 }, startDate: '2026-01-01' });
  it('generates only due, unrecorded occurrences after the opening date', () => {
    const d = dueOccurrences([rent], [acc], new Set(), '2026-03-01', false);
    expect(d.map((x) => x.date)).toEqual(['2026-02-01', '2026-03-01']);
    expect(d[0]).toMatchObject({ type: 'expense', status: 'pending', originKey: 'rec:rent:2026-02-01', amountCents: 100000 });
  });
  it('is idempotent given existing keys', () => {
    const keys = new Set([recurringOriginKey('rent', '2026-02-01'), recurringOriginKey('rent', '2026-03-01')]);
    expect(dueOccurrences([rent], [acc], keys, '2026-03-01', false)).toEqual([]);
  });
  it('honours auto-post overrides, income type and archived items', () => {
    const pay = recurring({ id: 'pay', kind: 'income', autoPost: true, schedule: { freq: 'monthly', day: 20 }, startDate: '2026-01-01' });
    const gone = recurring({ id: 'gone', archived: true });
    const d = dueOccurrences([pay, gone], [acc], new Set(), '2026-02-25', false);
    expect(d.map((x) => [x.type, x.status, x.date])).toEqual([['income', 'posted', '2026-01-20'], ['income', 'posted', '2026-02-20']]);
  });
});
