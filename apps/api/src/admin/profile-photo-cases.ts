import { and, desc, eq, isNotNull, lt, notExists } from 'drizzle-orm';
import { v7 } from 'uuid';
import { adminAccounts, files, profileReviewEvidence, profileReviewRequests, users } from '@hsm/db';
import {
  DomainError,
  profilePhotoSubjectPageSchema,
  profilePhotoSubmissionSchema,
  profileReviewMetadataSchema,
  profileReviewQuerySchema,
  stayIdentifierSchema,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { requireTransaction } from '../idempotency/context.js';
import { lockAdmin, platformAudit } from './scope.js';
import { authorizeProfileReview, requireProfileReviewFile } from './profile-review-policy.js';
import {
  profileReviewFailure,
  reviewDigest,
  reviewMetadata,
  reviewSubject,
  type ProfileReviewContext,
} from './profile-review-context.js';
// Current-avatar discovery is metadata only. Evidence requires a reasoned case and separate audited access.
export function listProfilePhotoSubjects(
  context: ProfileReviewContext,
  actor: Actor,
  query: unknown,
) {
  const input = profileReviewQuerySchema.parse(query);
  return context.database.transaction(async (tx) => {
    await lockAdmin(tx, actor, 'content_moderator', context.clock);
    const rows = await tx
      .select({ userId: users.id, fileId: users.profilePhotoFileId, updatedAt: users.updatedAt })
      .from(users)
      .where(
        and(
          isNotNull(users.profilePhotoFileId),
          input.cursor ? lt(users.id, input.cursor) : undefined,
          notExists(
            tx
              .select({ id: adminAccounts.userId })
              .from(adminAccounts)
              .where(eq(adminAccounts.userId, users.id)),
          ),
        ),
      )
      .orderBy(desc(users.id))
      .limit(input.limit + 1);
    const page = rows.slice(0, input.limit);
    return profilePhotoSubjectPageSchema.parse({
      data: page.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() })),
      nextCursor: rows.length > input.limit ? page.at(-1)?.userId : null,
    });
  });
}
export function flagCurrentProfilePhoto(
  context: ProfileReviewContext,
  actor: Actor,
  key: unknown,
  target: unknown,
  body: unknown,
) {
  const userId = stayIdentifierSchema.parse(target),
    input = profilePhotoSubmissionSchema.parse(body);
  return context.idempotency
    .execute(
      {
        actor,
        key: stayIdentifierSchema.parse(key),
        endpoint: 'POST profile photo case ' + userId,
        status: 201,
      },
      { userId },
      input,
      profileReviewMetadataSchema,
      async (tx) => Boolean(await lockAdmin(tx, actor, 'content_moderator', context.clock)),
      async () => {
        const tx = requireTransaction(),
          scope = await lockAdmin(tx, actor, 'content_moderator', context.clock);
        const { identity, adminLinked } = await reviewSubject(tx, userId, 'profile_photo');
        authorizeProfileReview({
          kind: 'profile_photo',
          actorId: actor.userId,
          subjectId: userId,
          subjectAdminLinked: adminLinked,
          ...scope,
        });
        if (identity.profilePhotoFileId !== input.fileId)
          throw new DomainError(
            'CONFLICT',
            409,
            'Current profile photo changed. Refresh before opening a case.',
          );
        const [file] = await tx.select().from(files).where(eq(files.id, input.fileId)).for('share');
        requireProfileReviewFile(file, userId, context.bucket, 'avatar');
        const id = v7(),
          now = context.clock();
        await tx.insert(profileReviewRequests).values({
          id,
          userId,
          kind: 'profile_photo',
          reason: input.reason,
          baselineDigest: reviewDigest(context, identity, 'profile_photo'),
          previousPhotoFileId: input.fileId,
          proposedPhotoFileId: input.fileId,
          submittedAt: now,
          updatedAt: now,
        });
        await tx
          .insert(profileReviewEvidence)
          .values({ requestId: id, fileId: input.fileId, position: 0 });
        await platformAudit(
          tx,
          scope,
          {
            action: 'profile_review.staff_flagged',
            targetType: 'profile_review',
            targetId: id,
            after: { kind: 'profile_photo', version: 1 },
          },
          now,
        );
        return reviewMetadata({
          id,
          userId,
          kind: 'profile_photo',
          status: 'pending',
          version: 1,
          submittedAt: now,
          updatedAt: now,
        });
      },
    )
    .catch(profileReviewFailure);
}
