import { describe, expect, it } from 'vitest';
import { account } from '../../tests/factories';
import { quickLabel, slots, validateQuick } from './quick';
import type { QuickAction } from './types';

const chq = account({ id: 'chq' });
const inv = account({ id: 'inv', type: 'investing' });
const q = (p: Partial<QuickAction> = {}): QuickAction => ({
  id: 'q', createdAt: '', updatedAt: '', slot: 0, label: 'Coffee', icon: 'coffee', amountCents: 450, accountId: 'chq', ...p,
});

describe('quick actions', () => {
  it('validates presets', () => {
    expect(validateQuick(q(), [chq])).toEqual([]);
    expect(validateQuick(q({ accountId: 'ask' }), [])).toEqual([]);
    expect(validateQuick(q({ amountCents: 0 }), [chq])).toEqual(['amount_invalid']);
    expect(validateQuick(q({ amountCents: 4.5 }), [chq])).toEqual(['amount_invalid']);
    expect(validateQuick(q({ label: ' ', merchant: undefined }), [chq])).toEqual(['label_missing']);
    expect(validateQuick(q({ label: '', merchant: 'Tims' }), [chq])).toEqual([]);
    expect(validateQuick(q({ accountId: 'inv' }), [chq, inv])).toEqual(['account_missing']);
    expect(validateQuick(q({ slot: 4 }), [chq])).toEqual(['slot_invalid']);
  });
  it('lays presets out in four slots', () => {
    expect(slots([q({ slot: 2 })]).map((x) => x?.slot ?? null)).toEqual([null, null, 2, null]);
  });
  it('labels from the vendor when no label is set', () => {
    expect(quickLabel({ label: '', merchant: 'Tim Hortons' })).toBe('Tim Hortons');
  });
});
