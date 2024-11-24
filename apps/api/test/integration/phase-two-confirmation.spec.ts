import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { bookingDocuments, bookingPolicies, bookings, files, roomTypes, users } from '@hsm/db';
import { bookingQuoteSnapshotSchema, bookingSummarySchema } from '@hsm/contracts';
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
        bookingMode: 'request',
        requiredDocuments: ['student_id'],
        documentReviewRequired: true,
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
function headers(token: string) {
  return { authorization: `Bearer ${token}`, 'Idempotency-Key': randomUUID() };
}
async function prepare() {
  const inventory = await fixture.inventory();
  const fileId = randomUUID(),
    bytes = Buffer.from('Private confirmation document fixture');
  const objectKey = verifiedKey('resident_document', fileId);
  // Explicit clean fixture; full upload/scanner integration suites remain blocking.
  await fixture.storage.storage.putVerified(objectKey, 'application/pdf', bytes);
  await fixture.connection.db.insert(files).values({
    id: fileId,
    uploadedBy: fixture.customerA,
    bucket: fixture.storage.bucket,
    visibility: 'private',
    objectKey,
    purpose: 'resident_document',
    scanStatus: 'clean',
    mimeType: 'application/pdf',
    sizeBytes: BigInt(bytes.length),
    sha256: createHash('sha256').update(bytes).digest(),
  });
  const quoted = await fixture.application.inject({
    method: 'POST',
    url: `/v1/marketplace/${inventory.branchId}/quote`,
    payload: {
      target: { kind: 'bed', roomId: inventory.roomId, bedId: inventory.seatId },
      range: { moveInDate: '2026-11-01', moveOutDate: '2026-11-03' },
    },
  });
  expect(quoted.statusCode).toBe(200);
  const quote = bookingQuoteSnapshotSchema.parse(quoted.json());
  const created = await fixture.application.inject({
    method: 'POST',
    url: `/v1/marketplace/${inventory.branchId}/bookings`,
    headers: headers(fixture.customerAToken),
    payload: { quote, documents: [{ kind: 'student_id', fileId }] },
  });
  expect(created.statusCode).toBe(201);
  const booking = bookingSummarySchema.parse(created.json());
  expect(booking.state).toBe('pending_request');
  const [document] = await fixture.connection.db
    .select()
    .from(bookingDocuments)
    .where(and(eq(bookingDocuments.bookingId, booking.id), eq(bookingDocuments.fileId, fileId)));
  expect(document).toBeDefined();
  if (!document) throw new Error('Booking evidence missing');
  const reviewed = await fixture.application.inject({
    method: 'POST',
    url: `/v1/branches/${inventory.branchId}/booking-documents/${document.id}/review`,
    headers: headers(fixture.ownerToken),
    payload: { state: 'accepted' },
  });
  expect(reviewed.statusCode).toBe(200);
  const confirm = () =>
    fixture.application.inject({
      method: 'POST',
      url: `/v1/branches/${inventory.branchId}/bookings/${booking.id}/confirm`,
      headers: headers(fixture.ownerToken),
      payload: { reason: 'Requirements verified' },
    });
  return { inventory, booking, fileId, confirm };
}
async function expectPending(id: string) {
  const [row] = await fixture.connection.db.select().from(bookings).where(eq(bookings.id, id));
  expect(row?.state).toBe('pending_request');
}
it('BKG-001 / SRS p21: incompatible current Customer cannot be confirmed; restoring eligibility succeeds', async () => {
  const value = await prepare();
  await fixture.connection.db
    .update(users)
    .set({ gender: 'female' })
    .where(eq(users.id, fixture.customerA));
  try {
    expect((await value.confirm()).statusCode).toBe(403);
    await expectPending(value.booking.id);
  } finally {
    await fixture.connection.db
      .update(users)
      .set({ gender: 'male' })
      .where(eq(users.id, fixture.customerA));
  }
  const accepted = await value.confirm();
  expect(accepted.statusCode).toBe(200);
  expect(bookingSummarySchema.parse(accepted.json()).state).toBe('confirmed');
});
it('BKG-001 / SEC-003: Owner acceptance cannot override a subsequently rejected scan', async () => {
  const value = await prepare();
  await fixture.connection.db
    .update(files)
    .set({ scanStatus: 'rejected' })
    .where(eq(files.id, value.fileId));
  expect((await value.confirm()).statusCode).toBe(409);
  await expectPending(value.booking.id);
});
it('ACC-001: archived physical inventory cannot reach request confirmation', async () => {
  const value = await prepare();
  await fixture.connection.db
    .update(roomTypes)
    .set({ archivedAt: fixture.now })
    .where(eq(roomTypes.id, value.inventory.roomTypeId));
  expect((await value.confirm()).statusCode).toBe(409);
  await expectPending(value.booking.id);
});

it('AUTH-C-005 / BKG-002: confirmation fails after a permanent address is removed and succeeds after correction', async () => {
  const value = await prepare();
  await fixture.connection.db
    .update(users)
    .set({ permanentAddress: null })
    .where(eq(users.id, fixture.customerA));
  try {
    const denied = await value.confirm();
    expect(denied.statusCode).toBe(422);
    expect(denied.json()).toMatchObject({ code: 'VALIDATION_FAILED' });
    await expectPending(value.booking.id);
  } finally {
    await fixture.connection.db
      .update(users)
      .set({ permanentAddress: 'House 12, Islamabad' })
      .where(eq(users.id, fixture.customerA));
  }
  expect((await value.confirm()).statusCode).toBe(200);
});
