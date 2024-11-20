import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { v7 } from 'uuid';
import { visitRequests, visitInterestResponses } from '../src/index.js';
import { inventoryHarness } from './inventory.fixture.js';
// VISIT-001 / ACC-006: IMPLEMENTED — NOT RUN — DEFERRED TO PHASE 10.
const harness = inventoryHarness();
beforeAll(() => harness.start());
afterAll(() => harness.close());
async function prepare() {
  const scope = await harness.scope(),
    visitId = v7();
  await harness
    .database()
    .insert(visitRequests)
    .values({
      id: visitId,
      branchId: scope.branchId,
      customerUserId: scope.customerA,
      requestedStart: new Date('2026-10-22T04:00:00Z'),
      status: 'completed',
    });
  return {
    ...scope,
    visitId,
    response: {
      id: v7(),
      branchId: scope.branchId,
      visitId,
      stillInterested: false,
      visitVersion: new Date('2026-10-22T05:00:00.001Z'),
    },
  };
}
it('VISIT-001 / ACC-002: a response cannot reference another branch visit', async () => {
  const f = await prepare(),
    foreign = await harness.scope();
  await expect(
    harness
      .database()
      .insert(visitInterestResponses)
      .values({ ...f.response, branchId: foreign.branchId }),
  ).rejects.toThrow();
  expect(
    await harness
      .database()
      .select()
      .from(visitInterestResponses)
      .where(eq(visitInterestResponses.visitId, f.visitId)),
  ).toHaveLength(0);
});
it('VISIT-001: concurrent duplicate response versions admit one row while later explicit decisions retain history', async () => {
  const f = await prepare();
  const results = await Promise.allSettled(
    [1, 2].map(() =>
      harness
        .database()
        .insert(visitInterestResponses)
        .values({ ...f.response, id: v7() }),
    ),
  );
  expect(results.filter((value) => value.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter((value) => value.status === 'rejected')).toHaveLength(1);
  await harness
    .database()
    .insert(visitInterestResponses)
    .values({
      ...f.response,
      id: v7(),
      stillInterested: true,
      visitVersion: new Date('2026-10-22T05:00:00.002Z'),
    });
  const rows = await harness
    .database()
    .select()
    .from(visitInterestResponses)
    .where(eq(visitInterestResponses.visitId, f.visitId))
    .orderBy(visitInterestResponses.visitVersion);
  expect(rows.map((row) => row.stillInterested)).toEqual([false, true]);
});
it('VISIT-001 / ACC-006: interest responses reject update, delete and truncate', async () => {
  const f = await prepare();
  await harness.database().insert(visitInterestResponses).values(f.response);
  await expect(
    harness
      .database()
      .update(visitInterestResponses)
      .set({ stillInterested: true })
      .where(eq(visitInterestResponses.id, f.response.id)),
  ).rejects.toThrow();
  await expect(
    harness
      .database()
      .delete(visitInterestResponses)
      .where(eq(visitInterestResponses.id, f.response.id)),
  ).rejects.toThrow();
  await expect(
    harness.database().execute(sql`TRUNCATE visit_interest_responses`),
  ).rejects.toThrow();
  const [row] = await harness
    .database()
    .select()
    .from(visitInterestResponses)
    .where(eq(visitInterestResponses.id, f.response.id));
  expect(row?.stillInterested).toBe(false);
});
