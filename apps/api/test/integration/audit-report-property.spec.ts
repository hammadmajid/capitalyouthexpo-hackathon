import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { buildings, hostelAuditLog, managerAssignments, managerInventoryGrants } from '@hsm/db';
import {
  propertyBuildingSchema,
  propertyBuildingPageSchema,
  propertyFloorSchema,
  propertyFloorPageSchema,
} from '@hsm/contracts';
import { AuditWriter } from '../../src/audit/writer.js';
import { lifecycleHarness } from './phase-nine-fixture.js';
import { reportPropertyFixture, reportRoomCommand } from './audit-report-property.fixture.js';

const h = lifecycleHarness();
let branchId: string;
beforeAll(async () => {
  await h.start();
  branchId = (await h.fixture().inventory()).branchId;
});
afterAll(() => h.close());
it('PROP / RPT-001 / AUD-010: an authorized Owner can create an actual named report building', async () => {
  const response = await h.send(`/v1/branches/${branchId}/property/buildings`, {
    name: 'Synthetic report building',
    sortOrder: 0,
  });
  expect(response.statusCode, response.body).toBe(201);
  expect(propertyBuildingSchema.parse(response.json())).toMatchObject({
    branchId,
    name: 'Synthetic report building',
    version: 1,
  });
});
it('ACC-004 / AUD-010: a lost create response replays one persisted building and one mandatory audit', async () => {
  const item = await h.fixture().inventory(),
    key = randomUUID();
  const url = `/v1/branches/${item.branchId}/property/buildings`,
    body = { name: 'Replay building', sortOrder: 0 };
  const first = await h.send(url, body, undefined, key),
    second = await h.send(url, body, undefined, key);
  expect(first.statusCode, first.body).toBe(201);
  expect(second.statusCode, second.body).toBe(201);
  expect(second.json()).toEqual(first.json());
  expect(second.headers['idempotency-replayed']).toBe('true');
  const created = propertyBuildingSchema.parse(first.json());
  const db = h.fixture().connection.db;
  expect(
    await db.select().from(buildings).where(eq(buildings.branchId, item.branchId)),
  ).toHaveLength(1);
  expect(
    await db
      .select()
      .from(hostelAuditLog)
      .where(
        and(
          eq(hostelAuditLog.targetId, created.id),
          eq(hostelAuditLog.action, 'property.building.created'),
        ),
      ),
  ).toHaveLength(1);
  expect((await h.send(url, { ...body, name: 'Changed payload' }, undefined, key)).statusCode).toBe(
    409,
  );
});
it('SEC-003 / AUD-010: foreign parent and room IDs never cross the authorized branch', async () => {
  const own = await reportPropertyFixture(h),
    foreign = await reportPropertyFixture(h);
  expect(
    (
      await h.send(own.base + '/floors', {
        buildingId: foreign.building.id,
        label: 'Wrong parent',
        levelNumber: 1,
      })
    ).statusCode,
  ).toBe(404);
  const body = { expectedVersion: 1, floorId: foreign.floor.id, reason: 'Foreign floor attempt' };
  expect((await reportRoomCommand(h, own, body)).statusCode).toBe(404);
  expect(
    (
      await reportRoomCommand(
        h,
        { base: own.base, roomId: foreign.roomId },
        {
          ...body,
          floorId: own.floor.id,
        },
      )
    ).statusCode,
  ).toBe(404);
  expect(await own.read()).toMatchObject({ floor: null, version: 1 });
});
it('ACC-004 / AUD-010: competing room metadata edits commit one version and one audit', async () => {
  const own = await reportPropertyFixture(h);
  const extra = propertyFloorSchema.parse(
    await h.ok(own.base + '/floors', {
      buildingId: own.building.id,
      label: 'First',
      levelNumber: 1,
    }),
  );
  const responses = await Promise.all(
    [own.floor.id, extra.id].map((floorId) =>
      reportRoomCommand(h, own, {
        expectedVersion: 1,
        floorId,
        reason: 'Explicit physical location',
      }),
    ),
  );
  expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 412]);
  const location = await own.read();
  expect(location.version).toBe(2);
  expect([own.floor.id, extra.id]).toContain(location.floor?.id);
  expect(
    await h
      .fixture()
      .connection.db.select()
      .from(hostelAuditLog)
      .where(
        and(
          eq(hostelAuditLog.targetId, own.roomId),
          eq(hostelAuditLog.action, 'property.room.location_changed'),
        ),
      ),
  ).toHaveLength(1);
});
it('PROP / ACC-004 / AUD-010: archival retains links and completed commands replay after the parent is archived', async () => {
  const own = await reportPropertyFixture(h),
    key = randomUUID();
  const creation = { buildingId: own.building.id, label: 'Replay floor', levelNumber: 2 };
  const first = await h.send(own.base + '/floors', creation, undefined, key);
  expect(first.statusCode, first.body).toBe(201);
  const linked = await reportRoomCommand(h, own, {
    expectedVersion: 1,
    floorId: own.floor.id,
    reason: 'Physical location',
  });
  expect(linked.statusCode, linked.body).toBe(200);
  const archived = propertyBuildingSchema.parse(
    await h.ok(own.base + '/buildings/' + own.building.id + '/archive', {
      expectedVersion: 1,
      reason: 'Archive metadata only',
    }),
  );
  expect(archived).toMatchObject({ version: 2 });
  expect(archived.archivedAt).not.toBeNull();
  expect((await own.read()).floor?.id).toBe(own.floor.id);
  const replayed = await h.send(own.base + '/floors', creation, undefined, key);
  expect(replayed.statusCode, replayed.body).toBe(201);
  expect(replayed.json()).toEqual(first.json());
  expect(
    (await h.send(own.base + '/floors', { ...creation, label: 'New under archive' })).statusCode,
  ).toBe(409);
});
it('SEC-003 / ACC-004 / AUD-010: Manager grants are live on both writes and idempotent replays', async () => {
  const f = h.fixture(),
    item = await f.inventory(),
    foreign = await f.inventory(),
    assignmentId = randomUUID();
  await f.connection.db.insert(managerAssignments).values({
    id: assignmentId,
    branchId: item.branchId,
    userId: f.customerB,
    appointedByUserId: f.ownerId,
    status: 'active',
    activatedAt: h.clock(),
  });
  const url = `/v1/branches/${item.branchId}/property/buildings`,
    key = randomUUID(),
    body = { name: 'Manager scoped building', sortOrder: 0 };
  expect((await h.send(url, body, f.customerBToken)).statusCode).toBe(403);
  await f.connection.db
    .insert(managerInventoryGrants)
    .values({ assignmentId, permission: 'inventory_edit', grantedAt: h.clock() });
  const success = await h.send(url, body, f.customerBToken, key);
  expect(success.statusCode, success.body).toBe(201);
  expect(
    (await h.send(`/v1/branches/${foreign.branchId}/property/buildings`, body, f.customerBToken))
      .statusCode,
  ).toBe(403);
  await f.connection.db
    .delete(managerInventoryGrants)
    .where(eq(managerInventoryGrants.assignmentId, assignmentId));
  expect((await h.send(url, body, f.customerBToken, key)).statusCode).toBe(403);
  const read = await h.get(url, f.customerBToken);
  expect(read.statusCode, read.body).toBe(200);
  expect(propertyBuildingPageSchema.parse(read.json()).canEdit).toBe(false);
  expect((await h.send(url, body, f.customerAToken)).statusCode).toBe(403);
  const guest = await f.application.inject({ url });
  expect(guest.statusCode).toBe(401);
});
it('ACC-006 / AUD-010: mandatory audit failure rolls back metadata and permits the original-key retry', async () => {
  const f = h.fixture(),
    item = await f.inventory(),
    key = randomUUID();
  const url = `/v1/branches/${item.branchId}/property/buildings`,
    body = { name: 'Atomic metadata write', sortOrder: 0 };
  const original = AuditWriter.prototype.hostel;
  const fault = vi.spyOn(AuditWriter.prototype, 'hostel').mockImplementation(async function (
    this: AuditWriter,
    tx,
    event,
  ) {
    if (event.action === 'property.building.created')
      throw new Error('Synthetic mandatory audit failure');
    return original.call(this, tx, event);
  });
  try {
    expect((await h.send(url, body, undefined, key)).statusCode).toBe(500);
  } finally {
    fault.mockRestore();
  }
  expect(
    await f.connection.db.select().from(buildings).where(eq(buildings.branchId, item.branchId)),
  ).toEqual([]);
  expect((await h.send(url, body, undefined, key)).statusCode).toBe(201);
  expect(
    await f.connection.db.select().from(buildings).where(eq(buildings.branchId, item.branchId)),
  ).toHaveLength(1);
});
it('PROP / RPT-001 / AUD-010: actual named pages retain scope, bounds, archive view and literal search', async () => {
  const own = await reportPropertyFixture(h);
  await h.ok(own.base + '/buildings', { name: 'Literal % marker', sortOrder: 0 });
  const first = await h.get(own.base + '/buildings?limit=1&view=all');
  expect(first.statusCode, first.body).toBe(200);
  const page = propertyBuildingPageSchema.parse(first.json());
  expect(page.data).toHaveLength(1);
  expect(page.nextCursor).not.toBeNull();
  const next = await h.get(own.base + '/buildings?limit=1&view=all&cursor=' + page.nextCursor);
  expect(next.statusCode, next.body).toBe(200);
  expect(propertyBuildingPageSchema.parse(next.json()).data[0]?.id).not.toBe(page.data[0]?.id);
  const searched = await h.get(own.base + '/buildings?search=' + encodeURIComponent('%'));
  expect(propertyBuildingPageSchema.parse(searched.json()).data.map((row) => row.name)).toEqual([
    'Literal % marker',
  ]);
  const floorResponse = await h.get(own.base + '/floors?buildingId=' + own.building.id);
  expect(floorResponse.statusCode, floorResponse.body).toBe(200);
  expect(propertyFloorPageSchema.parse(floorResponse.json()).data.map((row) => row.id)).toEqual([
    own.floor.id,
  ]);
  expect((await h.get(own.base + '/floors')).statusCode).toBe(400);
  expect((await h.get(own.base + '/buildings?limit=101')).statusCode).toBe(400);
  expect((await h.get(own.base + '/buildings?buildingId=' + own.building.id)).statusCode).toBe(400);
});
it('RPT-001 / AUD-010: inapplicable report parameters reject explicitly', async () => {
  const own = await reportPropertyFixture(h);
  for (const [type, filter] of [
    ['residents', 'status=paid'],
    ['payment-history', 'status=active'],
    ['bookings', 'residentId=' + randomUUID()],
  ]) {
    const response = await h.get(`/v1/branches/${own.branchId}/reports/${type}?${filter}`);
    expect(response.statusCode, response.body).toBe(400);
    expect(response.json()).toMatchObject({ code: 'VALIDATION_FAILED' });
  }
});
