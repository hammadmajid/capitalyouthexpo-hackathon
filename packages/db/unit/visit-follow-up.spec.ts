import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { notificationOutbox } from '../src/schema/services.js';
import { visitHistory, visitRequests } from '../src/schema/visits.js';
import { visitInterestResponses } from '../src/schema/visit-interest.js';
import { lockInventoryBranch } from '../src/inventory-lock.js';
import { sweepVisitFollowUps } from '../src/visit-follow-up.js';
import { enqueueVisitLifecycle } from '../src/visit-lifecycle.js';
import { visitFixture } from './visit.fixture.js';
vi.mock('../src/inventory-lock.js', () => ({ lockInventoryBranch: vi.fn() }));
const now = new Date('2026-10-22T03:00:00Z'),
  branchId = randomUUID(),
  visitId = randomUUID(),
  historyId = randomUUID();
beforeEach(() => vi.resetAllMocks());
function ready() {
  const f = visitFixture();
  f.enqueue(visitRequests, [{ id: visitId, branchId }], [{ id: visitId, branchId }]);
  f.enqueue(visitHistory, [{ id: historyId }]);
  return f;
}
it('VISIT-001: no completed eligible visits require no branch or recipient locks', async () => {
  const f = visitFixture();
  expect(await sweepVisitFollowUps(f.db, now)).toBe(0);
  expect(lockInventoryBranch).not.toHaveBeenCalled();
  expect(f.writes).toHaveLength(0);
});
it('VISIT-001 / NTF-002: prompt source and one-shot marker write after the hierarchy lock, with no user recipient FK', async () => {
  const f = ready();
  expect(await sweepVisitFollowUps(f.db, now)).toBe(1);
  expect(lockInventoryBranch).toHaveBeenCalledWith(expect.anything(), branchId);
  expect(f.writes).toEqual([
    {
      table: notificationOutbox,
      kind: 'insert',
      value: expect.objectContaining({
        eventType: 'visit.lifecycle',
        recipientUserId: null,
        payload: { event: 'visit.follow_up', visitId, historyId },
        dedupeKey: 'visit.follow_up:' + visitId,
      }),
    },
    { table: visitRequests, kind: 'update', value: { followUpSentAt: now } },
  ]);
});
it('VISIT-001: a row no longer eligible after waiting cannot be prompted', async () => {
  const f = visitFixture();
  f.enqueue(visitRequests, [{ id: visitId, branchId }], []);
  expect(await sweepVisitFollowUps(f.db, now)).toBe(0);
  expect(f.writes).toHaveLength(0);
});
it('VISIT-001: an answer arriving before the locked recheck suppresses the prompt', async () => {
  const f = ready();
  f.enqueue(visitInterestResponses, [{ id: randomUUID() }]);
  expect(await sweepVisitFollowUps(f.db, now)).toBe(0);
  expect(f.writes).toHaveLength(0);
});
it('VISIT-001: completed status without required immutable completion proof fails closed', async () => {
  const f = visitFixture();
  f.enqueue(visitRequests, [{ id: visitId, branchId }], [{ id: visitId, branchId }]);
  await expect(sweepVisitFollowUps(f.db, now)).rejects.toMatchObject({
    code: 'PRECONDITION_FAILED',
  });
  expect(f.writes).toHaveLength(0);
});
it('VISIT-001 / ACC-006: failed durable event prevents the one-shot marker write', async () => {
  const f = ready();
  f.fail(notificationOutbox);
  await expect(sweepVisitFollowUps(f.db, now)).rejects.toThrow('Required write failed');
  expect(f.writes.some((write) => write.table === visitRequests)).toBe(false);
});
it.each(['visit.changed', 'visit.follow_up'])(
  'VISIT-001: %s has exact source-bound stable dedupe',
  async (event) => {
    const f = visitFixture();
    await enqueueVisitLifecycle(
      f.db as unknown as Parameters<typeof enqueueVisitLifecycle>[0],
      { event, visitId, historyId },
      now,
    );
    expect(f.writes[0]?.value).toMatchObject({
      dedupeKey:
        event === 'visit.changed' ? 'visit.lifecycle:' + historyId : 'visit.follow_up:' + visitId,
    });
  },
);
it('VISIT-001 / SEC-003: lifecycle producer rejects fabricated event and injected recipients before writing', async () => {
  const f = visitFixture(),
    tx = f.db as unknown as Parameters<typeof enqueueVisitLifecycle>[0];
  await expect(
    enqueueVisitLifecycle(tx, { event: 'visit.paid', visitId, historyId }, now),
  ).rejects.toThrow();
  await expect(
    enqueueVisitLifecycle(
      tx,
      { event: 'visit.changed', visitId, historyId, userId: randomUUID() },
      now,
    ),
  ).rejects.toThrow();
  expect(f.writes).toHaveLength(0);
});
