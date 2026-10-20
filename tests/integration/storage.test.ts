import { describe, expect, it } from 'vitest';
import { testApp } from '../helpers';
import { SCHEMA_VERSION } from '../../src/data/db';
import type { Transaction } from '../../src/domain/types';

describe('storage', () => {
  it('initialises defaults once', async () => {
    const app = await testApp();
    const cats = await app.repos.categories.all();
    // Only Bills and the Irregular fund; the user adds the rest.
    expect(cats.filter((c) => c.group !== 'system').map((c) => c.name)).toEqual(['Bills', 'Irregular']);
    const s = await app.repos.settings.get();
    expect(s.freshStartDays).toBe(10);
    expect(app.db.verno).toBe(SCHEMA_VERSION);
  });
  it('never inserts the same originKey twice', async () => {
    const app = await testApp();
    const tx = (id: string): Transaction => ({
      id, type: 'expense', amountCents: 100, date: '2026-10-01', accountId: 'a', status: 'pending',
      needsReview: false, originKey: 'rec:r1:2026-10-01', createdAt: '', updatedAt: '',
    });
    expect(await app.repos.transactions.insertGenerated([tx('t1'), tx('t2')])).toBe(1);
    expect(await app.repos.transactions.insertGenerated([tx('t3')])).toBe(0);
    expect(await app.repos.transactions.all()).toHaveLength(1);
  });
});

describe('app lock', () => {
  it('stores only a salted hash, checks the passcode, keeps settings on change, and can be removed', async () => {
    const { checkPasscode, removeLock, setPasscode, updateLock } = await import('../../src/services/lock');
    const app = await testApp();
    await setPasscode(app, '2468', 4);
    const lock = (await app.repos.settings.get()).lock!;
    expect(lock).toMatchObject({ digits: 4, relockAfterMs: 60_000 });
    expect(JSON.stringify(lock)).not.toContain('2468');
    expect(await checkPasscode(app, '2468')).toBe(true);
    expect(await checkPasscode(app, '1357')).toBe(false);
    await updateLock(app, { relockAfterMs: 0 });
    await setPasscode(app, '135790', 6);
    expect((await app.repos.settings.get()).lock).toMatchObject({ digits: 6, relockAfterMs: 0 });
    expect(await checkPasscode(app, '2468')).toBe(false);
    expect(await checkPasscode(app, '135790')).toBe(true);
    await removeLock(app);
    expect((await app.repos.settings.get()).lock).toBeUndefined();
    expect(await checkPasscode(app, '135790')).toBe(false);
  });
});

describe('calendar export', () => {
  it('includes recurring bills, paydays and card due dates, but not card fees or irregular income', async () => {
    const { seedSampleData } = await import('../../src/data/seed');
    const { calendarItems } = await import('../../src/services/calendar');
    const { buildCalendar } = await import('../../src/domain/ics');
    const app = await testApp('2026-10-18');
    await seedSampleData(app);
    const items = await calendarItems(app);
    expect(items.some((i) => i.kind === 'card' && i.name === 'Student Visa' && i.start === '2026-10-28')).toBe(true);
    expect(items.some((i) => i.kind === 'income')).toBe(true);
    expect(items.some((i) => i.name.includes('fee'))).toBe(false); // system card-fee items stay out
    expect(items.every((i) => i.start > '2026-10-17')).toBe(true);
    const rent = items.find((i) => i.name === 'Rent')!;
    expect(await calendarItems(app, rent.id)).toEqual([rent]);
    const ics = buildCalendar(items.map((i) => ({ uid: i.id, title: i.name, start: i.start, repeat: i.repeat, remindDaysBefore: 1, remindAtHour: 9 })), new Date());
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(items.length);
  });
});
