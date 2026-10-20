import { describe, expect, it } from 'vitest';
import { checkDue, safeToReload } from './update';

describe('auto update', () => {
  const base = { hidden: false, sheetOpen: false, touched: false, sinceOpenMs: 500 };
  it('swaps right after opening, before any tap', () => {
    expect(safeToReload(base)).toBe(true);
    expect(safeToReload({ ...base, touched: true })).toBe(false);
    expect(safeToReload({ ...base, sinceOpenMs: 5_000 })).toBe(false);
  });
  it('swaps while switched away', () => {
    expect(safeToReload({ ...base, hidden: true, touched: true, sinceOpenMs: 60_000 })).toBe(true);
  });
  it('never swaps over a sheet in progress', () => {
    expect(safeToReload({ ...base, sheetOpen: true })).toBe(false);
    expect(safeToReload({ ...base, sheetOpen: true, hidden: true })).toBe(false);
  });
  it('spaces out checks', () => {
    expect(checkDue(0, 30_000)).toBe(false);
    expect(checkDue(0, 60_000)).toBe(true);
  });
});
