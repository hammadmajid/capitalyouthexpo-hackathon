import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { visitInterestResponses, visitRequests } from '@hsm/db';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { readVisitInterest, recordVisitInterest } from './interest.js';
const now = new Date('2026-10-22T03:00:00Z');
const visit: typeof visitRequests.$inferSelect = {
  id: randomUUID(),
  branchId: randomUUID(),
  customerUserId: randomUUID(),
  status: 'completed',
  requestedStart: now,
  proposedStart: null,
  reason: null,
  decidedByUserId: null,
  followUpSentAt: null,
  createdAt: now,
  updatedAt: now,
};
it('VISIT-001: completed visits start unanswered and expose no customer account identity', async () => {
  const f = queryFixture(),
    result = await readVisitInterest(f.transaction, visit);
  expect(result.stillInterested).toBeNull();
  expect(result.respondedAt).toBeNull();
  expect(result.promptedAt).toBeNull();
  expect(result).not.toHaveProperty('customerUserId');
});
it.each(['requested', 'approved', 'rescheduled', 'rejected', 'cancelled', 'no_show'] as const)(
  'VISIT-001: %s visits cannot read or record post-visit interest',
  async (status) => {
    const f = queryFixture(),
      before = { ...visit, status };
    await expect(readVisitInterest(f.transaction, before)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    await expect(
      recordVisitInterest(
        f.transaction,
        before,
        { expectedUpdatedAt: now.toISOString(), stillInterested: true },
        now,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(f.writes).toHaveLength(0);
  },
);
it('VISIT-001: stale interest command never appends a response or overwrites the visit version', async () => {
  const f = queryFixture();
  await expect(
    recordVisitInterest(
      f.transaction,
      visit,
      { expectedUpdatedAt: '2026-10-21T03:00:00Z', stillInterested: false },
      now,
    ),
  ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  expect(f.writes).toHaveLength(0);
});
it.each([true, false])(
  'VISIT-001: explicit %s response is historical and advances an exact reviewed version',
  async (stillInterested) => {
    const f = queryFixture(),
      updatedAt = new Date(now.getTime() + 1);
    f.enqueue(visitRequests, [{ ...visit, updatedAt, followUpSentAt: now }]);
    f.enqueue(visitInterestResponses, [], [{ stillInterested, createdAt: now }]);
    const result = await recordVisitInterest(
      f.transaction,
      visit,
      { expectedUpdatedAt: now.toISOString(), stillInterested },
      now,
    );
    expect(result.stillInterested).toBe(stillInterested);
    expect(result.expectedUpdatedAt).toBe(updatedAt.toISOString());
    expect(result.promptedAt).toBe(now.toISOString());
    expect(result.respondedAt).toBe(now.toISOString());
    expect(f.writes).toContainEqual({
      table: visitInterestResponses,
      kind: 'insert',
      value: expect.objectContaining({
        branchId: visit.branchId,
        visitId: visit.id,
        stillInterested,
      }),
    });
  },
);
it('VISIT-001: a missing locked update cannot become a successful response', async () => {
  const f = queryFixture();
  await expect(
    recordVisitInterest(
      f.transaction,
      visit,
      { expectedUpdatedAt: now.toISOString(), stillInterested: true },
      now,
    ),
  ).rejects.toThrow('Visit response unavailable');
});
