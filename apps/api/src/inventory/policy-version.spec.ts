import { expect, it } from 'vitest';
import { bookingPolicies } from '@hsm/db';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { BookingPolicyRepository } from './policy.repository.js';
const current = '10000000-0000-4000-8000-000000000001';
const stale = '10000000-0000-4000-8000-000000000002';
it.each([stale, null])(
  'BKG-006: stale Root platform version %s conflicts before any history write',
  async (expectedCurrentVersionId) => {
    const s = queryFixture();
    s.enqueue(bookingPolicies, [{ id: current }]);
    const repo = new BookingPolicyRepository(s.database);
    await expect(
      repo.save(
        s.transaction,
        { userId: stale, sessionId: current },
        { level: 'platform' },
        { policy: {} as never, limits: {} as never, expectedCurrentVersionId },
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 });
    expect(s.writes).toEqual([]);
  },
);
