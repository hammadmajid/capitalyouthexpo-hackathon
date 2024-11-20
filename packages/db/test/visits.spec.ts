import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { v7 } from 'uuid';
import { visitRequests, visitHistory, visitingHours } from '../src/index.js';
import { inventoryHarness } from './inventory.fixture.js';
// VISIT-001: IMPLEMENTED — NOT RUN — DEFERRED TO PHASE 10.
const harness = inventoryHarness();
beforeAll(() => harness.start());
afterAll(() => harness.close());
async function prepare() {
  const scope = await harness.scope();
  return {
    ...scope,
    values: {
      id: v7(),
      branchId: scope.branchId,
      customerUserId: scope.customerA,
      requestedStart: new Date('2026-11-05T05:00:00Z'),
      status: 'requested' as const,
    },
  };
}
it('VISIT-001: competing duplicate active requests admit exactly one row', async () => {
  const f = await prepare();
  const results = await Promise.allSettled(
    [1, 2].map(() =>
      harness
        .database()
        .insert(visitRequests)
        .values({ ...f.values, id: v7() })
        .returning(),
    ),
  );
  expect(results.filter((value) => value.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter((value) => value.status === 'rejected')).toHaveLength(1);
  expect(
    await harness
      .database()
      .select()
      .from(visitRequests)
      .where(eq(visitRequests.branchId, f.branchId)),
  ).toHaveLength(1);
});
it('VISIT-001: a cancelled request is retained without blocking a later request', async () => {
  const f = await prepare();
  await harness
    .database()
    .insert(visitRequests)
    .values({ ...f.values, status: 'cancelled' });
  await harness
    .database()
    .insert(visitRequests)
    .values({ ...f.values, id: v7() });
  expect(
    await harness
      .database()
      .select()
      .from(visitRequests)
      .where(eq(visitRequests.branchId, f.branchId)),
  ).toHaveLength(2);
});
it('VISIT-001: reschedule state requires exactly a pending proposal', async () => {
  const f = await prepare();
  await expect(
    harness
      .database()
      .insert(visitRequests)
      .values({ ...f.values, status: 'rescheduled' }),
  ).rejects.toThrow();
  await expect(
    harness
      .database()
      .insert(visitRequests)
      .values({ ...f.values, proposedStart: new Date('2026-11-05T06:00:00Z') }),
  ).rejects.toThrow();
  await harness
    .database()
    .insert(visitRequests)
    .values({
      ...f.values,
      status: 'rescheduled',
      proposedStart: new Date('2026-11-05T06:00:00Z'),
    });
});
it('VISIT-001: rejection requires a nonempty reason and follow-up is only for completed visits', async () => {
  const f = await prepare();
  await expect(
    harness
      .database()
      .insert(visitRequests)
      .values({ ...f.values, status: 'rejected' }),
  ).rejects.toThrow();
  await expect(
    harness
      .database()
      .insert(visitRequests)
      .values({ ...f.values, status: 'rejected', reason: ' ' }),
  ).rejects.toThrow();
  await expect(
    harness
      .database()
      .insert(visitRequests)
      .values({ ...f.values, followUpSentAt: new Date() }),
  ).rejects.toThrow();
});
it('VISIT-001 / ACC-002: visit history cannot bind a foreign branch', async () => {
  const f = await prepare(),
    other = await harness.scope();
  await harness.database().insert(visitRequests).values(f.values);
  await expect(
    harness.database().insert(visitHistory).values({
      branchId: other.branchId,
      visitId: f.values.id,
      actorUserId: f.ownerId,
      action: 'request',
      status: 'requested',
      requestedStart: f.values.requestedStart,
    }),
  ).rejects.toThrow();
});
it('VISIT-001 / ACC-006: failure to write history rolls the visit back', async () => {
  const f = await prepare();
  await expect(
    harness.database().transaction(async (tx) => {
      await tx.insert(visitRequests).values(f.values);
      await tx.insert(visitHistory).values({
        branchId: f.branchId,
        visitId: f.values.id,
        actorUserId: f.ownerId,
        action: 'request',
        status: 'rescheduled',
        requestedStart: f.values.requestedStart,
      });
    }),
  ).rejects.toThrow();
  expect(
    await harness.database().select().from(visitRequests).where(eq(visitRequests.id, f.values.id)),
  ).toHaveLength(0);
});
it('VISIT-001: invalid weekdays and inverted visiting windows are rejected', async () => {
  const f = await prepare();
  await expect(
    harness
      .database()
      .insert(visitingHours)
      .values({ branchId: f.branchId, dayOfWeek: 7, opensAt: '09:00', closesAt: '17:00' }),
  ).rejects.toThrow();
  await expect(
    harness
      .database()
      .insert(visitingHours)
      .values({ branchId: f.branchId, dayOfWeek: 4, opensAt: '17:00', closesAt: '09:00' }),
  ).rejects.toThrow();
  await harness
    .database()
    .insert(visitingHours)
    .values({ branchId: f.branchId, dayOfWeek: 4, opensAt: '09:00', closesAt: '17:00' });
});

it('VISIT-001 / ACC-006: original visit history rejects update, delete and truncate', async () => {
  const f = await prepare(),
    historyId = v7();
  await harness.database().insert(visitRequests).values(f.values);
  const snapshot = {
    id: historyId,
    branchId: f.branchId,
    visitId: f.values.id,
    actorUserId: f.customerA,
    action: 'request',
    status: 'requested' as const,
    requestedStart: f.values.requestedStart,
  };
  await harness.database().insert(visitHistory).values(snapshot);
  await expect(
    harness
      .database()
      .update(visitHistory)
      .set({ reason: 'Rewrite' })
      .where(eq(visitHistory.id, historyId)),
  ).rejects.toThrow();
  await expect(
    harness.database().delete(visitHistory).where(eq(visitHistory.id, historyId)),
  ).rejects.toThrow();
  await expect(harness.database().execute(sql`truncate table visit_history`)).rejects.toThrow();
  const rows = await harness
    .database()
    .select()
    .from(visitHistory)
    .where(eq(visitHistory.id, historyId));
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject(snapshot);
});
