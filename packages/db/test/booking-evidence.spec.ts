import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq, isNull, sql } from 'drizzle-orm';
import {
  bookingDocuments,
  files,
  bookings,
  inventoryClaims,
  managerAssignments,
  managerInventoryGrants,
} from '../src/index.js';
import {
  inventoryHarness,
  bookingValues,
  claimValues,
  type InventoryFixture,
} from './inventory.fixture.js';
const harness = inventoryHarness(),
  database = harness.database;
beforeAll(() => harness.start());
afterAll(() => harness.close());
async function pending(scope: InventoryFixture, bookingId: string | null = null) {
  const fileId = randomUUID(),
    id = randomUUID();
  // Database-only clean-file fixture; real byte validation/scanning has separate container suites.
  await database()
    .insert(files)
    .values({
      id: fileId,
      uploadedBy: scope.customerA,
      visibility: 'private',
      bucket: 'evidence-fixture',
      objectKey: 'private/resident_document/' + fileId + '/' + randomUUID(),
      mimeType: 'application/pdf',
      sizeBytes: 1n,
      sha256: Buffer.alloc(32, 1),
      purpose: 'resident_document',
      scanStatus: 'clean',
    });
  await database().insert(bookingDocuments).values({
    id,
    bookingId,
    branchId: scope.branchId,
    customerUserId: scope.customerA,
    fileId,
    kind: 'student_id',
    state: 'pending',
  });
  return { id, fileId };
}
function accept(id: string, reviewer: string) {
  return database()
    .update(bookingDocuments)
    .set({
      state: 'accepted',
      rejectionCode: null,
      reviewedByUserId: reviewer,
      reviewedAt: new Date(),
    })
    .where(eq(bookingDocuments.id, id));
}
it('CHG-008 / SEC-003: the real database permits owning Owner review and seals final provenance', async () => {
  const scope = await harness.scope(),
    evidence = await pending(scope);
  await accept(evidence.id, scope.ownerId);
  await expect(
    database()
      .update(bookingDocuments)
      .set({ state: 'rejected', rejectionCode: 'wrong_document' })
      .where(eq(bookingDocuments.id, evidence.id)),
  ).rejects.toThrow();
  await expect(
    database()
      .update(bookingDocuments)
      .set({ reviewedByUserId: scope.customerB })
      .where(eq(bookingDocuments.id, evidence.id)),
  ).rejects.toThrow();
  const [row] = await database()
    .select()
    .from(bookingDocuments)
    .where(eq(bookingDocuments.id, evidence.id));
  expect(row?.state).toBe('accepted');
  expect(row?.reviewedByUserId).toBe(scope.ownerId);
});
it('CHG-008 / ACC-004: even a granted Manager cannot review before confirmation; post-confirmation scope remains valid', async () => {
  const scope = await harness.scope(),
    source = await pending(scope),
    assignmentId = randomUUID();
  await database().insert(managerAssignments).values({
    id: assignmentId,
    userId: scope.customerB,
    branchId: scope.branchId,
    status: 'active',
    activatedAt: new Date(),
    appointedByUserId: scope.ownerId,
  });
  await database()
    .insert(managerInventoryGrants)
    .values({ assignmentId, permission: 'document_review' });
  await expect(accept(source.id, scope.customerB)).rejects.toThrow();
  const booking = bookingValues(scope);
  await database().transaction(async (transaction) => {
    await transaction.insert(bookings).values(booking);
    await transaction.insert(inventoryClaims).values(claimValues(scope, { bookingId: booking.id }));
  });
  const admitted = await pending(scope, booking.id);
  await accept(admitted.id, scope.customerB);
  const [row] = await database()
    .select()
    .from(bookingDocuments)
    .where(eq(bookingDocuments.id, admitted.id));
  expect(row?.state).toBe('accepted');
  expect(row?.reviewedByUserId).toBe(scope.customerB);
});
it('BKG-001 / SEC-003: consuming a fresh record is monotonic and cannot reset its identity or timestamp', async () => {
  const scope = await harness.scope(),
    evidence = await pending(scope);
  await accept(evidence.id, scope.ownerId);
  const consumedAt = new Date();
  await database()
    .update(bookingDocuments)
    .set({ consumedAt })
    .where(eq(bookingDocuments.id, evidence.id));
  await expect(
    database()
      .update(bookingDocuments)
      .set({ consumedAt: null })
      .where(eq(bookingDocuments.id, evidence.id)),
  ).rejects.toThrow();
  await expect(
    database()
      .update(bookingDocuments)
      .set({ consumedAt: new Date(consumedAt.getTime() + 1) })
      .where(eq(bookingDocuments.id, evidence.id)),
  ).rejects.toThrow();
  const other = await harness.scope();
  await expect(
    database()
      .update(bookingDocuments)
      .set({ branchId: other.branchId })
      .where(eq(bookingDocuments.id, evidence.id)),
  ).rejects.toThrow();
});
it('BKG-001: a failed booking transaction rolls evidence consumption back', async () => {
  const scope = await harness.scope(),
    evidence = await pending(scope);
  await accept(evidence.id, scope.ownerId);
  await expect(
    database().transaction(async (transaction) => {
      await transaction
        .update(bookingDocuments)
        .set({ consumedAt: new Date() })
        .where(eq(bookingDocuments.id, evidence.id));
      throw new Error('Booking operation failed');
    }),
  ).rejects.toThrow('Booking operation failed');
  const [row] = await database()
    .select()
    .from(bookingDocuments)
    .where(eq(bookingDocuments.id, evidence.id));
  expect(row?.consumedAt).toBeNull();
});
it('SEC-003: rejected evidence cannot be consumed or silently accepted again', async () => {
  const scope = await harness.scope(),
    evidence = await pending(scope);
  await database()
    .update(bookingDocuments)
    .set({
      state: 'rejected',
      rejectionCode: 'wrong_document',
      reviewedByUserId: scope.ownerId,
      reviewedAt: new Date(),
    })
    .where(eq(bookingDocuments.id, evidence.id));
  await expect(
    database()
      .update(bookingDocuments)
      .set({ consumedAt: new Date() })
      .where(eq(bookingDocuments.id, evidence.id)),
  ).rejects.toThrow();
  await expect(accept(evidence.id, scope.ownerId)).rejects.toThrow();
});
it('SEC-003: a new row cannot invent accepted provenance and historical evidence cannot be deleted/truncated', async () => {
  const scope = await harness.scope(),
    evidence = await pending(scope);
  await expect(
    database().insert(bookingDocuments).values({
      branchId: scope.branchId,
      customerUserId: scope.customerA,
      fileId: evidence.fileId,
      kind: 'student_id',
      state: 'accepted',
      reviewedByUserId: scope.ownerId,
      reviewedAt: new Date(),
    }),
  ).rejects.toThrow();
  await expect(
    database().delete(bookingDocuments).where(eq(bookingDocuments.id, evidence.id)),
  ).rejects.toThrow();
  await expect(database().execute(sql`TRUNCATE booking_documents`)).rejects.toThrow();
  expect(
    await database().select().from(bookingDocuments).where(eq(bookingDocuments.id, evidence.id)),
  ).toHaveLength(1);
});

it('BKG-001 / ACC-001: concurrent conditional consumption succeeds exactly once in PostgreSQL', async () => {
  const scope = await harness.scope(),
    evidence = await pending(scope);
  await accept(evidence.id, scope.ownerId);
  const consume = () =>
    database()
      .update(bookingDocuments)
      .set({ consumedAt: new Date() })
      .where(and(eq(bookingDocuments.id, evidence.id), isNull(bookingDocuments.consumedAt)))
      .returning({ id: bookingDocuments.id });
  const results = await Promise.all([consume(), consume()]);
  expect(results.flat()).toEqual([{ id: evidence.id }]);
  const [row] = await database()
    .select()
    .from(bookingDocuments)
    .where(eq(bookingDocuments.id, evidence.id));
  await expect(
    database()
      .update(bookingDocuments)
      .set({ consumedAt: row?.consumedAt ?? new Date() })
      .where(eq(bookingDocuments.id, evidence.id)),
  ).rejects.toThrow();
});
