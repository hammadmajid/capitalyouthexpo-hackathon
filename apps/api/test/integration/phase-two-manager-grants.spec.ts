import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { verifiedKey } from '@hsm/files';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq, ne } from 'drizzle-orm';
import {
  managerAssignments,
  managerInventoryGrants,
  hostelAuditLog,
  files,
  listingMedia,
} from '@hsm/db';
import { galleryMediaSchema, managerInventoryGrantStateSchema } from '@hsm/contracts';
import { phaseTwoFixture } from './phase-two-fixture.js';
let fixture: Awaited<ReturnType<typeof phaseTwoFixture>>;
beforeAll(async () => {
  fixture = await phaseTwoFixture(new Date('2026-10-16T10:00:00Z'));
});
afterAll(async () => {
  await fixture?.close();
});
const headers = (token = fixture.ownerToken) => ({ authorization: 'Bearer ' + token });
const url = (branchId: string, assignmentId: string) =>
  `/v1/branches/${branchId}/managers/${assignmentId}/inventory-permissions`;
async function prepare() {
  const inventory = await fixture.inventory(),
    assignmentId = randomUUID();
  // BR-04: one live assignment per Manager, so retire the previous scenario's fixture first.
  await fixture.connection.db
    .update(managerAssignments)
    .set({ status: 'deactivated', deactivatedAt: fixture.now })
    .where(
      and(
        eq(managerAssignments.userId, fixture.customerB),
        ne(managerAssignments.status, 'deactivated'),
      ),
    );
  await fixture.connection.db.insert(managerAssignments).values({
    id: assignmentId,
    userId: fixture.customerB,
    branchId: inventory.branchId,
    status: 'active',
    appointedByUserId: fixture.ownerId,
    activatedAt: fixture.now,
  });
  return { ...inventory, assignmentId };
}
it('ACC-004 / AUD-001: Owner reads empty grants, replaces actual grants and replays without duplicate audit', async () => {
  const { branchId, assignmentId } = await prepare(),
    endpoint = url(branchId, assignmentId);
  const first = await fixture.application.inject({ url: endpoint, headers: headers() });
  expect(first.statusCode).toBe(200);
  expect(first.headers['cache-control']).toBe('no-store');
  expect(managerInventoryGrantStateSchema.parse(first.json())).toEqual({
    branchId,
    assignmentId,
    permissions: [],
  });
  const command = {
    method: 'PUT' as const,
    url: endpoint,
    headers: { ...headers(), 'Idempotency-Key': randomUUID() },
    payload: { permissions: ['listing_edit', 'inventory_edit'] },
  };
  expect((await fixture.application.inject(command)).statusCode).toBe(200);
  const replay = await fixture.application.inject(command);
  expect(replay.statusCode).toBe(200);
  expect(replay.headers['idempotency-replayed']).toBe('true');
  const saved = await fixture.application.inject({ url: endpoint, headers: headers() });
  expect(managerInventoryGrantStateSchema.parse(saved.json()).permissions).toEqual([
    'inventory_edit',
    'listing_edit',
  ]);
  const audits = await fixture.connection.db
    .select()
    .from(hostelAuditLog)
    .where(
      and(
        eq(hostelAuditLog.targetId, assignmentId),
        eq(hostelAuditLog.action, 'manager.inventory_permissions.changed'),
      ),
    );
  expect(audits).toHaveLength(1);
  const revoke = await fixture.application.inject({
    ...command,
    headers: { ...headers(), 'Idempotency-Key': randomUUID() },
    payload: { permissions: [] },
  });
  expect(revoke.statusCode).toBe(200);
  expect(
    await fixture.connection.db
      .select()
      .from(managerInventoryGrants)
      .where(eq(managerInventoryGrants.assignmentId, assignmentId)),
  ).toHaveLength(0);
  const current = await fixture.application.inject({ url: endpoint, headers: headers() });
  expect(managerInventoryGrantStateSchema.parse(current.json()).permissions).toEqual([]);
});
it('ACC-004: assigned Manager cannot read or replace their own grants; cross-branch assignment cannot be addressed', async () => {
  const { branchId, assignmentId } = await prepare(),
    foreign = await fixture.inventory();
  const endpoint = url(branchId, assignmentId);
  expect(
    (await fixture.application.inject({ url: endpoint, headers: headers(fixture.customerBToken) }))
      .statusCode,
  ).toBe(403);
  expect(
    (
      await fixture.application.inject({
        method: 'PUT',
        url: endpoint,
        headers: { ...headers(fixture.customerBToken), 'Idempotency-Key': randomUUID() },
        payload: { permissions: ['listing_edit'] },
      })
    ).statusCode,
  ).toBe(403);
  expect(
    (
      await fixture.application.inject({
        url: url(foreign.branchId, assignmentId),
        headers: headers(),
      })
    ).statusCode,
  ).toBe(404);
  expect(
    (await fixture.application.inject({ url: url(branchId, randomUUID()), headers: headers() }))
      .statusCode,
  ).toBe(404);
  expect((await fixture.application.inject({ url: endpoint })).statusCode).toBe(401);
});

it('ACC-004 / AUD-001: real unpublication replay retains the original media requirement after the row becomes private', async () => {
  const { branchId, assignmentId } = await prepare(),
    fileId = randomUUID();
  await fixture.connection.db.insert(managerInventoryGrants).values([
    { assignmentId, permission: 'listing_edit', grantedAt: fixture.now },
    { assignmentId, permission: 'media_publish', grantedAt: fixture.now },
  ]);
  const bytes = await readFile(new URL('./fixtures/gallery.png', import.meta.url)),
    objectKey = verifiedKey('listing_photo', fileId);
  // Pre-scanned real object fixture; existing scanner acceptance remains blocking.
  await fixture.storage.storage.putVerified(objectKey, 'image/png', bytes);
  await fixture.connection.db.insert(files).values({
    id: fileId,
    uploadedBy: fixture.customerB,
    bucket: fixture.storage.bucket,
    visibility: 'private',
    objectKey,
    purpose: 'listing_photo',
    scanStatus: 'clean',
    mimeType: 'image/png',
    sizeBytes: BigInt(bytes.length),
    sha256: createHash('sha256').update(bytes).digest(),
  });
  const endpoint = '/v1/branches/' + branchId + '/gallery';
  const attached = await fixture.application.inject({
    method: 'POST',
    url: endpoint,
    headers: { ...headers(fixture.customerBToken), 'Idempotency-Key': randomUUID() },
    payload: { fileId, altText: 'Actual Manager photo', sortOrder: 0 },
  });
  expect(attached.statusCode).toBe(201);
  const draft = galleryMediaSchema.parse(attached.json());
  const published = await fixture.application.inject({
    method: 'PUT',
    url: endpoint + '/' + draft.id,
    headers: {
      ...headers(fixture.customerBToken),
      'Idempotency-Key': randomUUID(),
      'If-Match': '"' + draft.version + '"',
    },
    payload: { altText: draft.altText, sortOrder: 0, published: true },
  });
  expect(published.statusCode).toBe(200);
  const current = galleryMediaSchema.parse(published.json());
  expect(current.publishedAt).not.toBeNull();
  const request = {
    method: 'PUT' as const,
    url: endpoint + '/' + draft.id,
    headers: {
      ...headers(fixture.customerBToken),
      'Idempotency-Key': randomUUID(),
      'If-Match': '"' + current.version + '"',
    },
    payload: { altText: draft.altText, sortOrder: 0, published: false },
  };
  const unpublished = await fixture.application.inject(request);
  expect(unpublished.statusCode).toBe(200);
  expect(galleryMediaSchema.parse(unpublished.json()).publishedAt).toBeNull();
  await fixture.connection.db
    .delete(managerInventoryGrants)
    .where(
      and(
        eq(managerInventoryGrants.assignmentId, assignmentId),
        eq(managerInventoryGrants.permission, 'media_publish'),
      ),
    );
  expect((await fixture.application.inject(request)).statusCode).toBe(403);
  const [actual] = await fixture.connection.db
    .select()
    .from(listingMedia)
    .where(eq(listingMedia.id, draft.id));
  expect(actual?.publishedAt).toBeNull();
  const audit = await fixture.connection.db
    .select()
    .from(hostelAuditLog)
    .where(eq(hostelAuditLog.targetId, draft.id));
  expect(audit).toHaveLength(3);
  expect(
    audit.some(
      (entry) =>
        entry.before?.version === current.version &&
        entry.before.publishedAt === current.publishedAt,
    ),
  ).toBe(true);
  expect(
    (await fixture.application.inject({ url: '/v1/marketplace/media/' + draft.id })).statusCode,
  ).toBe(404);
});
