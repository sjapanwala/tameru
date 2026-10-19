import { describe, expect, it } from 'vitest';
import { buildNotices, dueToday, type NoticeInput } from './notifications';

const base = (p: Partial<NoticeInput> = {}): NoticeInput => ({ today: '2026-01-10', bills: [], paydays: [], cards: [], negatives: [], milestones: [], ...p });

describe('notifications', () => {
  it('schedules bills two days ahead and card payments three days ahead', () => {
    const n = buildNotices(base({
      bills: [{ recurringId: 'rent', name: 'Rent', date: '2026-01-15', amountCents: 95000 }, { recurringId: 'x', name: 'Soon', date: '2026-01-11', amountCents: 1 }],
      cards: [{ accountId: 'visa', name: 'Visa', dueDate: '2026-01-20', owingCents: 30000 }, { accountId: 'mc', name: 'MC', dueDate: '2026-01-20', owingCents: 0 }],
    }));
    expect(n.map((x) => [x.kind, x.fireOn])).toEqual([['bill_soon', '2026-01-13'], ['card_due_soon', '2026-01-17']]);
  });
  it('flags low balances only within a week, with a way to cover', () => {
    const n = buildNotices(base({
      negatives: [
        { accountId: 'chq', name: 'Chequing', date: '2026-01-14', balanceCents: -4000, coverFromName: 'Savings' },
        { accountId: 'cash', name: 'Cash', date: '2026-02-20', balanceCents: -100 },
      ],
    }));
    expect(n).toEqual([{ id: 'low:chq:2026-01-14', kind: 'low_balance_ahead', fireOn: '2026-01-10', params: { name: 'Chequing', date: '2026-01-14', amountCents: 4000, coverFrom: 'Savings' } }]);
  });
  it('delivers at most two a day, most useful first, each once', () => {
    const n = buildNotices(base({
      paydays: [{ recurringId: 'p', name: 'Pay', date: '2026-01-10', amountCents: 1 }],
      milestones: [{ goalId: 'g', name: 'Trip', milestone: 50 }],
      negatives: [{ accountId: 'chq', name: 'Chequing', date: '2026-01-12', balanceCents: -1 }],
    }));
    const today = dueToday(n, '2026-01-10', new Set());
    expect(today.map((x) => x.kind)).toEqual(['low_balance_ahead', 'payday']);
    expect(dueToday(n, '2026-01-10', new Set(today.map((x) => x.id))).map((x) => x.kind)).toEqual(['goal_milestone']);
  });
});
