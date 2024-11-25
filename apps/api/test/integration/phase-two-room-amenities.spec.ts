import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import {
  amenities,
  hostelAuditLog,
  managerAssignments,
  managerInventoryGrants,
  roomTypeAmenities,
  roomTypes,
} from '@hsm/db';
import { publicInventoryTypePageSchema, roomAmenitiesStateSchema } from '@hsm/contracts';
import { phaseTwoFixture } from './phase-two-fixture.js';
import { RoomAmenitiesRepository } from '../../src/inventory/room-amenities.repository.js';
let fixture: Awaited<ReturnType<typeof phaseTwoFixture>>;
const code = 'fixture_' + randomUUID().replaceAll('-', '').slice(0, 12);
beforeAll(async () => {
  fixture = await phaseTwoFixture(new Date('2026-10-17T10:00:00Z'));
  await fixture.connection.db
    .insert(amenities)
    .values({ code, name: 'Approved fixture Wi-Fi', isActive: true });
});
afterAll(async () => {
  await fixture?.close();
});
const url = (branchId: string, roomTypeId: string) =>
  '/v1/branches/' + branchId + '/room-types/' + roomTypeId + '/amenities';
async function read(branchId: string, roomTypeId: string, token = fixture.ownerToken) {
  const result = await fixture.application.inject({
    url: url(branchId, roomTypeId),
    headers: { authorization: 'Bearer ' + token },
  });
  expect(result.statusCode).toBe(200);
  expect(result.headers['cache-control']).toBe('no-store');
  const state = roomAmenitiesStateSchema.parse(result.json());
  expect(result.headers.etag).toBe('"' + state.version + '"');
  return state;
}
function save(
  branchId: string,
  roomTypeId: string,
  version: string,
  codes: string[],
  key = randomUUID(),
  token = fixture.ownerToken,
) {
  return fixture.application.inject({
    method: 'PUT',
    url: url(branchId, roomTypeId),
    payload: { amenityCodes: codes },
    headers: {
      authorization: 'Bearer ' + token,
      'If-Match': '"' + version + '"',
      'Idempotency-Key': key,
    },
  });
}
async function publicSelection(branchId: string, roomTypeId: string) {
  const response = await fixture.application.inject({
    url: '/v1/marketplace/' + branchId + '/inventory/pages/room-types?limit=20',
  });
  expect(response.statusCode).toBe(200);
  const room = publicInventoryTypePageSchema
    .parse(response.json())
    .data.find((type) => type.id === roomTypeId);
  if (!room) throw new Error('Missing real public room type');
  return room.amenities;
}
it('ROOM-002 / AUD-001: actual selection, replay, version conflict and explicit clearing preserve room pricing', async () => {
  const inventory = await fixture.inventory(),
    before = await read(inventory.branchId, inventory.roomTypeId),
    key = randomUUID();
  expect(before).toMatchObject({ amenities: [], canEdit: true });
  const [pricingBefore] = await fixture.connection.db
    .select()
    .from(roomTypes)
    .where(eq(roomTypes.id, inventory.roomTypeId));
  const result = await save(inventory.branchId, inventory.roomTypeId, before.version, [code], key);
  expect(result.statusCode).toBe(200);
  const after = roomAmenitiesStateSchema.parse(result.json());
  expect(after.amenities).toEqual([{ code, name: 'Approved fixture Wi-Fi', isActive: true }]);
  expect(await publicSelection(inventory.branchId, inventory.roomTypeId)).toEqual([
    { code, name: 'Approved fixture Wi-Fi' },
  ]);
  const replay = await save(inventory.branchId, inventory.roomTypeId, before.version, [code], key);
  expect(replay.statusCode).toBe(200);
  expect(replay.headers['idempotency-replayed']).toBe('true');
  expect(
    (await save(inventory.branchId, inventory.roomTypeId, before.version, [])).statusCode,
  ).toBe(412);
  expect(
    await fixture.connection.db
      .select()
      .from(roomTypeAmenities)
      .where(eq(roomTypeAmenities.roomTypeId, inventory.roomTypeId)),
  ).toEqual([
    { branchId: inventory.branchId, roomTypeId: inventory.roomTypeId, amenityCode: code },
  ]);
  expect(
    await fixture.connection.db
      .select()
      .from(hostelAuditLog)
      .where(eq(hostelAuditLog.targetId, inventory.roomTypeId)),
  ).toHaveLength(1);
  expect((await save(inventory.branchId, inventory.roomTypeId, after.version, [])).statusCode).toBe(
    200,
  );
  expect((await read(inventory.branchId, inventory.roomTypeId)).amenities).toEqual([]);
  const [pricingAfter] = await fixture.connection.db
    .select()
    .from(roomTypes)
    .where(eq(roomTypes.id, inventory.roomTypeId));
  expect(pricingAfter).toEqual(pricingBefore);
});
it('ACC-004: actual Manager listing grant and revocation govern writes and stored replay without cross-room access', async () => {
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
  const before = await read(inventory.branchId, inventory.roomTypeId, fixture.customerBToken),
    key = randomUUID();
  expect(before.canEdit).toBe(false);
  expect(
    (
      await save(
        inventory.branchId,
        inventory.roomTypeId,
        before.version,
        [code],
        key,
        fixture.customerBToken,
      )
    ).statusCode,
  ).toBe(403);
  await fixture.connection.db
    .insert(managerInventoryGrants)
    .values({ assignmentId, permission: 'listing_edit', grantedAt: fixture.now });
  const granted = await read(inventory.branchId, inventory.roomTypeId, fixture.customerBToken);
  expect(granted.canEdit).toBe(true);
  expect(
    (
      await save(
        inventory.branchId,
        inventory.roomTypeId,
        granted.version,
        [code],
        key,
        fixture.customerBToken,
      )
    ).statusCode,
  ).toBe(200);
  await fixture.connection.db
    .delete(managerInventoryGrants)
    .where(
      and(
        eq(managerInventoryGrants.assignmentId, assignmentId),
        eq(managerInventoryGrants.permission, 'listing_edit'),
      ),
    );
  expect(
    (
      await save(
        inventory.branchId,
        inventory.roomTypeId,
        granted.version,
        [code],
        key,
        fixture.customerBToken,
      )
    ).statusCode,
  ).toBe(403);
  expect(
    (
      await fixture.application.inject({
        url: url(inventory.branchId, foreign.roomTypeId),
        headers: { authorization: 'Bearer ' + fixture.customerBToken },
      })
    ).statusCode,
  ).toBe(404);
  expect(
    (
      await fixture.application.inject({
        url: url(foreign.branchId, foreign.roomTypeId),
        headers: { authorization: 'Bearer ' + fixture.customerBToken },
      })
    ).statusCode,
  ).toBe(403);
  expect(
    (await fixture.application.inject({ url: url(inventory.branchId, inventory.roomTypeId) }))
      .statusCode,
  ).toBe(401);
  expect(
    await fixture.connection.db
      .select()
      .from(hostelAuditLog)
      .where(eq(hostelAuditLog.targetId, inventory.roomTypeId)),
  ).toHaveLength(1);
});

it('ROOM-002 / AUD-001: forced real transaction rollback preserves room associations and audit together', async () => {
  const inventory = await fixture.inventory(),
    before = await read(inventory.branchId, inventory.roomTypeId);
  const actor = await fixture.service.authenticate(fixture.ownerToken),
    repository = new RoomAmenitiesRepository(fixture.connection.db, undefined, () => fixture.now);
  await expect(
    fixture.connection.db.transaction(async (transaction) => {
      await repository.save(
        transaction,
        actor,
        inventory.branchId,
        inventory.roomTypeId,
        before.version,
        { amenityCodes: [code] },
      );
      throw new Error('Forced room amenity rollback');
    }),
  ).rejects.toThrow('Forced room amenity rollback');
  expect(
    await fixture.connection.db
      .select()
      .from(roomTypeAmenities)
      .where(eq(roomTypeAmenities.roomTypeId, inventory.roomTypeId)),
  ).toEqual([]);
  expect(
    await fixture.connection.db
      .select()
      .from(hostelAuditLog)
      .where(eq(hostelAuditLog.targetId, inventory.roomTypeId)),
  ).toEqual([]);
});
it('ROOM-002: retired approved selections remain explicit and removable, but cannot be newly assigned', async () => {
  const inventory = await fixture.inventory(),
    other = await fixture.inventory(),
    before = await read(inventory.branchId, inventory.roomTypeId);
  expect(
    (await save(inventory.branchId, inventory.roomTypeId, before.version, [code])).statusCode,
  ).toBe(200);
  try {
    await fixture.connection.db
      .update(amenities)
      .set({ isActive: false })
      .where(eq(amenities.code, code));
    const retired = await read(inventory.branchId, inventory.roomTypeId);
    expect(retired.amenities).toEqual([{ code, name: 'Approved fixture Wi-Fi', isActive: false }]);
    expect(await publicSelection(inventory.branchId, inventory.roomTypeId)).toEqual([]);
    expect(
      (await save(inventory.branchId, inventory.roomTypeId, retired.version, [code])).statusCode,
    ).toBe(200);
    const empty = await read(other.branchId, other.roomTypeId);
    expect((await save(other.branchId, other.roomTypeId, empty.version, [code])).statusCode).toBe(
      400,
    );
    expect(
      (await save(inventory.branchId, inventory.roomTypeId, retired.version, [])).statusCode,
    ).toBe(200);
  } finally {
    await fixture.connection.db
      .update(amenities)
      .set({ isActive: true })
      .where(eq(amenities.code, code));
  }
});
it('ROOM-002 / AUD-001: concurrent changes from one saved version commit exactly one selected set and audit', async () => {
  const inventory = await fixture.inventory(),
    before = await read(inventory.branchId, inventory.roomTypeId),
    otherCode = 'fixture_' + randomUUID().replaceAll('-', '').slice(0, 12);
  await fixture.connection.db
    .insert(amenities)
    .values({ code: otherCode, name: 'Approved fixture heater', isActive: true });
  const results = await Promise.all([
    save(inventory.branchId, inventory.roomTypeId, before.version, [code]),
    save(inventory.branchId, inventory.roomTypeId, before.version, [otherCode]),
  ]);
  expect(results.map((result) => result.statusCode).sort()).toEqual([200, 412]);
  const winner = results.find((result) => result.statusCode === 200);
  if (!winner) throw new Error('Missing real committed selection');
  const selected = roomAmenitiesStateSchema.parse(winner.json());
  expect((await read(inventory.branchId, inventory.roomTypeId)).amenities).toEqual(
    selected.amenities,
  );
  expect(
    await fixture.connection.db
      .select()
      .from(hostelAuditLog)
      .where(eq(hostelAuditLog.targetId, inventory.roomTypeId)),
  ).toHaveLength(1);
});
