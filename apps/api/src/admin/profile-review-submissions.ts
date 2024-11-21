import { and, eq, inArray } from 'drizzle-orm';
import { v7 } from 'uuid';
import { files, profileReviewEvidence, profileReviewRequests } from '@hsm/db';
import {
  DomainError,
  identityCorrectionInputSchema,
  profilePhotoSubmissionSchema,
  profileReviewMetadataSchema,
  stayIdentifierSchema,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { lockActor } from '../auth/actor-lock.js';
import { requireTransaction } from '../idempotency/context.js';
import { AuditWriter } from '../audit/writer.js';
import { requireProfileReviewFile } from './profile-review-policy.js';
import {
  profileReviewFailure,
  reviewDigest,
  reviewMetadata,
  reviewSubject,
  type ProfileReviewContext,
  type ReviewKind,
} from './profile-review-context.js';
// Registered only after the explicit feature flag and schema readiness checks pass.
export function submitProfileReview(
  context: ProfileReviewContext,
  actor: Actor,
  key: unknown,
  kind: ReviewKind,
  body: unknown,
) {
  const input =
    kind === 'identity'
      ? identityCorrectionInputSchema.parse(body)
      : profilePhotoSubmissionSchema.parse(body);
  return context.idempotency
    .execute(
      {
        actor,
        key: stayIdentifierSchema.parse(key),
        endpoint: 'POST own profile review ' + kind,
        status: 201,
      },
      {},
      input,
      profileReviewMetadataSchema,
      async (tx) => {
        await lockActor(tx, actor, context.clock);
        return true;
      },
      async () => {
        const tx = requireTransaction(),
          now = context.clock();
        const { identity, adminLinked } = await reviewSubject(tx, actor.userId, kind);
        if (adminLinked)
          throw new DomainError(
            'FORBIDDEN',
            403,
            'Admin identity changes require the separate manual process',
          );
        if (!identity.emailVerifiedAt || !identity.passwordSet)
          throw new DomainError(
            'FORBIDDEN',
            403,
            'Complete account verification before submitting a review',
          );
        const identityInput =
          kind === 'identity' ? identityCorrectionInputSchema.parse(body) : undefined;
        const photoInput =
          kind === 'profile_photo' ? profilePhotoSubmissionSchema.parse(body) : undefined;
        const cnic = identityInput?.cnic
          ? context.crypto.protectCnic(identityInput.cnic)
          : undefined;
        if (
          identityInput &&
          (!identityInput.fullName || identityInput.fullName === identity.fullName) &&
          (!cnic || cnic.cnicHash.equals(identity.cnicHash ?? Buffer.alloc(0)))
        )
          throw new DomainError('CONFLICT', 409, 'No identity correction was proposed');
        if (photoInput?.fileId === identity.profilePhotoFileId)
          throw new DomainError('CONFLICT', 409, 'That profile photo is already current');
        const ids = identityInput?.evidenceFileIds ?? (photoInput ? [photoInput.fileId] : []);
        const evidence = await tx
          .select()
          .from(files)
          .where(and(inArray(files.id, ids), eq(files.uploadedBy, actor.userId)))
          .for('share');
        for (const id of ids)
          requireProfileReviewFile(
            evidence.find((file) => file.id === id),
            actor.userId,
            context.bucket,
            kind === 'identity' ? 'verification_document' : 'avatar',
          );
        const id = v7();
        await tx.insert(profileReviewRequests).values({
          id,
          userId: actor.userId,
          kind,
          reason: input.reason,
          baselineDigest: reviewDigest(context, identity, kind),
          submittedAt: now,
          updatedAt: now,
          ...(identityInput
            ? {
                previousFullName: identity.fullName,
                proposedFullName: identityInput.fullName ?? null,
                previousCnicHash: identity.cnicHash,
                previousCnicEncrypted: identity.cnicEncrypted,
                previousCnicLast4: identity.cnicLast4,
                proposedCnicHash: cnic?.cnicHash ?? null,
                proposedCnicEncrypted: cnic?.cnicEncrypted ?? null,
                proposedCnicLast4: cnic?.cnicLast4 ?? null,
              }
            : {}),
          ...(photoInput
            ? {
                previousPhotoFileId: identity.profilePhotoFileId,
                proposedPhotoFileId: photoInput.fileId,
              }
            : {}),
        });
        await tx
          .insert(profileReviewEvidence)
          .values(ids.map((fileId, position) => ({ requestId: id, fileId, position })));
        await new AuditWriter().platform(tx, {
          actorUserId: actor.userId,
          actorRole: 'self',
          action: 'profile_review.submitted',
          targetType: 'profile_review',
          targetId: id,
          after: { kind, version: 1 },
          createdAt: now,
        });
        return reviewMetadata({
          id,
          userId: actor.userId,
          kind,
          status: 'pending',
          version: 1,
          submittedAt: now,
          updatedAt: now,
        });
      },
    )
    .catch(profileReviewFailure);
}
