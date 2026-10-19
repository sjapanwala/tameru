import { describe, expect, it } from 'vitest';
import { testApp } from '../helpers';
import { seedSampleData } from '../../src/data/seed';
import { onAppOpen } from '../../src/services/appOpen';
import { doFreshStart } from '../../src/services/freshStart';
import { getHome } from '../../src/services/home';
import { addTransaction } from '../../src/services/transactions';

describe('fresh start after time away', () => {
  it('leads with status, offers a fresh start, keeps history, and logs it', async () => {
    const app = await testApp('2026-10-05');
    await seedSampleData(app);
    await onAppOpen(app);
    for (let i = 0; i < 3; i++) await addTransaction(app, { amountCents: 1500 + i, merchant: `New place ${i}` }); // auto-categorised, needs review
    app.clock.set('2026-10-18');
    const open = await onAppOpen(app);
    expect(open.freshStart).toMatchObject({ reason: 'away', daysAway: 13 });
    const home = await getHome(app); // status is available before any review
    expect(Number.isSafeInteger(home.sts.safeCents)).toBe(true);
    const countBefore = (await app.repos.transactions.all()).length;

    const summary = await doFreshStart(app, 13);
    expect(summary.count).toBeGreaterThanOrEqual(3);
    const txs = await app.repos.transactions.all();
    expect(txs.length).toBe(countBefore);
    expect(txs.filter((t) => t.needsReview || (t.status === 'pending' && t.date <= '2026-10-18'))).toEqual([]);
    expect((await app.repos.segments.all())[0]).toMatchObject({ periodStart: '2026-10-01', segmentStart: '2026-10-18' });
    const after = await getHome(app);
    expect(after.overs).toEqual([]); // the restarted period starts clean
    const bills = after.rows.find((r) => r.category.id === 'cat_bills')!.budget;
    expect(bills.allocatedCents).toBe(after.sts.breakdown.billsCents);
    expect((await app.repos.events.all()).filter((e) => e.type === 'fresh_start')).toHaveLength(1);
    expect((await app.repos.snapshots.all()).length).toBeGreaterThanOrEqual(2); // earlier periods snapshotted
  });
});
