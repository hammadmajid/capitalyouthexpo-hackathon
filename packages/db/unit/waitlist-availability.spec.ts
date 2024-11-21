import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { waitlistEntries } from '../src/schema/waitlist.js';
import { waitlistAvailability, waitlistVacancyEvents } from '../src/schema/waitlist-events.js';
import { notificationOutbox } from '../src/schema/services.js';
import { readPublicInventoryBranch } from '../src/inventory-public-branch.js';
import { hasOperationalInventoryAvailability } from '../src/inventory-operational-availability.js';
import { reconcileWaitlistAvailability, waitlistTodayRange } from '../src/waitlist-availability.js';
import { visitFixture } from './visit.fixture.js';
vi.mock('../src/inventory-public-branch.js', () => ({ readPublicInventoryBranch: vi.fn() }));
vi.mock('../src/inventory-operational-availability.js', () => ({
  hasOperationalInventoryAvailability: vi.fn(),
}));
const now = new Date('2026-10-22T20:00:00Z'),
  branchId = randomUUID(),
  roomTypeId = randomUUID();
const observation = (available: boolean, preference: string | null = null) => ({
  id: randomUUID(),
  branchId,
  roomTypeId: preference,
  available,
  eventId: null,
  checkedAt: now,
});
function fixture() {
  const f = visitFixture();
  f.enqueue(waitlistEntries, [{ id: randomUUID() }]);
  return f;
}
function tx(f: ReturnType<typeof visitFixture>) {
  return f.db as unknown as Parameters<typeof reconcileWaitlistAvailability>[0];
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(readPublicInventoryBranch).mockResolvedValue({ id: branchId });
});
it('WAIT-001: Karachi date rollover uses an actual calendar-day range and rejects an invalid clock', () => {
  expect(waitlistTodayRange(now)).toEqual({ moveInDate: '2026-10-23', moveOutDate: '2026-10-24' });
  expect(() => waitlistTodayRange(new Date('invalid'))).toThrow();
});
it('WAIT-001: unsubscribed branches do not perform inventory queries or create event state', async () => {
  const f = visitFixture();
  expect(await reconcileWaitlistAvailability(tx(f), branchId, now)).toBe(0);
  expect(readPublicInventoryBranch).not.toHaveBeenCalled();
  expect(hasOperationalInventoryAvailability).not.toHaveBeenCalled();
  expect(f.writes).toHaveLength(0);
});
it('WAIT-001: initial available observation does not invent a vacancy transition', async () => {
  const f = fixture();
  vi.mocked(hasOperationalInventoryAvailability).mockResolvedValue(true);
  expect(await reconcileWaitlistAvailability(tx(f), branchId, now)).toBe(0);
  expect(f.writes).toEqual([
    {
      table: waitlistAvailability,
      kind: 'insert',
      value: expect.objectContaining({ available: true, eventId: null }),
    },
  ]);
});
it('WAIT-001 / NTF-002: false-to-true branch and type edges enqueue one durable source event without recipients or bookings', async () => {
  const f = fixture();
  f.enqueue(waitlistAvailability, [observation(false)], [observation(false, roomTypeId)]);
  vi.mocked(hasOperationalInventoryAvailability).mockResolvedValue(true);
  expect(await reconcileWaitlistAvailability(tx(f), branchId, now, roomTypeId)).toBe(1);
  const event = f.writes.find((write) => write.table === waitlistVacancyEvents);
  expect(event?.value).toMatchObject({
    branchId,
    roomTypeId,
    branchBecameAvailable: true,
    typeBecameAvailable: true,
    availableOn: '2026-10-23',
  });
  expect(f.writes.filter((write) => write.table === notificationOutbox)).toEqual([
    {
      table: notificationOutbox,
      kind: 'insert',
      value: expect.objectContaining({
        channel: 'in_app',
        recipientUserId: null,
        eventType: 'waitlist.lifecycle',
      }),
    },
  ]);
  expect(f.writes.filter((write) => write.table === waitlistAvailability)).toHaveLength(2);
});
it('WAIT-001: unchanged availability keeps the original event identity without another notification', async () => {
  const f = fixture(),
    eventId = randomUUID();
  f.enqueue(waitlistAvailability, [{ ...observation(true), eventId }]);
  vi.mocked(hasOperationalInventoryAvailability).mockResolvedValue(true);
  expect(await reconcileWaitlistAvailability(tx(f), branchId, now)).toBe(0);
  expect(f.writes).toEqual([
    {
      table: waitlistAvailability,
      kind: 'update',
      value: { available: true, eventId, checkedAt: now },
    },
  ]);
});
it('WAIT-001 / SEC-003: unpublished branches invalidate their active edge and cannot alert', async () => {
  const f = fixture();
  f.enqueue(waitlistAvailability, [observation(true)], [observation(true, roomTypeId)]);
  vi.mocked(readPublicInventoryBranch).mockResolvedValue(undefined);
  expect(await reconcileWaitlistAvailability(tx(f), branchId, now, roomTypeId)).toBe(0);
  expect(hasOperationalInventoryAvailability).not.toHaveBeenCalled();
  expect(f.writes).toHaveLength(2);
  expect(f.writes.every((write) => JSON.stringify(write.value).includes('"eventId":null'))).toBe(
    true,
  );
});
it('WAIT-001 / ACC-006: failed durable outbox prevents observation acknowledgement', async () => {
  const f = fixture();
  f.enqueue(waitlistAvailability, [observation(false)]);
  f.fail(notificationOutbox);
  vi.mocked(hasOperationalInventoryAvailability).mockResolvedValue(true);
  await expect(reconcileWaitlistAvailability(tx(f), branchId, now)).rejects.toThrow(
    'Required write failed',
  );
  expect(f.writes.some((write) => write.table === waitlistAvailability)).toBe(false);
});
