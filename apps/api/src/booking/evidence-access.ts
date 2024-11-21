import { and, eq, or } from 'drizzle-orm';
import { bookingDocuments, bookings, files } from '@hsm/db';
import { DomainError } from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { requireSensitiveAccess } from '../authorization/sensitive.policy.js';
import { AuditWriter, type Transaction } from '../audit/writer.js';
import { lockActor } from '../auth/actor-lock.js';
import { lockInventoryScope } from '../inventory/scope.js';

async function scopedDocument(
  database: Transaction,
  branchId: string,
  documentId: string,
  clock: () => Date,
) {
  const [document] = await database
    .select()
    .from(bookingDocuments)
    .where(and(eq(bookingDocuments.id, documentId), eq(bookingDocuments.branchId, branchId)))
    .for('update');
  if (!document || document.consumedAt)
    throw new DomainError('NOT_FOUND', 404, 'Booking evidence unavailable');
  if (document.bookingId) {
    const [booking] = await database
      .select({
        id: bookings.id,
        state: bookings.state,
        requestExpiresAt: bookings.requestExpiresAt,
      })
      .from(bookings)
      .where(
        and(
          eq(bookings.id, document.bookingId),
          eq(bookings.branchId, branchId),
          eq(bookings.customerUserId, document.customerUserId),
          or(eq(bookings.state, 'pending_request'), eq(bookings.state, 'confirmed')),
        ),
      );
    if (
      !booking ||
      (booking.state === 'pending_request' &&
        (!booking.requestExpiresAt || booking.requestExpiresAt <= clock()))
    )
      throw new DomainError('NOT_FOUND', 404, 'Booking evidence unavailable');
  }
  return document;
}
async function cleanEvidenceFile(
  database: Transaction,
  document: typeof bookingDocuments.$inferSelect,
  bucket: string,
) {
  const [file] = await database
    .select()
    .from(files)
    .where(
      and(
        eq(files.id, document.fileId),
        eq(files.uploadedBy, document.customerUserId),
        eq(files.bucket, bucket),
        eq(files.visibility, 'private'),
        eq(files.purpose, 'resident_document'),
        eq(files.scanStatus, 'clean'),
      ),
    )
    .for('update');
  if (
    !file ||
    file.sha256?.length !== 32 ||
    !file.objectKey.startsWith('private/resident_document/' + file.id + '/')
  )
    throw new DomainError('NOT_FOUND', 404, 'Booking evidence unavailable');
  return file;
}
// CHG-008: server-resolved facts only. Never expose this result in public DTOs.
export async function ownerBookingEvidence(
  database: Transaction,
  actor: Actor,
  branchId: string,
  documentId: string,
  bucket: string,
  clock: () => Date,
  audit = new AuditWriter(),
) {
  await lockActor(database, actor, clock);
  await lockInventoryScope(database, actor, branchId, undefined, true);
  const document = await scopedDocument(database, branchId, documentId, clock);
  const file = await cleanEvidenceFile(database, document, bucket);
  requireSensitiveAccess({
    actorId: actor.userId,
    subjectId: document.customerUserId,
    actorActive: true,
    resource: 'private_document',
    ownerOrAssignedManager: false,
    approvedBookingOrWalkIn: false,
    owningBookingOwner: true,
    scopedBookingEvidence: true,
    rootActive: false,
    authorizedSafetyCase: false,
    justification: '',
  });
  await audit.sensitive(database, {
    actorUserId: actor.userId,
    subjectUserId: document.customerUserId,
    resource: 'private_document',
    resourceId: file.id,
    purpose: 'Owner booking document verification',
    createdAt: clock(),
  });
  return { document, file };
}
