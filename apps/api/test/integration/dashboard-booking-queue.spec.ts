import { afterAll, beforeAll, expect, it } from 'vitest';
import { bookings, inventoryClaims } from '@hsm/db';
import { bookingPageSchema, bookingQuoteSnapshotSchema } from '@hsm/contracts';
import { phaseTwoFixture } from './phase-two-fixture.js';
let fixture: Awaited<ReturnType<typeof phaseTwoFixture>>;
const now = new Date('2026-10-15T10:00:00Z');
beforeAll(async () => {
  fixture = await phaseTwoFixture(now);
});
afterAll(async () => {
  await fixture?.close();
});
type Inventory = Awaited<ReturnType<typeof fixture.inventory>>;
type Target = {
  id: string;
  scope: Inventory;
  seatId: string;
  seatOrdinal: number;
  state: 'cancelled' | 'pending_request';
};
async function quoteFor(target: Target) {
  const response = await fixture.application.inject({
    method: 'POST',
    url: `/v1/marketplace/${target.scope.branchId}/quote`,
    payload: {
      target: { kind: 'bed', roomId: target.scope.roomId, bedId: target.seatId },
      range: { moveInDate: '2026-11-01', moveOutDate: '2026-11-03' },
    },
  });
  expect(response.statusCode).toBe(200);
  return bookingQuoteSnapshotSchema.parse(response.json());
}
// BKG-004 / ACC-001: the fixture policy reserves inventory, so each pending request
// commits with its exact bed claim; distinct beds keep the requests non-overlapping.
async function seedRequests(targets: Target[]) {
  const requestExpiresAt = new Date(now.getTime() + 3600000);
  const rows = await Promise.all(
    targets.map(async (target) => ({
      id: target.id,
      customerUserId: fixture.customerA,
      branchId: target.scope.branchId,
      roomId: target.scope.roomId,
      seatId: target.seatId,
      state: target.state,
      moveInDate: '2026-11-01',
      moveOutDate: '2026-11-03',
      quoteSnapshot: await quoteFor(target),
      policyVersionId: fixture.policyId,
      createdAt: now,
      requestExpiresAt,
    })),
  );
  const claims = targets
    .filter((target) => target.state === 'pending_request')
    .map((target) => ({
      branchId: target.scope.branchId,
      roomId: target.scope.roomId,
      seatId: target.seatId,
      seatOrdinal: target.seatOrdinal,
      moveInDate: '2026-11-01',
      moveOutDate: '2026-11-03',
      bookingId: target.id,
      expiresAt: requestExpiresAt,
    }));
  await fixture.connection.db.transaction(async (tx) => {
    await tx.insert(bookings).values(rows);
    await tx.insert(inventoryClaims).values(claims);
  });
}
it('AUD-009 / ACC-002 / BKG-004: real pending filtering precedes pagination and retains exact branch authorization', async () => {
  const inventory = await fixture.inventory();
  const other = await fixture.inventory();
  const [cancelled, firstPending, secondPending, foreignPending] = [1, 2, 3, 4].map(
    (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  ) as [string, string, string, string];
  await seedRequests([
    {
      id: cancelled,
      scope: inventory,
      seatId: inventory.seatId,
      seatOrdinal: 1,
      state: 'cancelled',
    },
    {
      id: firstPending,
      scope: inventory,
      seatId: inventory.seatId,
      seatOrdinal: 1,
      state: 'pending_request',
    },
    {
      id: secondPending,
      scope: inventory,
      seatId: inventory.otherSeatId,
      seatOrdinal: 2,
      state: 'pending_request',
    },
    {
      id: foreignPending,
      scope: other,
      seatId: other.seatId,
      seatOrdinal: 1,
      state: 'pending_request',
    },
  ]);
  const path = `/v1/branches/${inventory.branchId}/bookings`;
  const get = (query: string, token = fixture.ownerToken) =>
    fixture.application.inject({
      method: 'GET',
      url: path + query,
      headers: { authorization: `Bearer ${token}` },
    });
  const history = await get('?limit=1');
  expect(history.statusCode).toBe(200);
  expect(bookingPageSchema.parse(history.json()).data[0]?.id).toBe(cancelled);
  const first = await get('?limit=1&queue=pending_requests');
  expect(first.statusCode).toBe(200);
  const page = bookingPageSchema.parse(first.json());
  expect(page.data.map((row) => row.id)).toEqual([firstPending]);
  expect(page.nextCursor).toBe(firstPending);
  const next = await get(`?limit=1&queue=pending_requests&cursor=${page.nextCursor}`);
  expect(next.statusCode).toBe(200);
  expect(bookingPageSchema.parse(next.json())).toMatchObject({
    data: [{ id: secondPending }],
    nextCursor: null,
  });
  expect((await get('?queue=all')).statusCode).toBe(400);
  expect((await get('?queue=pending_requests', fixture.customerBToken)).statusCode).toBe(403);
});
