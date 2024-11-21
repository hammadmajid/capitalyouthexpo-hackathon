import { and, asc, desc, eq, lt, notExists } from 'drizzle-orm';
import {
  adminAccounts,
  files,
  profileReviewDecisions,
  profileReviewEvidence,
  profileReviewRequests,
} from '@hsm/db';
import {
  DomainError,
  downloadResponseSchema,
  profileReviewAccessSchema,
  profileReviewDetailSchema,
  profileReviewHistoryPageSchema,
  profileReviewHistoryQuerySchema,
  profileReviewPageSchema,
  profileReviewQuerySchema,
  stayIdentifierSchema,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import type { Transaction } from '../audit/writer.js';
import { AuditWriter } from '../audit/writer.js';
import { lockActor } from '../auth/actor-lock.js';
import { lockAdmin } from './scope.js';
import { authorizeProfileReview, requireProfileReviewFile } from './profile-review-policy.js';
import {
  profileReviewFailure,
  reviewMetadata,
  reviewMetadataProjection,
  reviewSubject,
  type ProfileReviewContext,
  type ReviewKind,
} from './profile-review-context.js';
import type { VerificationStorage } from './verification-evidence.js';
export class ProfileReviewReadService {
  constructor(
    private readonly context: ProfileReviewContext,
    private readonly storage?: VerificationStorage,
  ) {}
  private async authority(tx: Transaction, actor: Actor, kind: ReviewKind, own: boolean) {
    if (own) {
      await lockActor(tx, actor, this.context.clock);
      return undefined;
    }
    return lockAdmin(
      tx,
      actor,
      kind === 'identity' ? 'root' : 'content_moderator',
      this.context.clock,
    );
  }
  private async request(tx: Transaction, actor: Actor, id: string, kind: ReviewKind, own: boolean) {
    const scope = await this.authority(tx, actor, kind, own);
    const condition = and(
      eq(profileReviewRequests.id, id),
      eq(profileReviewRequests.kind, kind),
      own ? eq(profileReviewRequests.userId, actor.userId) : undefined,
    );
    const [pointer] = await tx
      .select({ userId: profileReviewRequests.userId })
      .from(profileReviewRequests)
      .where(condition);
    if (!pointer) throw new DomainError('NOT_FOUND', 404, 'Review unavailable');
    const { identity, adminLinked } = await reviewSubject(tx, pointer.userId, kind);
    if (scope)
      authorizeProfileReview({
        kind,
        actorId: actor.userId,
        subjectId: pointer.userId,
        subjectAdminLinked: adminLinked,
        ...scope,
      });
    const [row] = await tx.select().from(profileReviewRequests).where(condition).for('share');
    if (!row) throw new DomainError('NOT_FOUND', 404, 'Review unavailable');
    return { row, identity };
  }
  list(actor: Actor, kind: ReviewKind, query: unknown, own = false) {
    const input = profileReviewQuerySchema.parse(query);
    return this.context.database
      .transaction(async (tx) => {
        await this.authority(tx, actor, kind, own);
        const rows = await tx
          .select(reviewMetadataProjection)
          .from(profileReviewRequests)
          .where(
            and(
              eq(profileReviewRequests.kind, kind),
              eq(profileReviewRequests.status, input.status),
              own
                ? eq(profileReviewRequests.userId, actor.userId)
                : notExists(
                    tx
                      .select({ id: adminAccounts.userId })
                      .from(adminAccounts)
                      .where(eq(adminAccounts.userId, profileReviewRequests.userId)),
                  ),
              input.cursor ? lt(profileReviewRequests.id, input.cursor) : undefined,
            ),
          )
          .orderBy(desc(profileReviewRequests.id))
          .limit(input.limit + 1);
        const page = rows.slice(0, input.limit);
        return profileReviewPageSchema.parse({
          data: page.map(reviewMetadata),
          nextCursor: rows.length > input.limit ? page.at(-1)?.id : null,
        });
      })
      .catch(profileReviewFailure);
  }
  detail(actor: Actor, target: unknown, kind: ReviewKind, body: unknown, own = false) {
    const id = stayIdentifierSchema.parse(target),
      { justification } = profileReviewAccessSchema.parse(body);
    return this.context.database
      .transaction(async (tx) => {
        const { row, identity } = await this.request(tx, actor, id, kind, own);
        await this.audit(tx, actor, row, justification);
        const links = await tx
          .select()
          .from(profileReviewEvidence)
          .where(eq(profileReviewEvidence.requestId, id))
          .orderBy(asc(profileReviewEvidence.position));
        let proposedCnic: string | null = null;
        if (row.proposedCnicEncrypted) {
          try {
            proposedCnic = this.context.crypto.decrypt(row.proposedCnicEncrypted, 'cnic');
          } catch {
            throw new DomainError(
              'INTERNAL',
              503,
              'Private review details temporarily unavailable',
            );
          }
        }
        return profileReviewDetailSchema.parse({
          review: reviewMetadata(row),
          reason: row.reason,
          previousFullName: row.previousFullName,
          proposedFullName: row.proposedFullName,
          previousCnicLast4: row.previousCnicLast4,
          proposedCnic,
          previousPhotoFileId: row.previousPhotoFileId,
          proposedPhotoFileId: row.proposedPhotoFileId,
          currentPhoto:
            row.proposedPhotoFileId !== null &&
            identity.profilePhotoFileId === row.proposedPhotoFileId,
          evidenceFileIds: links.map((link) => link.fileId),
        });
      })
      .catch(profileReviewFailure);
  }
  history(actor: Actor, target: unknown, kind: ReviewKind, query: unknown, own = false) {
    const id = stayIdentifierSchema.parse(target),
      input = profileReviewHistoryQuerySchema.parse(query);
    return this.context.database
      .transaction(async (tx) => {
        await this.request(tx, actor, id, kind, own);
        const rows = await tx
          .select()
          .from(profileReviewDecisions)
          .where(
            and(
              eq(profileReviewDecisions.requestId, id),
              input.cursor ? lt(profileReviewDecisions.version, input.cursor) : undefined,
            ),
          )
          .orderBy(desc(profileReviewDecisions.version))
          .limit(input.limit + 1);
        const page = rows.slice(0, input.limit);
        return profileReviewHistoryPageSchema.parse({
          data: page.map((row) => ({
            version: row.version,
            actorId: row.actorUserId,
            action: row.action,
            reason: row.reason,
            createdAt: row.createdAt.toISOString(),
          })),
          nextCursor: rows.length > input.limit ? page.at(-1)?.version : null,
        });
      })
      .catch(profileReviewFailure);
  }
  evidence(
    actor: Actor,
    target: unknown,
    kind: ReviewKind,
    fileId: string,
    body: unknown,
    own = false,
  ) {
    const id = stayIdentifierSchema.parse(target),
      file = stayIdentifierSchema.parse(fileId),
      { justification } = profileReviewAccessSchema.parse(body);
    return this.context.database
      .transaction(async (tx) => {
        const { row } = await this.request(tx, actor, id, kind, own);
        const [attached] = await tx
          .select({ file: files })
          .from(profileReviewEvidence)
          .innerJoin(files, eq(files.id, profileReviewEvidence.fileId))
          .where(
            and(eq(profileReviewEvidence.requestId, id), eq(profileReviewEvidence.fileId, file)),
          )
          .for('share');
        const evidence = requireProfileReviewFile(
          attached?.file,
          row.userId,
          this.context.bucket,
          kind === 'identity' ? 'verification_document' : 'avatar',
        );
        if (!this.storage || this.storage.bucket !== this.context.bucket)
          throw new DomainError('INTERNAL', 503, 'Review storage temporarily unavailable');
        await this.audit(tx, actor, row, justification, file);
        let url: string;
        try {
          url = await this.storage.storage.presignDownload(
            evidence.objectKey,
            evidence.id,
            evidence.mimeType,
          );
        } catch {
          throw new DomainError('INTERNAL', 503, 'Review evidence temporarily unavailable');
        }
        return downloadResponseSchema.parse({
          url,
          expiresAt: new Date(this.context.clock().getTime() + 60000).toISOString(),
        });
      })
      .catch(profileReviewFailure);
  }
  private audit(
    tx: Transaction,
    actor: Actor,
    row: typeof profileReviewRequests.$inferSelect,
    purpose: string,
    fileId?: string,
  ) {
    return new AuditWriter()
      .sensitive(tx, {
        actorUserId: actor.userId,
        subjectUserId: row.userId,
        resource: row.kind === 'identity' ? 'identity_correction_review' : 'profile_photo_review',
        resourceId: fileId ?? row.id,
        purpose,
        createdAt: this.context.clock(),
      })
      .catch(profileReviewFailure);
  }
}
