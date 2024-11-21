import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { v7 } from 'uuid';
import {
  files,
  ownerProfiles,
  profileReviewDecisions,
  profileReviewEvidence,
  profileReviewRequests,
  sessions,
  users,
} from '@hsm/db';
import {
  DomainError,
  identityCorrectionDecisionSchema,
  profilePhotoDecisionSchema,
  profileReviewCancelSchema,
  profileReviewMetadataSchema,
  stayIdentifierSchema,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import type { Transaction } from '../audit/writer.js';
import { requireTransaction } from '../idempotency/context.js';
import { lockActor } from '../auth/actor-lock.js';
import { AuditWriter } from '../audit/writer.js';
import { lockAdmin, platformAudit } from './scope.js';
import {
  authorizeProfileReview,
  nextProfileReviewState,
  requireProfileReviewFile,
} from './profile-review-policy.js';
import {
  profileReviewFailure,
  reviewDigest,
  reviewMetadata,
  reviewSubject,
  type ProfileReviewContext,
  type ReviewKind,
} from './profile-review-context.js';
import { notify } from '../services/notify.js';
async function lockedRequest(tx: Transaction, id: string, kind: ReviewKind, ownUserId?: string) {
  const [pointer] = await tx
    .select({ userId: profileReviewRequests.userId })
    .from(profileReviewRequests)
    .where(
      and(
        eq(profileReviewRequests.id, id),
        eq(profileReviewRequests.kind, kind),
        ownUserId ? eq(profileReviewRequests.userId, ownUserId) : undefined,
      ),
    );
  if (!pointer) throw new DomainError('NOT_FOUND', 404, 'Review unavailable');
  // Same user-first order as self submission/cancellation, avoiding cross-flow deadlocks.
  const subject = await reviewSubject(tx, pointer.userId, kind);
  const [row] = await tx
    .select()
    .from(profileReviewRequests)
    .where(eq(profileReviewRequests.id, id))
    .for('update');
  if (!row) throw new DomainError('NOT_FOUND', 404, 'Review unavailable');
  return { ...subject, row };
}
async function verifyEvidence(
  tx: Transaction,
  context: ProfileReviewContext,
  row: typeof profileReviewRequests.$inferSelect,
) {
  const links = await tx
    .select()
    .from(profileReviewEvidence)
    .where(eq(profileReviewEvidence.requestId, row.id))
    .orderBy(asc(profileReviewEvidence.position));
  const records = links.length
    ? await tx
        .select()
        .from(files)
        .where(
          inArray(
            files.id,
            links.map((link) => link.fileId),
          ),
        )
        .for('share')
    : [];
  for (const link of links)
    requireProfileReviewFile(
      records.find((file) => file.id === link.fileId),
      row.userId,
      context.bucket,
      row.kind === 'identity' ? 'verification_document' : 'avatar',
    );
  if (
    !links.length ||
    links.some((link, index) => link.position !== index) ||
    (row.proposedCnicHash && links.length < 2) ||
    (row.kind === 'profile_photo' &&
      (links.length !== 1 || links[0]?.fileId !== row.proposedPhotoFileId))
  )
    throw new DomainError('CONFLICT', 409, 'Required review evidence unavailable');
  return links;
}
async function applyApproval(
  tx: Transaction,
  context: ProfileReviewContext,
  row: typeof profileReviewRequests.$inferSelect,
  now: Date,
) {
  const links = await verifyEvidence(tx, context, row);
  if (row.kind === 'profile_photo') {
    await tx
      .update(users)
      .set({ profilePhotoFileId: row.proposedPhotoFileId, updatedAt: now })
      .where(eq(users.id, row.userId));
    return;
  }
  await tx
    .update(users)
    .set({
      ...(row.proposedFullName !== null ? { fullName: row.proposedFullName } : {}),
      ...(row.proposedCnicHash
        ? {
            cnicHash: row.proposedCnicHash,
            cnicEncrypted: row.proposedCnicEncrypted,
            cnicLast4: row.proposedCnicLast4,
          }
        : {}),
      updatedAt: now,
    })
    .where(eq(users.id, row.userId));
  if (row.proposedCnicHash && links[0] && links[1])
    await tx
      .update(ownerProfiles)
      .set({ cnicFrontFileId: links[0].fileId, cnicBackFileId: links[1].fileId, updatedAt: now })
      .where(eq(ownerProfiles.userId, row.userId));
  await tx
    .update(sessions)
    .set({ revokedAt: now, revokedReason: 'identity.review_approved' })
    .where(and(eq(sessions.userId, row.userId), isNull(sessions.revokedAt)));
}
export function decideProfileReview(
  context: ProfileReviewContext,
  actor: Actor,
  key: unknown,
  target: unknown,
  kind: ReviewKind,
  body: unknown,
  selfCancel = false,
) {
  const id = stayIdentifierSchema.parse(target);
  const input = selfCancel
    ? { ...profileReviewCancelSchema.parse(body), action: 'cancel' as const }
    : kind === 'identity'
      ? identityCorrectionDecisionSchema.parse(body)
      : profilePhotoDecisionSchema.parse(body);
  return context.idempotency
    .execute(
      {
        actor,
        key: stayIdentifierSchema.parse(key),
        endpoint: 'POST profile review ' + kind + ' ' + id + (selfCancel ? ' cancel' : ' decide'),
        status: 200,
      },
      { id },
      input,
      profileReviewMetadataSchema,
      async (tx) => {
        if (selfCancel) await lockActor(tx, actor, context.clock);
        else
          await lockAdmin(
            tx,
            actor,
            kind === 'identity' ? 'root' : 'content_moderator',
            context.clock,
          );
        return true;
      },
      async () => {
        const tx = requireTransaction(),
          { row, identity, adminLinked } = await lockedRequest(
            tx,
            id,
            kind,
            selfCancel ? actor.userId : undefined,
          );
        if (selfCancel) {
          if (row.userId !== actor.userId)
            throw new DomainError('NOT_FOUND', 404, 'Review unavailable');
        } else {
          const scope = await lockAdmin(
            tx,
            actor,
            kind === 'identity' ? 'root' : 'content_moderator',
            context.clock,
          );
          authorizeProfileReview({
            kind,
            actorId: actor.userId,
            subjectId: row.userId,
            subjectAdminLinked: adminLinked,
            ...scope,
          });
        }
        if (
          selfCancel &&
          kind === 'profile_photo' &&
          row.proposedPhotoFileId === row.previousPhotoFileId
        )
          throw new DomainError(
            'FORBIDDEN',
            403,
            'Staff moderation cases cannot be cancelled by the subject',
          );
        const current = profileReviewMetadataSchema.parse(reviewMetadata(row));
        const next = nextProfileReviewState(
          kind,
          current.status,
          input.action,
          row.version,
          input.expectedVersion,
        );
        const now = new Date(Math.max(context.clock().getTime(), row.updatedAt.getTime() + 1));
        if (input.action === 'approve') {
          if (
            identity.accountStatus !== 'active' ||
            !reviewDigest(context, identity, kind).equals(row.baselineDigest)
          )
            throw new DomainError(
              'CONFLICT',
              409,
              'Profile changed. Cancel this request and submit current details.',
            );
          await applyApproval(tx, context, row, now);
        } else if (
          input.action === 'reject' &&
          kind === 'profile_photo' &&
          identity.profilePhotoFileId === row.proposedPhotoFileId
        ) {
          await tx
            .update(users)
            .set({ profilePhotoFileId: null, updatedAt: now })
            .where(eq(users.id, row.userId));
        } else if (input.action === 'withdraw') {
          if (identity.profilePhotoFileId !== row.proposedPhotoFileId)
            throw new DomainError(
              'CONFLICT',
              409,
              'Current photo changed. Review its latest request.',
            );
          await tx
            .update(users)
            .set({ profilePhotoFileId: null, updatedAt: now })
            .where(eq(users.id, row.userId));
        }
        const version = row.version + 1;
        await tx
          .update(profileReviewRequests)
          .set({ status: next, version, updatedAt: now })
          .where(eq(profileReviewRequests.id, id));
        await tx.insert(profileReviewDecisions).values({
          requestId: id,
          version,
          actorUserId: actor.userId,
          action: input.action,
          reason: input.reason,
          createdAt: now,
        });
        if (selfCancel)
          await new AuditWriter().platform(tx, {
            actorUserId: actor.userId,
            actorRole: 'self',
            action: 'profile_review.cancelled',
            targetType: 'profile_review',
            targetId: id,
            after: { kind, version },
            createdAt: now,
          });
        else {
          const scope = await lockAdmin(
            tx,
            actor,
            kind === 'identity' ? 'root' : 'content_moderator',
            context.clock,
          );
          await platformAudit(
            tx,
            scope,
            {
              action: 'profile_review.' + input.action,
              targetType: 'profile_review',
              targetId: id,
              before: { status: row.status, version: row.version },
              after: { status: next, version, kind },
            },
            now,
          );
        }
        await notify(tx, row.userId, 'profile.review_updated', v7(), now);
        return reviewMetadata({ ...row, status: next, version, updatedAt: now });
      },
    )
    .catch(profileReviewFailure);
}
