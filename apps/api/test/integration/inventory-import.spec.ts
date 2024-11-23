import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import {
  files,
  hostelAuditLog,
  inventoryImportRuns,
  managerAssignments,
  managerInventoryGrants,
  rooms,
  seats,
} from '@hsm/db';
import { inventoryImportIdentitySchema } from '@hsm/contracts';
import { AuditWriter } from '../../src/audit/writer.js';
import { phaseTwoFixture } from './phase-two-fixture.js';
import {
  csvFile,
  command,
  preview,
  validate,
  type ImportFixture,
} from './inventory-import.fixture.js';
let f: ImportFixture;
beforeAll(async () => {
  f = await phaseTwoFixture(new Date('2026-10-25T10:00:00Z'));
});
afterAll(async () => {
  await f?.close();
});
it('PROP-001 / AUD-001: validate creates no inventory; commit, replay and digest deduplication are atomic', async () => {
  const item = await f.inventory(),
    text = `room_type_id,room_number\r\n${item.roomTypeId},201\r\n${item.roomTypeId},202\r\n`,
    fileId = await csvFile(f, text),
    run = await validate(f, item.branchId, fileId);
  expect(
    await f.connection.db.select().from(rooms).where(eq(rooms.branchId, item.branchId)),
  ).toHaveLength(1);
  expect(await preview(f, item.branchId, run.identity.id, '?limit=1')).toMatchObject({
    status: 'validated',
    totalRows: 2,
    errorRows: 0,
    nextOffset: 1,
    rows: [{ recordNumber: 2, roomNumber: '201', errors: [] }],
  });
  const request = command(f, item.branchId, '/' + run.identity.id + '/commit', {}),
    response = await f.application.inject(request);
  expect(response.statusCode).toBe(200);
  expect(inventoryImportIdentitySchema.parse(response.json())).toEqual(run.identity);
  expect((await f.application.inject(request)).headers['idempotency-replayed']).toBe('true');
  expect((await f.application.inject(run.request)).headers['idempotency-replayed']).toBe('true');
  expect(await preview(f, item.branchId, run.identity.id)).toMatchObject({
    status: 'committed',
    committedAt: f.now.toISOString(),
  });
  const copied = await f.connection.db
    .select()
    .from(rooms)
    .where(eq(rooms.branchId, item.branchId));
  expect(copied).toHaveLength(3);
  for (const room of copied.filter((room) => room.id !== item.roomId)) {
    expect(room.status).toBe('inactive');
    expect(
      (
        await f.connection.db
          .select()
          .from(seats)
          .where(eq(seats.roomId, room.id))
          .orderBy(seats.ordinal)
      ).map((bed) => [bed.ordinal, bed.status]),
    ).toEqual([
      [1, 'inactive'],
      [2, 'inactive'],
    ]);
  }
  expect(
    (
      await f.application.inject(command(f, item.branchId, '/' + run.identity.id + '/commit', {}))
    ).json(),
  ).toHaveProperty('code', 'IMPORT_ALREADY_COMMITTED');
  const anotherFile = await csvFile(f, text);
  expect(
    (
      await f.application.inject(
        command(f, item.branchId, '', { kind: 'rooms', fileId: anotherFile }),
      )
    ).json(),
  ).toHaveProperty('code', 'IMPORT_ALREADY_COMMITTED');
  const audit = await f.connection.db
    .select()
    .from(hostelAuditLog)
    .where(
      and(
        eq(hostelAuditLog.targetId, run.identity.id),
        eq(hostelAuditLog.action, 'inventory.import.commit'),
      ),
    );
  expect(audit).toHaveLength(1);
  expect(audit[0]?.after).toMatchObject({
    created: copied.filter((room) => room.id !== item.roomId).map((room) => ({ roomId: room.id })),
  });
});
it('PROP-001: per-record errors, collisions and foreign types cannot partially create inventory', async () => {
  const item = await f.inventory(),
    foreign = await f.inventory(),
    fileId = await csvFile(
      f,
      `room_type_id,room_number\n${item.roomTypeId},201\n${foreign.roomTypeId},202\n${item.roomTypeId},101\n${item.roomTypeId},201\ninvalid,203`,
    ),
    run = await validate(f, item.branchId, fileId),
    result = await preview(f, item.branchId, run.identity.id);
  expect(result.status).toBe('failed');
  expect(result.errorRows).toBe(4);
  expect(result.rows.map((row) => row.errors)).toEqual([
    [],
    ['ROOM_TYPE_UNAVAILABLE'],
    ['ROOM_NUMBER_EXISTS'],
    ['DUPLICATE_ROW'],
    ['INVALID_VALUE'],
  ]);
  expect(
    (await f.application.inject(command(f, item.branchId, '/' + run.identity.id + '/commit', {})))
      .statusCode,
  ).toBe(409);
  expect(
    await f.connection.db.select().from(rooms).where(eq(rooms.branchId, item.branchId)),
  ).toHaveLength(1);
});
it('PROP-001 / ROOM-002: beds determine room size, retain unique labels and permanent archived ordinals', async () => {
  const item = await f.inventory(),
    fileId = await csvFile(f, 'room_number,bed_label\n101,A\n101,C');
  const full = await validate(f, item.branchId, fileId, 'seats');
  expect((await preview(f, item.branchId, full.identity.id)).rows[0]?.errors).toEqual([
    'BED_LABEL_EXISTS',
  ]);
  await f.connection.db
    .update(seats)
    .set({ archivedAt: f.now })
    .where(eq(seats.id, item.otherSeatId));
  const fresh = await validate(
    f,
    item.branchId,
    await csvFile(f, 'room_number,bed_label\n101,C'),
    'seats',
  );
  expect(
    (await f.application.inject(command(f, item.branchId, '/' + fresh.identity.id + '/commit', {})))
      .statusCode,
  ).toBe(200);
  const [bed] = await f.connection.db
    .select()
    .from(seats)
    .where(and(eq(seats.roomId, item.roomId), eq(seats.label, 'C')));
  expect(bed).toMatchObject({ ordinal: 3, status: 'inactive' });
});
it('PROP-001: concurrent overlapping imports revalidate under real locks and create one complete batch', async () => {
  const item = await f.inventory(),
    assignmentId = randomUUID();
  await f.connection.db.insert(managerAssignments).values({
    id: assignmentId,
    userId: f.customerA,
    branchId: item.branchId,
    status: 'active',
    appointedByUserId: f.ownerId,
    activatedAt: f.now,
  });
  await f.connection.db
    .insert(managerInventoryGrants)
    .values({ assignmentId, permission: 'inventory_edit', grantedAt: f.now });
  const left = await validate(
      f,
      item.branchId,
      await csvFile(f, `room_type_id,room_number\n${item.roomTypeId},201\n${item.roomTypeId},202`),
    ),
    fileId = await csvFile(
      f,
      `room_type_id,room_number\n${item.roomTypeId},202\n${item.roomTypeId},203`,
      f.customerA,
    ),
    rightResponse = await f.application.inject(
      command(f, item.branchId, '', { kind: 'rooms', fileId }, randomUUID(), f.customerAToken),
    );
  expect(rightResponse.statusCode).toBe(201);
  const right = inventoryImportIdentitySchema.parse(rightResponse.json());
  const results = await Promise.all([
    f.application.inject(command(f, item.branchId, '/' + left.identity.id + '/commit', {})),
    f.application.inject(
      command(f, item.branchId, '/' + right.id + '/commit', {}, randomUUID(), f.customerAToken),
    ),
  ]);
  expect(results.map((result) => result.statusCode).sort()).toEqual([200, 409]);
  expect(
    await f.connection.db.select().from(rooms).where(eq(rooms.branchId, item.branchId)),
  ).toHaveLength(3);
});
it('ACC-004 / MGR-004: scope/grant revocation denies preview, commit, template and old validation replay', async () => {
  const item = await f.inventory(),
    foreign = await f.inventory(),
    assignmentId = randomUUID();
  await f.connection.db.insert(managerAssignments).values({
    id: assignmentId,
    userId: f.customerB,
    branchId: item.branchId,
    status: 'active',
    appointedByUserId: f.ownerId,
    activatedAt: f.now,
  });
  await f.connection.db
    .insert(managerInventoryGrants)
    .values({ assignmentId, permission: 'inventory_edit', grantedAt: f.now });
  const fileId = await csvFile(f, `room_type_id,room_number\n${item.roomTypeId},201`, f.customerB),
    request = command(
      f,
      item.branchId,
      '',
      { kind: 'rooms', fileId },
      randomUUID(),
      f.customerBToken,
    ),
    response = await f.application.inject(request);
  expect(response.statusCode).toBe(201);
  const run = inventoryImportIdentitySchema.parse(response.json());
  expect(
    (
      await f.application.inject(
        command(f, foreign.branchId, '', { kind: 'rooms', fileId }, randomUUID(), f.customerBToken),
      )
    ).statusCode,
  ).toBe(403);
  await f.connection.db
    .delete(managerInventoryGrants)
    .where(eq(managerInventoryGrants.assignmentId, assignmentId));
  expect((await f.application.inject(request)).statusCode).toBe(403);
  expect(
    (
      await f.application.inject(
        command(f, item.branchId, '/' + run.id + '/commit', {}, randomUUID(), f.customerBToken),
      )
    ).statusCode,
  ).toBe(403);
  for (const suffix of ['/' + run.id, '/templates/rooms'])
    expect(
      (
        await f.application.inject({
          url: `/v1/branches/${item.branchId}/inventory/imports${suffix}`,
          headers: { authorization: 'Bearer ' + f.customerBToken },
        })
      ).statusCode,
    ).toBe(403);
});
it('AUD-001 / PROP-001: failed audit rolls back inventory, status and idempotency together', async () => {
  const item = await f.inventory(),
    run = await validate(
      f,
      item.branchId,
      await csvFile(f, `room_type_id,room_number\n${item.roomTypeId},301`),
    ),
    request = command(f, item.branchId, '/' + run.identity.id + '/commit', {}),
    audit = vi
      .spyOn(AuditWriter.prototype, 'hostel')
      .mockRejectedValueOnce(new Error('Fixture audit failure'));
  try {
    expect((await f.application.inject(request)).statusCode).toBe(500);
  } finally {
    audit.mockRestore();
  }
  expect(
    await f.connection.db.select().from(rooms).where(eq(rooms.branchId, item.branchId)),
  ).toHaveLength(1);
  expect((await preview(f, item.branchId, run.identity.id)).status).toBe('validated');
  expect((await f.application.inject(request)).statusCode).toBe(200);
});
it('SEC-003: wrong uploader, pending scan, changed content and later scan rejection cannot import', async () => {
  const item = await f.inventory(),
    text = `room_type_id,room_number\n${item.roomTypeId},401`;
  for (const fileId of [
    await csvFile(f, text, f.customerA),
    await csvFile(f, text, f.ownerId, false),
  ])
    expect(
      (await f.application.inject(command(f, item.branchId, '', { kind: 'rooms', fileId })))
        .statusCode,
    ).toBe(404);
  const clean = await csvFile(f, text),
    run = await validate(f, item.branchId, clean);
  await f.connection.db.update(files).set({ scanStatus: 'rejected' }).where(eq(files.id, clean));
  expect(
    (await f.application.inject(command(f, item.branchId, '/' + run.identity.id + '/commit', {})))
      .statusCode,
  ).toBe(404);
  const [file] = await f.connection.db
    .select()
    .from(files)
    .where(eq(files.id, await csvFile(f, text)));
  if (!file) throw new Error('Missing source file');
  await f.storage.storage.putVerified(file.objectKey, 'text/csv', Buffer.from(text + 'changed'));
  expect(
    (await f.application.inject(command(f, item.branchId, '', { kind: 'rooms', fileId: file.id })))
      .statusCode,
  ).toBe(409);
});
it('PROP-001 / AUD-001: SQL guards preserve validation source, file digest and terminal history', async () => {
  const item = await f.inventory(),
    fileId = await csvFile(f, `room_type_id,room_number\n${item.roomTypeId},501`),
    run = await validate(f, item.branchId, fileId);
  await expect(
    f.connection.db
      .update(inventoryImportRuns)
      .set({ rows: [] })
      .where(eq(inventoryImportRuns.id, run.identity.id)),
  ).rejects.toThrow();
  await expect(
    f.connection.db.delete(inventoryImportRuns).where(eq(inventoryImportRuns.id, run.identity.id)),
  ).rejects.toThrow();
  await expect(
    f.connection.db.update(files).set({ purpose: 'chat_attachment' }).where(eq(files.id, fileId)),
  ).rejects.toThrow();
  await expect(f.connection.db.execute(sql`truncate inventory_import_runs`)).rejects.toThrow();
  expect(
    (await f.application.inject(command(f, item.branchId, '/' + run.identity.id + '/commit', {})))
      .statusCode,
  ).toBe(200);
  await expect(
    f.connection.db
      .update(inventoryImportRuns)
      .set({ status: 'validated', committedAt: null })
      .where(eq(inventoryImportRuns.id, run.identity.id)),
  ).rejects.toThrow();
});
