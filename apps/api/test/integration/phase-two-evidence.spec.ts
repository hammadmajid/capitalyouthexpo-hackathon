import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import {
  bookingDocuments,
  files,
  managerAssignments,
  managerInventoryGrants,
  sensitiveAccessLog,
} from '@hsm/db';
import { downloadResponseSchema } from '@hsm/contracts';
import { verifiedKey } from '@hsm/files';
import { phaseTwoFixture } from './phase-two-fixture.js';
let fixture: Awaited<ReturnType<typeof phaseTwoFixture>>;
beforeAll(async () => {
  fixture = await phaseTwoFixture(new Date('2026-10-15T10:00:00Z'));
});
afterAll(async () => {
  await fixture?.close();
});
it('CHG-008 / SEC-003 / ACC-004: real Owner read is audited; assigned Manager with review grant cannot download', async () => {
  const inventory = await fixture.inventory(),
    fileId = randomUUID(),
    documentId = randomUUID();
  const key = verifiedKey('resident_document', fileId),
    bytes = Buffer.from('Private evidence fixture');
  // Pre-scanned fixture state; scanner validation remains covered by existing container suites.
  await fixture.storage.storage.putVerified(key, 'application/pdf', bytes);
  await fixture.connection.db.insert(files).values({
    id: fileId,
    uploadedBy: fixture.customerA,
    bucket: fixture.storage.bucket,
    visibility: 'private',
    objectKey: key,
    mimeType: 'application/pdf',
    sizeBytes: BigInt(bytes.length),
    purpose: 'resident_document',
    scanStatus: 'clean',
    sha256: createHash('sha256').update(bytes).digest(),
  });
  await fixture.connection.db.insert(bookingDocuments).values({
    id: documentId,
    branchId: inventory.branchId,
    customerUserId: fixture.customerA,
    kind: 'student_id',
    fileId,
    state: 'pending',
  });
  const assignmentId = randomUUID();
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
    .values({ assignmentId, permission: 'document_review', grantedAt: fixture.now });
  const url = `/v1/branches/${inventory.branchId}/booking-documents/${documentId}/download`;
  for (const token of [fixture.customerAToken, fixture.customerBToken]) {
    const denied = await fixture.application.inject({
      url,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.body).not.toContain(key);
    expect(denied.body).not.toContain('X-Amz-Signature');
  }
  const response = await fixture.application.inject({
    url,
    headers: { authorization: `Bearer ${fixture.ownerToken}` },
  });
  expect(response.statusCode).toBe(200);
  expect(response.headers['cache-control']).toBe('no-store');
  const download = downloadResponseSchema.parse(response.json());
  const object = await fetch(download.url);
  expect(object.status).toBe(200);
  expect(Buffer.from(await object.arrayBuffer())).toEqual(bytes);
  const audit = await fixture.connection.db
    .select()
    .from(sensitiveAccessLog)
    .where(
      and(
        eq(sensitiveAccessLog.resourceId, fileId),
        eq(sensitiveAccessLog.actorUserId, fixture.ownerId),
      ),
    );
  expect(audit).toHaveLength(1);
  expect(audit[0]?.subjectUserId).toBe(fixture.customerA);
  const anonymousObject = await fetch(download.url.split('?')[0] ?? '');
  expect(anonymousObject.status).toBe(403);
});
