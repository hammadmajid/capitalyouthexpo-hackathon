import { and, eq } from 'drizzle-orm';
import { branches, files, stays, stayAgreements } from '@hsm/db';
import { DomainError } from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import type { Transaction } from '../audit/writer.js';
import { lockActor } from '../auth/actor-lock.js';
import { lockInventoryScope } from '../inventory/scope.js';
export async function agreementDocumentScope(
  tx: Transaction,
  actor: Actor,
  stayId: string,
  agreementId: string,
  clock: () => Date,
  branchId?: string,
) {
  await lockActor(tx, actor, clock);
  const scope = branchId ? await lockInventoryScope(tx, actor, branchId, 'stay_manage') : undefined;
  const [stay] = await tx
    .select({ stay: stays, organizationId: branches.organizationId })
    .from(stays)
    .innerJoin(branches, eq(branches.id, stays.branchId))
    .where(
      and(
        eq(stays.id, stayId),
        branchId ? eq(stays.branchId, branchId) : eq(stays.userId, actor.userId),
      ),
    )
    .for('update');
  if (!stay) throw new DomainError('NOT_FOUND', 404, 'Stay unavailable');
  const [agreement] = await tx
    .select()
    .from(stayAgreements)
    .where(
      and(
        eq(stayAgreements.branchId, stay.stay.branchId),
        eq(stayAgreements.stayId, stayId),
        eq(stayAgreements.id, agreementId),
      ),
    );
  if (!agreement) throw new DomainError('NOT_FOUND', 404, 'Agreement unavailable');
  await lockActor(tx, actor, clock);
  return {
    stay: stay.stay,
    agreement,
    organizationId: stay.organizationId,
    actorRole: scope?.actorRole ?? 'resident',
  };
}
export async function cleanAgreementFile(
  tx: Transaction,
  fileId: string,
  purpose: 'agreement_template' | 'stay_agreement' | 'staff_agreement',
  bucket: string,
  uploader?: string,
) {
  const [file] = await tx
    .select()
    .from(files)
    .where(
      and(
        eq(files.id, fileId),
        eq(files.bucket, bucket),
        eq(files.purpose, purpose),
        eq(files.visibility, 'private'),
        uploader ? eq(files.uploadedBy, uploader) : undefined,
      ),
    )
    .for('update');
  if (!file || !file.uploadedBy)
    throw new DomainError('NOT_FOUND', 404, 'Agreement file unavailable');
  if (
    file.scanStatus !== 'clean' ||
    file.sha256?.length !== 32 ||
    !file.objectKey.startsWith('private/' + purpose + '/' + file.id + '/') ||
    !['application/pdf', 'image/jpeg', 'image/png'].includes(file.mimeType)
  )
    throw new DomainError('CONFLICT', 409, 'Agreement file must pass security checks');
  return file;
}
