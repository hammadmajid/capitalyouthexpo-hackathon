import { readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import {
  files,
  listingMedia,
  hostelAuditLog,
  managerAssignments,
  managerInventoryGrants,
} from '@hsm/db';
import { galleryMediaSchema, galleryPageSchema } from '@hsm/contracts';
import { verifiedKey } from '@hsm/files';
import { GalleryRepository } from '../../src/inventory/gallery.repository.js';
import { phaseTwoFixture } from './phase-two-fixture.js';
let fixture: Awaited<ReturnType<typeof phaseTwoFixture>>;
let bytes: Buffer;
beforeAll(async () => {
  bytes = await readFile(new URL('./fixtures/gallery.png', import.meta.url));
  fixture = await phaseTwoFixture(new Date('2026-10-15T10:00:00Z'));
});
afterAll(async () => {
  await fixture?.close();
});

async function image(uploadedBy = fixture.ownerId, scanStatus: 'clean' | 'pending' = 'clean') {
  const id = randomUUID(),
    key = verifiedKey('listing_photo', id);
  // Pre-scanned immutable fixture; the existing real scanner suites still verify the upload/scan pipeline.
  await fixture.storage.storage.putVerified(key, 'image/png', bytes);
  await fixture.connection.db.insert(files).values({
    id,
    uploadedBy,
    bucket: fixture.storage.bucket,
    visibility: 'private',
    objectKey: key,
    mimeType: 'image/png',
    sizeBytes: BigInt(bytes.length),
    purpose: 'listing_photo',
    scanStatus,
    sha256: scanStatus === 'clean' ? createHash('sha256').update(bytes).digest() : null,
  });
  return { id, key };
}
const url = (branchId: string) => '/v1/branches/' + branchId + '/gallery';
const authorization = (token = fixture.ownerToken) => ({ authorization: 'Bearer ' + token });
function command(
  branchId: string,
  suffix: string,
  payload: Record<string, unknown>,
  version?: string,
  method: 'POST' | 'PUT' = 'POST',
  token = fixture.ownerToken,
  key = randomUUID(),
) {
  return fixture.application.inject({
    method,
    url: url(branchId) + suffix,
    payload,
    headers: {
      ...authorization(token),
      'Idempotency-Key': key,
      ...(version ? { 'If-Match': '"' + version + '"' } : {}),
    },
  });
}
async function attach(branchId: string, fileId: string, sortOrder = 0) {
  const response = await command(branchId, '', {
    fileId,
    altText: 'Actual fixture exterior',
    sortOrder,
  });
  expect(response.statusCode).toBe(201);
  expect(response.headers['cache-control']).toBe('no-store');
  return galleryMediaSchema.parse(response.json());
}
async function page(branchId: string, query = '') {
  const response = await fixture.application.inject({
    url: url(branchId) + query,
    headers: authorization(),
  });
  expect(response.statusCode).toBe(200);
  return galleryPageSchema.parse(response.json());
}
it('ROOM-003 / SEC-003 / AUD-001: real private attachment requires explicit publication and retained archival revokes public bytes', async () => {
  const inventory = await fixture.inventory({ photos: false }),
    file = await image(),
    draft = await attach(inventory.branchId, file.id);
  const publicUrl = '/v1/marketplace/media/' + draft.id;
  expect(draft.publishedAt).toBeNull();
  expect((await fixture.application.inject({ url: publicUrl })).statusCode).toBe(404);
  const publish = await command(
    inventory.branchId,
    '/' + draft.id,
    { altText: draft.altText, sortOrder: 0, published: true },
    draft.version,
    'PUT',
  );
  expect(publish.statusCode).toBe(200);
  const published = galleryMediaSchema.parse(publish.json());
  const publicImage = await fixture.application.inject({ url: publicUrl });
  expect(publicImage.statusCode).toBe(200);
  expect(publicImage.rawPayload).toEqual(bytes);
  expect(publish.body).not.toContain(file.key);
  expect(publish.body).not.toContain('X-Amz-Signature');
  const privateObject = await fetch(
    fixture.storage.env.S3_ENDPOINT + '/' + fixture.storage.bucket + '/' + file.key,
  );
  expect(privateObject.status).not.toBe(200);
  const unpublish = await command(
    inventory.branchId,
    '/' + draft.id,
    { altText: draft.altText, sortOrder: 0, published: false },
    published.version,
    'PUT',
  );
  expect(unpublish.statusCode).toBe(200);
  expect((await fixture.application.inject({ url: publicUrl })).statusCode).toBe(404);
  const current = galleryMediaSchema.parse(unpublish.json());
  const archived = await command(
    inventory.branchId,
    '/' + draft.id + '/archive',
    { reason: 'Replaced photo' },
    current.version,
  );
  expect(archived.statusCode).toBe(200);
  expect(galleryMediaSchema.parse(archived.json()).archivedAt).not.toBeNull();
  expect((await fixture.application.inject({ url: publicUrl })).statusCode).toBe(404);
  const [retained] = await fixture.connection.db
    .select()
    .from(listingMedia)
    .where(eq(listingMedia.id, draft.id));
  expect(retained?.archivedAt).not.toBeNull();
  const audit = await fixture.connection.db
    .select()
    .from(hostelAuditLog)
    .where(eq(hostelAuditLog.targetId, draft.id));
  expect(audit).toHaveLength(4);
});
it('ROOM-003 / ACC-001: real simultaneous same-version image edits persist one winner and reject the stale writer', async () => {
  const inventory = await fixture.inventory({ photos: false }),
    file = await image(),
    draft = await attach(inventory.branchId, file.id);
  const responses = await Promise.all(
    ['First edit', 'Second edit'].map((altText) =>
      command(
        inventory.branchId,
        '/' + draft.id,
        { altText, sortOrder: 0, published: false },
        draft.version,
        'PUT',
      ),
    ),
  );
  expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 412]);
  const winner = responses.find((response) => response.statusCode === 200);
  if (!winner) throw new Error('Missing winner');
  const saved = galleryMediaSchema.parse(winner.json()),
    [actual] = await fixture.connection.db
      .select()
      .from(listingMedia)
      .where(eq(listingMedia.id, draft.id));
  expect(actual?.altText).toBe(saved.altText);
  const audit = await fixture.connection.db
    .select()
    .from(hostelAuditLog)
    .where(eq(hostelAuditLog.targetId, draft.id));
  expect(audit).toHaveLength(2);
});
it('ACC-004 / SEC-003: real uploader scope, scan state, Manager grant and replay revocation are enforced', async () => {
  const inventory = await fixture.inventory({ photos: false }),
    foreign = await image(fixture.customerA),
    pending = await image(fixture.ownerId, 'pending');
  expect(
    (
      await command(inventory.branchId, '', {
        fileId: foreign.id,
        altText: 'Foreign',
        sortOrder: 0,
      })
    ).statusCode,
  ).toBe(404);
  expect(
    (
      await command(inventory.branchId, '', {
        fileId: pending.id,
        altText: 'Pending',
        sortOrder: 0,
      })
    ).statusCode,
  ).toBe(409);
  const assignmentId = randomUUID();
  await fixture.connection.db.insert(managerAssignments).values({
    id: assignmentId,
    userId: fixture.customerB,
    branchId: inventory.branchId,
    status: 'active',
    appointedByUserId: fixture.ownerId,
    activatedAt: fixture.now,
  });
  const managerPage = await fixture.application.inject({
    url: url(inventory.branchId),
    headers: authorization(fixture.customerBToken),
  });
  expect(managerPage.statusCode).toBe(200);
  expect(galleryPageSchema.parse(managerPage.json()).canEdit).toBe(false);
  const managerFile = await image(fixture.customerB),
    payload = { fileId: managerFile.id, altText: 'Manager photo', sortOrder: 0 },
    key = randomUUID();
  expect(
    (await command(inventory.branchId, '', payload, undefined, 'POST', fixture.customerBToken, key))
      .statusCode,
  ).toBe(403);
  await fixture.connection.db
    .insert(managerInventoryGrants)
    .values({ assignmentId, permission: 'listing_edit', grantedAt: fixture.now });
  expect(
    (await command(inventory.branchId, '', payload, undefined, 'POST', fixture.customerBToken, key))
      .statusCode,
  ).toBe(201);
  await fixture.connection.db
    .delete(managerInventoryGrants)
    .where(
      and(
        eq(managerInventoryGrants.assignmentId, assignmentId),
        eq(managerInventoryGrants.permission, 'listing_edit'),
      ),
    );
  expect(
    (await command(inventory.branchId, '', payload, undefined, 'POST', fixture.customerBToken, key))
      .statusCode,
  ).toBe(403);
  const other = await fixture.inventory({ photos: false });
  expect(
    (
      await fixture.application.inject({
        url: url(other.branchId),
        headers: authorization(fixture.customerBToken),
      })
    ).statusCode,
  ).toBe(403);
});
it('ROOM-003: real cover selection preserves drafts and gallery pagination/history uses actual cursors', async () => {
  const inventory = await fixture.inventory({ photos: false }),
    one = await image(),
    two = await image();
  const first = await attach(inventory.branchId, one.id, 4),
    second = await attach(inventory.branchId, two.id, 0);
  const cover = await command(inventory.branchId, '/' + first.id + '/cover', {}, first.version);
  expect(cover.statusCode).toBe(200);
  expect(galleryMediaSchema.parse(cover.json())).toMatchObject({ sortOrder: 0, publishedAt: null });
  const other = await fixture.connection.db
    .select()
    .from(listingMedia)
    .where(eq(listingMedia.id, second.id));
  expect(other[0]?.sortOrder).toBe(1);
  const initial = await page(inventory.branchId, '?limit=1');
  expect(initial.data).toHaveLength(1);
  expect(initial.nextCursor).not.toBeNull();
  const next = await page(inventory.branchId, '?limit=1&cursor=' + initial.nextCursor);
  expect(next.data).toHaveLength(1);
  expect(next.nextCursor).toBeNull();
  expect(new Set([...initial.data, ...next.data].map((entry) => entry.id)).size).toBe(2);
  const archived = await command(
    inventory.branchId,
    '/' + first.id + '/archive',
    { reason: 'Replace draft' },
    galleryMediaSchema.parse(cover.json()).version,
  );
  expect(archived.statusCode).toBe(200);
  expect((await page(inventory.branchId, '?state=archived')).data.map((entry) => entry.id)).toEqual(
    [first.id],
  );
});
it('AUD-001: forced real transaction failure rolls back image attachment and audit together', async () => {
  const inventory = await fixture.inventory({ photos: false }),
    file = await image(),
    actor = await fixture.service.authenticate(fixture.ownerToken),
    repository = new GalleryRepository(
      fixture.connection.db,
      fixture.storage.bucket,
      undefined,
      () => fixture.now,
    );
  await expect(
    fixture.connection.db.transaction(async (transaction) => {
      await repository.attach(transaction, actor, inventory.branchId, {
        fileId: file.id,
        altText: 'Rolled back',
        sortOrder: 0,
      });
      throw new Error('forced rollback');
    }),
  ).rejects.toThrow('forced rollback');
  expect(
    await fixture.connection.db
      .select()
      .from(listingMedia)
      .where(eq(listingMedia.branchId, inventory.branchId)),
  ).toEqual([]);
  expect(
    await fixture.connection.db
      .select()
      .from(hostelAuditLog)
      .where(eq(hostelAuditLog.branchId, inventory.branchId)),
  ).toEqual([]);
  expect(
    (await fixture.connection.db.select().from(files).where(eq(files.id, file.id)))[0]?.scanStatus,
  ).toBe('clean');
});
it('SEC-003: real scan revocation invalidates public bytes and enables explicit unpublication only', async () => {
  const inventory = await fixture.inventory({ photos: false }),
    file = await image(),
    draft = await attach(inventory.branchId, file.id);
  const publish = await command(
    inventory.branchId,
    '/' + draft.id,
    { altText: draft.altText, sortOrder: 0, published: true },
    draft.version,
    'PUT',
  );
  expect(publish.statusCode).toBe(200);
  await fixture.connection.db
    .update(files)
    .set({ scanStatus: 'rejected' })
    .where(eq(files.id, file.id));
  expect(
    (await fixture.application.inject({ url: '/v1/marketplace/media/' + draft.id })).statusCode,
  ).toBe(404);
  const current = (await page(inventory.branchId)).data[0];
  if (!current) throw new Error('Missing gallery image');
  expect(current.scanStatus).toBe('rejected');
  expect(
    (
      await command(
        inventory.branchId,
        '/' + draft.id,
        { altText: draft.altText, sortOrder: 0, published: true },
        current.version,
        'PUT',
      )
    ).statusCode,
  ).toBe(409);
  expect(
    (
      await command(
        inventory.branchId,
        '/' + draft.id,
        { altText: draft.altText, sortOrder: 0, published: false },
        current.version,
        'PUT',
      )
    ).statusCode,
  ).toBe(200);
});

it('ACC-004 / AUD-001: real media grant revocation denies publication replay and projects current capability', async () => {
  const inventory = await fixture.inventory({ photos: false }),
    assignmentId = randomUUID();
  await fixture.connection.db.insert(managerAssignments).values({
    id: assignmentId,
    userId: fixture.customerA,
    branchId: inventory.branchId,
    status: 'active',
    appointedByUserId: fixture.ownerId,
    activatedAt: fixture.now,
  });
  await fixture.connection.db.insert(managerInventoryGrants).values({
    assignmentId,
    permission: 'listing_edit',
    grantedAt: fixture.now,
  });
  const file = await image(fixture.customerA);
  const attached = await command(
    inventory.branchId,
    '',
    {
      fileId: file.id,
      altText: 'Manager draft',
      sortOrder: 0,
    },
    undefined,
    'POST',
    fixture.customerAToken,
  );
  expect(attached.statusCode).toBe(201);
  const draft = galleryMediaSchema.parse(attached.json()),
    key = randomUUID();
  const publish = () =>
    command(
      inventory.branchId,
      '/' + draft.id,
      {
        altText: draft.altText,
        sortOrder: 0,
        published: true,
      },
      draft.version,
      'PUT',
      fixture.customerAToken,
      key,
    );
  const capability = async () => {
    const response = await fixture.application.inject({
      url: url(inventory.branchId),
      headers: authorization(fixture.customerAToken),
    });
    expect(response.statusCode).toBe(200);
    return galleryPageSchema.parse(response.json());
  };
  expect(await capability()).toMatchObject({ canEdit: true, canPublish: false });
  expect((await publish()).statusCode).toBe(403);
  const [unpublished] = await fixture.connection.db
    .select()
    .from(listingMedia)
    .where(eq(listingMedia.id, draft.id));
  expect(unpublished?.publishedAt).toBeNull();
  await fixture.connection.db.insert(managerInventoryGrants).values({
    assignmentId,
    permission: 'media_publish',
    grantedAt: fixture.now,
  });
  expect(await capability()).toMatchObject({ canEdit: true, canPublish: true });
  expect((await publish()).statusCode).toBe(200);
  await fixture.connection.db
    .delete(managerInventoryGrants)
    .where(
      and(
        eq(managerInventoryGrants.assignmentId, assignmentId),
        eq(managerInventoryGrants.permission, 'media_publish'),
      ),
    );
  expect(await capability()).toMatchObject({ canEdit: true, canPublish: false });
  expect((await publish()).statusCode).toBe(403);
  const audit = await fixture.connection.db
    .select()
    .from(hostelAuditLog)
    .where(eq(hostelAuditLog.targetId, draft.id));
  expect(audit).toHaveLength(2);
});
