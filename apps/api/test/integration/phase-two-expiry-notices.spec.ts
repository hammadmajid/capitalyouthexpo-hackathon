import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';
import {
  bookings,
  bookingHistory,
  inventoryClaims,
  notificationOutbox,
  rooms,
  lockInventoryBranch,
  expireRoomReservations,
  type Database,
} from '@hsm/db';
import { bookingQuoteSnapshotSchema, bookingSummarySchema } from '@hsm/contracts';
import { phaseTwoFixture } from './phase-two-fixture.js';
let fixture: Awaited<ReturnType<typeof phaseTwoFixture>>;
beforeAll(async () => {
  fixture = await phaseTwoFixture(new Date('2026-10-15T10:00:00Z'));
});
afterAll(async () => {
  await fixture?.close();
});
const headers = (token: string) => ({
  authorization: 'Bearer ' + token,
  'Idempotency-Key': randomUUID(),
});
async function prepare(reserves: boolean) {
  const inventory = await fixture.inventory();
  const policy = await fixture.application.inject({
    method: 'PUT',
    url: `/v1/branches/${inventory.branchId}/booking-policy`,
    headers: headers(fixture.ownerToken),
    payload: { overrides: { bookingMode: 'request', requestReservesInventory: reserves } },
  });
  expect(policy.statusCode).toBe(200);
  const response = await fixture.application.inject({
    method: 'POST',
    url: `/v1/marketplace/${inventory.branchId}/quote`,
    payload: {
      target: { kind: 'bed', roomId: inventory.roomId, bedId: inventory.seatId },
      range: { moveInDate: '2026-11-01', moveOutDate: '2026-11-03' },
    },
  });
  expect(response.statusCode).toBe(200);
  const quote = bookingQuoteSnapshotSchema.parse(response.json());
  const created = await fixture.application.inject({
    method: 'POST',
    url: `/v1/marketplace/${inventory.branchId}/bookings`,
    headers: headers(fixture.customerAToken),
    payload: { quote, documents: [] },
  });
  expect(created.statusCode).toBe(201);
  const booking = bookingSummarySchema.parse(created.json());
  expect(booking.state).toBe('pending_request');
  if (!booking.requestExpiresAt) throw new Error('Pending request deadline missing');
  return {
    inventory,
    booking,
    expiredAt: new Date(new Date(booking.requestExpiresAt).getTime() + 1),
  };
}
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
async function expire(transaction: Transaction, input: Awaited<ReturnType<typeof prepare>>) {
  await lockInventoryBranch(transaction, input.inventory.branchId);
  await transaction
    .select({ id: rooms.id })
    .from(rooms)
    .where(eq(rooms.id, input.inventory.roomId))
    .for('update');
  return expireRoomReservations(transaction, input.inventory.roomId, input.expiredAt);
}
function notice(id: string) {
  return fixture.connection.db
    .select()
    .from(notificationOutbox)
    .where(eq(notificationOutbox.dedupeKey, 'booking.lifecycle:booking.expired:' + id));
}
function history(id: string) {
  return fixture.connection.db
    .select()
    .from(bookingHistory)
    .where(and(eq(bookingHistory.bookingId, id), eq(bookingHistory.nextState, 'expired')));
}
function claims(id: string) {
  return fixture.connection.db
    .select()
    .from(inventoryClaims)
    .where(and(eq(inventoryClaims.bookingId, id), isNull(inventoryClaims.releasedAt)));
}
it.each([true, false])(
  'ACC-001 / NTF-002: real expiry with reserves=%s commits state/history and one recipient-free notice despite replay',
  async (reserves) => {
    const input = await prepare(reserves),
      database = fixture.connection.db;
    expect(await database.transaction((transaction) => expire(transaction, input))).toBe(1);
    expect(await database.transaction((transaction) => expire(transaction, input))).toBe(0);
    const [booking] = await database
      .select()
      .from(bookings)
      .where(eq(bookings.id, input.booking.id));
    expect(booking?.state).toBe('expired');
    expect(await claims(input.booking.id)).toHaveLength(0);
    expect(await history(input.booking.id)).toHaveLength(1);
    const notices = await notice(input.booking.id);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({
      eventType: 'booking.lifecycle',
      channel: 'in_app',
      recipientUserId: null,
      payload: { event: 'booking.expired', bookingId: input.booking.id },
    });
  },
);
it.each([true, false])(
  'ACC-001 / NTF-002: real expiry with reserves=%s rolls back claims, state, history and outbox on downstream failure',
  async (reserves) => {
    const input = await prepare(reserves),
      database = fixture.connection.db;
    await expect(
      database.transaction(async (transaction) => {
        await expire(transaction, input);
        throw new Error('Deliberate expiry rollback');
      }),
    ).rejects.toThrow('Deliberate expiry rollback');
    const [booking] = await database
      .select()
      .from(bookings)
      .where(eq(bookings.id, input.booking.id));
    expect(booking?.state).toBe('pending_request');
    expect(await claims(input.booking.id)).toHaveLength(reserves ? 1 : 0);
    expect(await history(input.booking.id)).toHaveLength(0);
    expect(await notice(input.booking.id)).toHaveLength(0);
  },
);
