import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import {
  bookingHistory,
  inventoryClaims,
  bookingDocuments,
  bookingPolicies,
  bookings,
  files,
  managerAssignments,
  managerInventoryGrants,
} from '@hsm/db';
import {
  bookingQuoteSnapshotSchema,
  bookingSummarySchema,
  ownerBookingDocumentPageSchema,
  ownBookingDocumentSchema,
} from '@hsm/contracts';
import { verifiedKey } from '@hsm/files';
import { phaseTwoFixture, fixturePolicy, fixtureLimits } from './phase-two-fixture.js';
let fixture: Awaited<ReturnType<typeof phaseTwoFixture>>;
beforeAll(async () => {
  fixture = await phaseTwoFixture(new Date('2026-10-15T10:00:00Z'));
  await fixture.connection.db.transaction(async (database) => {
    await database
      .update(bookingPolicies)
      .set({ isCurrent: false })
      .where(eq(bookingPolicies.id, fixture.policyId));
    await database.insert(bookingPolicies).values({
      id: randomUUID(),
      policy: {
        ...fixturePolicy,
        requiredDocuments: ['student_id'],
        documentReviewRequired: true,
        allowEvidenceReuse: false,
      },
      platformLimits: fixtureLimits,
      isCurrent: true,
      createdByUserId: fixture.ownerId,
    });
  });
});
afterAll(async () => {
  await fixture?.close();
});
function headers(token: string, key = randomUUID()) {
  return { authorization: `Bearer ${token}`, 'Idempotency-Key': key };
}
async function evidence(scanStatus: 'clean' | 'pending' = 'clean', uploadedBy?: string) {
  const id = randomUUID(),
    bytes = Buffer.from('Private student ID test fixture');
  const key = verifiedKey('resident_document', id);
  // Explicit pre-scanned fixture. Actual scanner/byte validation suites remain unchanged.
  await fixture.storage.storage.putVerified(key, 'application/pdf', bytes);
  await fixture.connection.db.insert(files).values({
    id,
    uploadedBy: uploadedBy ?? fixture.customerA,
    bucket: fixture.storage.bucket,
    visibility: 'private',
    objectKey: key,
    purpose: 'resident_document',
    scanStatus,
    mimeType: 'application/pdf',
    sizeBytes: BigInt(bytes.length),
    sha256: createHash('sha256').update(bytes).digest(),
  });
  return id;
}
async function submit(branchId: string, fileId: string, token = fixture.customerAToken) {
  return fixture.application.inject({
    method: 'POST',
    url: `/v1/me/booking-documents/${branchId}`,
    headers: headers(token),
    payload: { kind: 'student_id', fileId, shareWithOwner: true },
  });
}
async function quote(
  inventory: Awaited<ReturnType<typeof fixture.inventory>>,
  bedId = inventory.seatId,
) {
  const response = await fixture.application.inject({
    method: 'POST',
    url: `/v1/marketplace/${inventory.branchId}/quote`,
    payload: {
      target: { kind: 'bed', roomId: inventory.roomId, bedId },
      range: { moveInDate: '2026-11-01', moveOutDate: '2026-11-03' },
    },
  });
  expect(response.statusCode).toBe(200);
  return bookingQuoteSnapshotSchema.parse(response.json());
}
it('CHG-008 / BKG-001 / ACC-001: real Owner review becomes an atomic one-use booking snapshot', async () => {
  const inventory = await fixture.inventory(),
    fileId = await evidence();
  const submitted = await submit(inventory.branchId, fileId);
  expect(submitted.statusCode).toBe(201);
  const document = ownBookingDocumentSchema.parse(submitted.json());
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
  const queueUrl = `/v1/branches/${inventory.branchId}/booking-documents`;
  for (const token of [fixture.customerAToken, fixture.customerBToken]) {
    expect(
      (await fixture.application.inject({ url: queueUrl, headers: headers(token) })).statusCode,
    ).toBe(403);
    const denied = await fixture.application.inject({
      method: 'POST',
      url: `${queueUrl}/${document.id}/review`,
      headers: headers(token),
      payload: { state: 'accepted' },
    });
    expect(denied.statusCode).toBe(403);
  }
  const queued = await fixture.application.inject({
    url: queueUrl,
    headers: headers(fixture.ownerToken),
  });
  expect(queued.statusCode).toBe(200);
  expect(ownerBookingDocumentPageSchema.parse(queued.json()).data.map((row) => row.id)).toContain(
    document.id,
  );
  expect(queued.body).not.toContain(fileId);
  expect(queued.body).not.toContain(fixture.customerA);
  const reviewKey = randomUUID(),
    reviewRequest = {
      method: 'POST' as const,
      url: `${queueUrl}/${document.id}/review`,
      headers: headers(fixture.ownerToken, reviewKey),
      payload: { state: 'accepted' },
    };
  expect((await fixture.application.inject(reviewRequest)).statusCode).toBe(200);
  expect((await fixture.application.inject(reviewRequest)).headers['idempotency-replayed']).toBe(
    'true',
  );
  const firstQuote = await quote(inventory),
    secondQuote = await quote(inventory, inventory.otherSeatId);
  const key = randomUUID(),
    request = {
      method: 'POST' as const,
      url: `/v1/marketplace/${inventory.branchId}/bookings`,
      headers: headers(fixture.customerAToken, key),
      payload: { quote: firstQuote, documents: [{ kind: 'student_id', fileId }] },
    };
  const created = await fixture.application.inject(request);
  expect(created.statusCode).toBe(201);
  const booking = bookingSummarySchema.parse(created.json());
  expect(booking.state).toBe('confirmed');
  expect(booking.documents).toEqual([{ kind: 'student_id', state: 'accepted' }]);
  expect((await fixture.application.inject(request)).headers['idempotency-replayed']).toBe('true');
  const [source] = await fixture.connection.db
    .select()
    .from(bookingDocuments)
    .where(eq(bookingDocuments.id, document.id));
  expect(source?.consumedAt).toEqual(fixture.now);
  const second = await fixture.application.inject({
    ...request,
    headers: headers(fixture.customerAToken),
    payload: { quote: secondQuote, documents: [{ kind: 'student_id', fileId }] },
  });
  expect(second.statusCode).toBe(409);
  const stored = await fixture.connection.db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.customerUserId, fixture.customerA),
        eq(bookings.branchId, inventory.branchId),
      ),
    );
  expect(stored).toHaveLength(1);
  const oldSourceDownload = await fixture.application.inject({
    url: `${queueUrl}/${document.id}/download`,
    headers: headers(fixture.ownerToken),
  });
  expect(oldSourceDownload.statusCode).toBe(404);
  await verifyCustomerCancellation(booking.id);
});
it('SEC-003 / CHG-008: foreign files, unscanned files, missing consent and cross-customer history fail closed', async () => {
  const inventory = await fixture.inventory(),
    foreign = await evidence('clean', fixture.customerB);
  expect((await submit(inventory.branchId, foreign)).statusCode).toBe(404);
  const unscanned = await evidence('pending');
  expect((await submit(inventory.branchId, unscanned)).statusCode).toBe(409);
  const clean = await evidence(),
    own = await submit(inventory.branchId, clean);
  expect(own.statusCode).toBe(201);
  const document = ownBookingDocumentSchema.parse(own.json());
  const other = await fixture.application.inject({
    url: `/v1/me/booking-documents/${inventory.branchId}`,
    headers: headers(fixture.customerBToken),
  });
  expect(other.statusCode).toBe(200);
  expect(other.body).not.toContain(document.id);
  expect(other.body).not.toContain(clean);
  const denied = await fixture.application.inject({
    method: 'POST',
    url: `/v1/me/booking-documents/${inventory.branchId}`,
    headers: headers(fixture.customerAToken),
    payload: { kind: 'student_id', fileId: clean },
  });
  expect(denied.statusCode).toBe(400);
  expect(denied.json()).toHaveProperty('code', 'VALIDATION_FAILED');
});
it('BKG-001: rejected evidence cannot confirm an instant booking or overwrite its final review', async () => {
  const inventory = await fixture.inventory(),
    fileId = await evidence();
  const document = ownBookingDocumentSchema.parse(
    (await submit(inventory.branchId, fileId)).json(),
  );
  const url = `/v1/branches/${inventory.branchId}/booking-documents/${document.id}/review`;
  expect(
    (
      await fixture.application.inject({
        method: 'POST',
        url,
        headers: headers(fixture.ownerToken),
        payload: { state: 'rejected', rejectionCode: 'unreadable' },
      })
    ).statusCode,
  ).toBe(200);
  expect(
    (
      await fixture.application.inject({
        method: 'POST',
        url,
        headers: headers(fixture.ownerToken),
        payload: { state: 'accepted' },
      })
    ).statusCode,
  ).toBe(409);
  const denied = await fixture.application.inject({
    method: 'POST',
    url: `/v1/marketplace/${inventory.branchId}/bookings`,
    headers: headers(fixture.customerAToken),
    payload: { quote: await quote(inventory), documents: [{ kind: 'student_id', fileId }] },
  });
  expect(denied.statusCode).toBe(409);
  const rows = await fixture.connection.db
    .select()
    .from(bookings)
    .where(eq(bookings.branchId, inventory.branchId));
  expect(rows).toHaveLength(0);
});

it('BKG-001 / SEC-003: real own and branch booking history is bounded, scoped and non-cacheable', async () => {
  const inventory = await fixture.inventory();
  for (const request of [
    { url: '/v1/me/bookings?limit=1', headers: headers(fixture.customerAToken) },
    {
      url: `/v1/branches/${inventory.branchId}/bookings?limit=1`,
      headers: headers(fixture.ownerToken),
    },
  ]) {
    const response = await fixture.application.inject(request);
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).not.toContain('fileId');
    expect(response.body).not.toContain('customerUserId');
  }
  const invalid = await fixture.application.inject({
    url: '/v1/me/bookings?limit=101',
    headers: headers(fixture.customerAToken),
  });
  expect(invalid.statusCode).toBe(400);
  expect(invalid.json()).toHaveProperty('code', 'VALIDATION_FAILED');
});

async function verifyCustomerCancellation(bookingId: string) {
  const request = {
    method: 'POST' as const,
    url: `/v1/me/bookings/${bookingId}/cancel`,
    headers: headers(fixture.customerAToken),
    payload: { reason: 'Plans changed' },
  };
  const denied = await fixture.application.inject({
    ...request,
    headers: headers(fixture.customerBToken),
  });
  expect(denied.statusCode).toBe(404);
  const first = await fixture.application.inject(request);
  expect(first.statusCode).toBe(200);
  expect(bookingSummarySchema.parse(first.json()).state).toBe('cancelled');
  const replay = await fixture.application.inject(request);
  expect(replay.statusCode).toBe(200);
  expect(replay.headers['idempotency-replayed']).toBe('true');
  expect(replay.json()).toEqual(first.json());
  const history = await fixture.connection.db
    .select()
    .from(bookingHistory)
    .where(eq(bookingHistory.bookingId, bookingId));
  expect(history.filter((row) => row.nextState === 'cancelled')).toHaveLength(1);
  const claims = await fixture.connection.db
    .select()
    .from(inventoryClaims)
    .where(eq(inventoryClaims.bookingId, bookingId));
  expect(claims.length).toBeGreaterThan(0);
  expect(claims.every((row) => row.releasedAt !== null)).toBe(true);
}
