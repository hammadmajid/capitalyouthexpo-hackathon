import { and, eq } from 'drizzle-orm';
import { files } from '@hsm/db';
import { DomainError } from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { AuditWriter, type Transaction } from '../audit/writer.js';
// Direct staff-recorded receipt attachments use only the actor's own clean upload.
// Customer submissions need a separate exact submitted-proof association; guessing an uploader is forbidden.
export async function authorizeRecordedPaymentProof(
  tx: Transaction,
  actor: Actor,
  fileId: string,
  bucket: string,
  now: Date,
  audit = new AuditWriter(),
) {
  const [file] = await tx
    .select()
    .from(files)
    .where(
      and(
        eq(files.id, fileId),
        eq(files.uploadedBy, actor.userId),
        eq(files.bucket, bucket),
        eq(files.visibility, 'private'),
        eq(files.purpose, 'payment_proof'),
        eq(files.scanStatus, 'clean'),
      ),
    )
    .for('update');
  if (!file || !ownCleanProof(file, actor, fileId, bucket) || !verifiedProof(file, fileId))
    throw new DomainError('NOT_FOUND', 404, 'Payment proof unavailable');
  await audit.sensitive(tx, {
    actorUserId: actor.userId,
    subjectUserId: actor.userId,
    resource: 'private_document',
    resourceId: fileId,
    purpose: 'Own payment proof attachment to recorded hostel receipt',
    createdAt: now,
  });
}

function ownCleanProof(
  file: typeof files.$inferSelect,
  actor: Actor,
  fileId: string,
  bucket: string,
) {
  return (
    file.id === fileId &&
    file.uploadedBy === actor.userId &&
    file.bucket === bucket &&
    file.visibility === 'private' &&
    file.purpose === 'payment_proof' &&
    file.scanStatus === 'clean'
  );
}
function verifiedProof(file: typeof files.$inferSelect, fileId: string) {
  return (
    file.sha256?.length === 32 && file.objectKey.startsWith('private/payment_proof/' + fileId + '/')
  );
}
