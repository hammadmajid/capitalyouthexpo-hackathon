import { eq, sql } from 'drizzle-orm';
import { adminAccounts, users, profileReviewRequests, type Database } from '@hsm/db';
import { DomainError, profileReviewMetadataSchema } from '@hsm/contracts';
import type { AuthCrypto } from '../auth/crypto.js';
import type { IdempotencyService } from '../idempotency/service.js';
import type { Transaction } from '../audit/writer.js';
export type ReviewKind = 'identity' | 'profile_photo';
export type ProfileReviewContext = {
  database: Database;
  idempotency: IdempotencyService;
  crypto: Pick<AuthCrypto, 'digest' | 'protectCnic' | 'decrypt'>;
  bucket: string;
  clock: () => Date;
};
export type ReviewIdentity = Pick<
  typeof users.$inferSelect,
  | 'id'
  | 'fullName'
  | 'cnicHash'
  | 'cnicEncrypted'
  | 'cnicLast4'
  | 'profilePhotoFileId'
  | 'emailVerifiedAt'
  | 'accountStatus'
> & { passwordSet: boolean };
export function reviewDigest(
  context: ProfileReviewContext,
  identity: ReviewIdentity,
  kind: ReviewKind,
) {
  const values =
    kind === 'identity'
      ? [identity.fullName, identity.cnicHash?.toString('hex') ?? null]
      : [identity.profilePhotoFileId];
  return Buffer.from(
    context.crypto.digest(JSON.stringify([kind, ...values]), 'identity_review'),
    'hex',
  );
}
export async function reviewSubject(
  tx: Transaction,
  userId: string,
  kind: ReviewKind = 'identity',
) {
  const [identity] = await tx
    .select({
      id: users.id,
      fullName: kind === 'identity' ? users.fullName : sql<string>`''`,
      cnicHash: kind === 'identity' ? users.cnicHash : sql<Buffer | null>`null`,
      cnicEncrypted: kind === 'identity' ? users.cnicEncrypted : sql<Buffer | null>`null`,
      cnicLast4: kind === 'identity' ? users.cnicLast4 : sql<string | null>`null`,
      profilePhotoFileId: users.profilePhotoFileId,
      emailVerifiedAt: users.emailVerifiedAt,
      accountStatus: users.accountStatus,
      passwordSet: sql<boolean>`${users.passwordHash} is not null`,
    })
    .from(users)
    .where(eq(users.id, userId))
    .for('update');
  if (!identity) throw new DomainError('NOT_FOUND', 404, 'Review subject unavailable');
  const [admin] = await tx
    .select({ id: adminAccounts.userId })
    .from(adminAccounts)
    .where(eq(adminAccounts.userId, userId));
  return { identity, adminLinked: Boolean(admin) };
}
export function reviewMetadata(row: {
  id: string;
  userId: string;
  kind: string;
  status: string;
  version: number;
  submittedAt: Date;
  updatedAt: Date;
}) {
  return profileReviewMetadataSchema.parse({
    id: row.id,
    userId: row.userId,
    kind: row.kind,
    status: row.status,
    version: row.version,
    submittedAt: row.submittedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}
export function profileReviewFailure(error: unknown): never {
  if (error instanceof DomainError) throw error;
  const cause = error instanceof Error ? error.cause : undefined;
  const value = typeof cause === 'object' && cause !== null && 'code' in cause ? cause : error;
  if (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    ['23505', '23514', '23503'].includes(String(value.code))
  )
    throw new DomainError(
      'CONFLICT',
      409,
      'Review conflicts with current records. Refresh before retrying.',
    );
  throw new DomainError('INTERNAL', 503, 'Profile review temporarily unavailable');
}

export const reviewMetadataProjection = {
  id: profileReviewRequests.id,
  userId: profileReviewRequests.userId,
  kind: profileReviewRequests.kind,
  status: profileReviewRequests.status,
  version: profileReviewRequests.version,
  submittedAt: profileReviewRequests.submittedAt,
  updatedAt: profileReviewRequests.updatedAt,
};
