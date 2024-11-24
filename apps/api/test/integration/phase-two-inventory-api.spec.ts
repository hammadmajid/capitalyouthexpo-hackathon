import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import {
  adminAccounts,
  places,
  hostelAuditLog,
  roomTypes,
  seats,
  managerAssignments,
  managerInventoryGrants,
} from '@hsm/db';
import {
  institutionStateSchema,
  institutionPageSchema,
  inventoryMutationSchema,
  branchInventorySchema,
} from '@hsm/contracts';
import { phaseTwoFixture } from './phase-two-fixture.js';
let fixture: Awaited<ReturnType<typeof phaseTwoFixture>>;
beforeAll(async () => {
  fixture = await phaseTwoFixture(new Date('2026-10-15T10:00:00Z'));
});
afterAll(async () => {
  await fixture?.close();
});
function headers(token: string, key = randomUUID()) {
  return { authorization: `Bearer ${token}`, 'Idempotency-Key': key };
}
const input = {
  name: 'Three beds',
  capacity: 3,
  inventoryMode: 'both',
  bedMonthlyRentPaisa: 1800001,
  roomMonthlyRentPaisa: 3200000,
  depositPaisa: 0,
  fees: [],
};
it('BKG-003 / ACC-001/004: real inventory HTTP creation, replay, audit and stable bed ordinals', async () => {
  const inventory = await fixture.inventory();
  const request = {
    method: 'POST' as const,
    url: `/v1/branches/${inventory.branchId}/inventory/room-types`,
    headers: headers(fixture.ownerToken),
    payload: input,
  };
  const created = await fixture.application.inject(request);
  expect(created.statusCode).toBe(200);
  const type = inventoryMutationSchema.parse(created.json());
  const replay = await fixture.application.inject(request);
  expect(replay.statusCode).toBe(200);
  expect(replay.headers['idempotency-replayed']).toBe('true');
  expect(replay.json()).toEqual(created.json());
  expect(
    await fixture.connection.db.select().from(roomTypes).where(eq(roomTypes.id, type.id)),
  ).toHaveLength(1);
  const audited = await fixture.connection.db
    .select()
    .from(hostelAuditLog)
    .where(
      and(
        eq(hostelAuditLog.targetId, type.id),
        eq(hostelAuditLog.action, 'inventory.room_type.save'),
      ),
    );
  expect(audited).toHaveLength(1);
  const roomResponse = await fixture.application.inject({
    method: 'POST',
    url: `/v1/branches/${inventory.branchId}/inventory/rooms`,
    headers: headers(fixture.ownerToken),
    payload: { roomTypeId: type.id, label: '202', status: 'active' },
  });
  expect(roomResponse.statusCode).toBe(200);
  const room = inventoryMutationSchema.parse(roomResponse.json());
  const bedRequest = {
    method: 'POST' as const,
    url: `/v1/branches/${inventory.branchId}/inventory/rooms/${room.id}/seats`,
    headers: headers(fixture.ownerToken),
    payload: { label: 'A', status: 'active' },
  };
  const bedResponse = await fixture.application.inject(bedRequest);
  expect(bedResponse.statusCode).toBe(200);
  const bed = inventoryMutationSchema.parse(bedResponse.json());
  expect((await fixture.application.inject(bedRequest)).headers['idempotency-replayed']).toBe(
    'true',
  );
  const [persisted] = await fixture.connection.db.select().from(seats).where(eq(seats.id, bed.id));
  expect(persisted?.ordinal).toBe(1);
  const invalid = await fixture.application.inject({
    ...bedRequest,
    headers: headers(fixture.ownerToken),
    payload: { ...bedRequest.payload, ordinal: 99 },
  });
  expect(invalid.statusCode).toBe(400);
  expect(invalid.json()).toHaveProperty('code', 'VALIDATION_FAILED');
  expect(
    await fixture.connection.db.select().from(seats).where(eq(seats.roomId, room.id)),
  ).toHaveLength(1);
  const read = await fixture.application.inject({
    url: `/v1/branches/${inventory.branchId}/inventory`,
    headers: headers(fixture.ownerToken),
  });
  expect(read.statusCode).toBe(200);
  const snapshot = branchInventorySchema.parse(read.json());
  expect(String(snapshot.roomTypes.find((row) => row.id === type.id)?.bedMonthlyRentPaisa)).toBe(
    '1800001',
  );
});
it('ACC-004: Manager inventory grant cannot bypass pricing permission or another branch parent scope', async () => {
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
  const denied = await fixture.application.inject({
    method: 'POST',
    url: `/v1/branches/${inventory.branchId}/inventory/room-types`,
    headers: headers(fixture.customerBToken),
    payload: input,
  });
  expect(denied.statusCode).toBe(403);
  const room = await fixture.application.inject({
    method: 'POST',
    url: `/v1/branches/${inventory.branchId}/inventory/rooms`,
    headers: headers(fixture.customerBToken),
    payload: { roomTypeId: inventory.roomTypeId, label: '203', status: 'active' },
  });
  expect(room.statusCode).toBe(200);
  const wrongParent = await fixture.application.inject({
    method: 'POST',
    url: `/v1/branches/${foreign.branchId}/inventory/rooms`,
    headers: headers(fixture.ownerToken),
    payload: { roomTypeId: inventory.roomTypeId, label: '204', status: 'active' },
  });
  expect(wrongParent.statusCode).toBe(404);
});

it('ACC-002 / SEC-003: Root directory creation and replay use real authorization and persistence', async () => {
  await fixture.connection.db
    .insert(adminAccounts)
    .values({ userId: fixture.ownerId, isRoot: true, status: 'active' });
  const request = {
    method: 'POST' as const,
    url: '/v1/admin/institutions',
    headers: headers(fixture.ownerToken),
    payload: {
      name: 'Integration University',
      shortName: 'IU',
      cityId: fixture.cityId,
      areaId: fixture.areaId,
      address: 'Integration fixture address',
      latitude: 33.6844,
      longitude: 73.0479,
      aliases: ['Integration campus'],
      isActive: true,
      publicApproved: true,
    },
  };
  const created = await fixture.application.inject(request);
  expect(created.statusCode).toBe(201);
  const institution = institutionStateSchema.parse(created.json());
  const replay = await fixture.application.inject(request);
  expect(replay.statusCode).toBe(201);
  expect(replay.headers['idempotency-replayed']).toBe('true');
  expect(
    await fixture.connection.db.select().from(places).where(eq(places.id, institution.id)),
  ).toHaveLength(1);
  const listed = await fixture.application.inject({
    url: '/v1/marketplace/institutions?q=Integration',
  });
  expect(listed.statusCode).toBe(200);
  expect(
    institutionPageSchema.parse(listed.json()).data.some((row) => row.id === institution.id),
  ).toBe(true);
  const denied = await fixture.application.inject({
    ...request,
    headers: headers(fixture.customerAToken),
  });
  expect(denied.statusCode).toBe(403);
  // ADM-001: the platform must retain one active root, so another root remains during suspension.
  await fixture.connection.db
    .insert(adminAccounts)
    .values({ userId: fixture.customerB, isRoot: true, status: 'active' });
  await fixture.connection.db
    .update(adminAccounts)
    .set({ status: 'suspended' })
    .where(eq(adminAccounts.userId, fixture.ownerId));
  expect((await fixture.application.inject(request)).statusCode).toBe(403);
});
