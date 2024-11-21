import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { bookings, stays } from '@hsm/db';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { BookingActionRepository } from './actions.repository.js';
vi.mock('../auth/actor-lock.js', () => ({ lockActor: vi.fn() }));
it.each([true, false])(
  'STAY-001 / BKG-006: checked-in booking cannot use legacy cancellation (staff=%s)',
  async (staff) => {
    const store = queryFixture(),
      repository = new BookingActionRepository(store.database);
    const actor = { userId: randomUUID(), sessionId: randomUUID() },
      branchId = randomUUID(),
      now = new Date();
    const booking: typeof bookings.$inferSelect = {
      id: randomUUID(),
      branchId,
      customerUserId: actor.userId,
      roomId: randomUUID(),
      seatId: null,
      holdId: null,
      moveInDate: '2028-02-01',
      moveOutDate: '2028-03-01',
      state: 'confirmed',
      requestExpiresAt: null,
      policyVersionId: randomUUID(),
      quoteSnapshot: {},
      createdAt: now,
      updatedAt: now,
    };
    vi.spyOn(repository, 'target').mockResolvedValue(booking);
    store.enqueue(stays, [{ id: randomUUID() }]);
    await expect(
      repository.cancel(
        store.transaction,
        actor,
        booking.id,
        'Cancel fixture',
        staff ? branchId : undefined,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 });
    expect(store.writes).toHaveLength(0);
  },
);
