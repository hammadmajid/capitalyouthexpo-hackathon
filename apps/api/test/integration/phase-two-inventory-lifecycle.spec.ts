import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  managerAssignments,
  managerInventoryGrants,
  rooms,
  roomTypes,
  seats,
  bookings,
} from '@hsm/db';
import {
  bookingQuoteSnapshotSchema,
  bookingSummarySchema,
  bookingPageSchema,
  inventoryBlockStateSchema,
  inventoryMutationSchema,
} from '@hsm/contracts';
import { phaseTwoFixture } from './phase-two-fixture.js';
let fixture: Awaited<ReturnType<typeof phaseTwoFixture>>;
let time = new Date('2026-10-15T10:00:00Z').getTime();
beforeAll(async () => {
  fixture = await phaseTwoFixture(new Date(time), () => new Date(time));
});
afterAll(async () => {
  await fixture?.close();
});
function headers(token = fixture.ownerToken, key = randomUUID()) {
  return { authorization: `Bearer ${token}`, 'Idempotency-Key': key };
}
async function quote(inventory: Awaited<ReturnType<typeof fixture.inventory>>) {
  const response = await fixture.application.inject({
    method: 'POST',
    url: `/v1/marketplace/${inventory.branchId}/quote`,
    payload: {
      target: { kind: 'bed', roomId: inventory.roomId, bedId: inventory.seatId },
      range: { moveInDate: '2026-11-01', moveOutDate: '2026-11-03' },
    },
  });
  expect(response.statusCode).toBe(200);
  return bookingQuoteSnapshotSchema.parse(response.json());
}
it('PROP-002 / ACC-001/004: real state changes and archival retain physical records and stable bed ordinals', async () => {
  const inventory = await fixture.inventory();
  const state = {
    method: 'PUT' as const,
    url: `/v1/branches/${inventory.branchId}/inventory/rooms/${inventory.roomId}/status`,
    headers: headers(),
    payload: { status: 'maintenance', reason: 'Scheduled work' },
  };
  expect((await fixture.application.inject(state)).statusCode).toBe(200);
  expect((await fixture.application.inject(state)).headers['idempotency-replayed']).toBe('true');
  const offline = await fixture.application.inject({
    method: 'POST',
    url: `/v1/marketplace/${inventory.branchId}/quote`,
    payload: {
      target: { kind: 'room', roomId: inventory.roomId },
      range: { moveInDate: '2026-11-01', moveOutDate: '2026-11-03' },
    },
  });
  expect(offline.statusCode).toBe(404);
  expect(
    (
      await fixture.application.inject({
        ...state,
        headers: headers(),
        payload: { status: 'active', reason: 'Work completed' },
      })
    ).statusCode,
  ).toBe(200);
  const archive = {
    method: 'POST' as const,
    url: `/v1/branches/${inventory.branchId}/inventory/seats/${inventory.seatId}/archive`,
    headers: headers(),
    payload: { reason: 'Replace physical bed' },
  };
  expect(
    (await fixture.application.inject({ ...archive, headers: headers(fixture.customerAToken) }))
      .statusCode,
  ).toBe(403);
  expect((await fixture.application.inject(archive)).statusCode).toBe(200);
  const [historical] = await fixture.connection.db
    .select()
    .from(seats)
    .where(eq(seats.id, inventory.seatId));
  expect(historical?.archivedAt).not.toBeNull();
  const added = await fixture.application.inject({
    method: 'POST',
    url: `/v1/branches/${inventory.branchId}/inventory/rooms/${inventory.roomId}/seats`,
    headers: headers(),
    payload: { label: 'C', status: 'active' },
  });
  expect(added.statusCode).toBe(200);
  const addedId = inventoryMutationSchema.parse(added.json()).id;
  const [newBed] = await fixture.connection.db.select().from(seats).where(eq(seats.id, addedId));
  expect(newBed?.ordinal).toBe(3);
  const archivedType = await fixture.application.inject({
    method: 'POST',
    url: `/v1/branches/${inventory.branchId}/inventory/room-types/${inventory.roomTypeId}/archive`,
    headers: headers(),
    payload: { reason: 'Retired type' },
  });
  expect(archivedType.statusCode).toBe(200);
  const [type] = await fixture.connection.db
    .select()
    .from(roomTypes)
    .where(eq(roomTypes.id, inventory.roomTypeId));
  const [room] = await fixture.connection.db
    .select()
    .from(rooms)
    .where(eq(rooms.id, inventory.roomId));
  expect(type?.archivedAt).not.toBeNull();
  expect(room?.archivedAt).not.toBeNull();
  expect(
    await fixture.connection.db.select().from(seats).where(eq(seats.roomId, inventory.roomId)),
  ).toHaveLength(3);
});
it('ACC-001 / BKG-004: live bookings block destructive availability changes; later archival preserves snapshots', async () => {
  const inventory = await fixture.inventory();
  const created = await fixture.application.inject({
    method: 'POST',
    url: `/v1/marketplace/${inventory.branchId}/bookings`,
    headers: headers(fixture.customerAToken),
    payload: { quote: await quote(inventory), documents: [] },
  });
  expect(created.statusCode).toBe(201);
  const booking = bookingSummarySchema.parse(created.json());
  for (const request of [
    {
      method: 'POST' as const,
      url: `/v1/branches/${inventory.branchId}/inventory/seats/${inventory.seatId}/archive`,
      payload: { reason: 'Retired' },
    },
    {
      method: 'POST' as const,
      url: `/v1/branches/${inventory.branchId}/inventory/room-types/${inventory.roomTypeId}/archive`,
      payload: { reason: 'Retired' },
    },
    {
      method: 'PUT' as const,
      url: `/v1/branches/${inventory.branchId}/inventory/rooms/${inventory.roomId}/status`,
      payload: { status: 'inactive', reason: 'Offline' },
    },
  ])
    expect((await fixture.application.inject({ ...request, headers: headers() })).statusCode).toBe(
      409,
    );
  expect(
    (
      await fixture.application.inject({
        method: 'POST',
        url: `/v1/branches/${inventory.branchId}/bookings/${booking.id}/cancel`,
        headers: headers(),
        payload: { reason: 'Resolve reservation before retirement' },
      })
    ).statusCode,
  ).toBe(200);
  expect(
    (
      await fixture.application.inject({
        method: 'POST',
        url: `/v1/branches/${inventory.branchId}/inventory/rooms/${inventory.roomId}/archive`,
        headers: headers(),
        payload: { reason: 'Retired room' },
      })
    ).statusCode,
  ).toBe(200);
  const [stored] = await fixture.connection.db
    .select()
    .from(bookings)
    .where(eq(bookings.id, booking.id));
  expect(stored?.quoteSnapshot).toEqual(booking.quote);
  expect(stored?.state).toBe('cancelled');
  const history = await fixture.application.inject({
    url: '/v1/me/bookings',
    headers: headers(fixture.customerAToken),
  });
  expect(history.statusCode).toBe(200);
  expect(
    bookingPageSchema.parse(history.json()).data.find((row) => row.id === booking.id)?.quote,
  ).toEqual(booking.quote);
});
it('ACC-001: expired real holds cannot permanently prevent safe archival and failed commands remain retryable', async () => {
  const inventory = await fixture.inventory();
  const held = await fixture.application.inject({
    method: 'POST',
    url: `/v1/marketplace/${inventory.branchId}/holds`,
    headers: headers(fixture.customerAToken),
    payload: { quote: await quote(inventory) },
  });
  expect(held.statusCode).toBe(201);
  const request = {
    method: 'POST' as const,
    url: `/v1/branches/${inventory.branchId}/inventory/seats/${inventory.seatId}/archive`,
    headers: headers(),
    payload: { reason: 'Retired after reservation expiry' },
  };
  expect((await fixture.application.inject(request)).statusCode).toBe(409);
  time += 601000;
  expect((await fixture.application.inject(request)).statusCode).toBe(200);
});

it('ACC-004: a granted Manager is limited to the assigned branch and cannot replay after removal', async () => {
  const inventory = await fixture.inventory(),
    foreign = await fixture.inventory(),
    assignmentId = randomUUID();
  await fixture.connection.db.insert(managerAssignments).values({
    id: assignmentId,
    userId: fixture.customerB,
    branchId: inventory.branchId,
    status: 'active',
    appointedByUserId: fixture.ownerId,
    activatedAt: fixture.now,
  });
  await fixture.connection.db
    .insert(managerInventoryGrants)
    .values({ assignmentId, permission: 'inventory_edit', grantedAt: fixture.now });
  const request = {
    method: 'PUT' as const,
    url: `/v1/branches/${inventory.branchId}/inventory/rooms/${inventory.roomId}/status`,
    headers: headers(fixture.customerBToken),
    payload: { status: 'maintenance', reason: 'Scheduled work' },
  };
  expect((await fixture.application.inject(request)).statusCode).toBe(200);
  expect(
    (
      await fixture.application.inject({
        ...request,
        headers: headers(fixture.customerBToken),
        url: `/v1/branches/${foreign.branchId}/inventory/rooms/${foreign.roomId}/status`,
      })
    ).statusCode,
  ).toBe(403);
  const wrongChild = await fixture.application.inject({
    method: 'POST',
    url: `/v1/branches/${foreign.branchId}/inventory/seats/${inventory.seatId}/archive`,
    headers: headers(),
    payload: { reason: 'Retired' },
  });
  expect(wrongChild.statusCode).toBe(404);
  await fixture.connection.db
    .update(managerAssignments)
    .set({ status: 'deactivated', deactivatedAt: new Date(time), statusReason: 'Test revocation' })
    .where(eq(managerAssignments.id, assignmentId));
  expect((await fixture.application.inject(request)).statusCode).toBe(403);
});
it('ACC-001: real concurrent booking and archival serialize without an archived confirmed seat', async () => {
  const inventory = await fixture.inventory(),
    snapshot = await quote(inventory);
  const [archived, created] = await Promise.all([
    fixture.application.inject({
      method: 'POST',
      url: `/v1/branches/${inventory.branchId}/inventory/seats/${inventory.seatId}/archive`,
      headers: headers(),
      payload: { reason: 'Retire seat' },
    }),
    fixture.application.inject({
      method: 'POST',
      url: `/v1/marketplace/${inventory.branchId}/bookings`,
      headers: headers(fixture.customerAToken),
      payload: { quote: snapshot, documents: [] },
    }),
  ]);
  expect([
    [200, 404],
    [409, 201],
  ]).toContainEqual([archived.statusCode, created.statusCode]);
  const stored = await fixture.connection.db
    .select()
    .from(bookings)
    .where(eq(bookings.branchId, inventory.branchId));
  const [bed] = await fixture.connection.db
    .select()
    .from(seats)
    .where(eq(seats.id, inventory.seatId));
  if (created.statusCode === 201) {
    expect(stored).toHaveLength(1);
    expect(bed?.archivedAt).toBeNull();
  } else {
    expect(stored).toHaveLength(0);
    expect(bed?.archivedAt).not.toBeNull();
  }
});

it('ACC-001 / PROP-002: active manual occupancy blocks must be explicitly released before archival', async () => {
  const inventory = await fixture.inventory();
  const response = await fixture.application.inject({
    method: 'POST',
    url: `/v1/branches/${inventory.branchId}/inventory/blocks`,
    headers: headers(),
    payload: {
      target: { kind: 'bed', roomId: inventory.roomId, bedId: inventory.seatId },
      range: { moveInDate: '2026-11-01', moveOutDate: '2026-11-03' },
      kind: 'manual',
      reason: 'Offline occupancy fixture',
    },
  });
  expect(response.statusCode).toBe(201);
  const block = inventoryBlockStateSchema.parse(response.json());
  const request = {
    method: 'POST' as const,
    url: `/v1/branches/${inventory.branchId}/inventory/seats/${inventory.seatId}/archive`,
    headers: headers(),
    payload: { reason: 'Retired bed' },
  };
  expect((await fixture.application.inject(request)).statusCode).toBe(409);
  const released = await fixture.application.inject({
    method: 'POST',
    url: `/v1/branches/${inventory.branchId}/inventory/blocks/${block.id}/release`,
    headers: headers(),
    payload: { reason: 'Occupancy resolved' },
  });
  expect(released.statusCode).toBe(200);
  expect(inventoryBlockStateSchema.parse(released.json()).releasedAt).not.toBeNull();
  expect((await fixture.application.inject(request)).statusCode).toBe(200);
});
