import { DomainError } from '@hsm/contracts';
import type { files } from '@hsm/db';
type Kind = 'identity' | 'profile_photo';
type State = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'withdrawn';
type Action = 'approve' | 'reject' | 'withdraw' | 'cancel';
// HMA-015: reviewed identity changes are Root-only; photo decisions use moderation authority.
export function authorizeProfileReview(input: {
  kind: Kind;
  actorId: string;
  subjectId: string;
  subjectAdminLinked: boolean;
  isRoot: boolean;
  roles: readonly string[];
}) {
  if (input.actorId === input.subjectId || input.subjectAdminLinked)
    throw new DomainError(
      'FORBIDDEN',
      403,
      'Privileged identity changes require the separate manual process',
    );
  if (!input.isRoot && (input.kind === 'identity' || !input.roles.includes('content_moderator')))
    throw new DomainError('FORBIDDEN', 403, 'Profile review authority required');
}
export function nextProfileReviewState(
  kind: Kind,
  state: State,
  action: Action,
  currentVersion: number,
  expectedVersion: number,
): State {
  if (currentVersion >= 2147483647)
    throw new DomainError('CONFLICT', 409, 'Review revision limit reached');
  if (currentVersion !== expectedVersion)
    throw new DomainError(
      'CONFLICT',
      409,
      'Review changed. Reload its current revision before deciding.',
    );
  if (state === 'pending' && action !== 'withdraw')
    return action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'cancelled';
  if (kind === 'profile_photo' && state === 'approved' && action === 'withdraw') return 'withdrawn';
  throw new DomainError('CONFLICT', 409, 'Decision is unavailable for this review state');
}
type ReviewFile = Pick<
  typeof files.$inferSelect,
  | 'id'
  | 'uploadedBy'
  | 'bucket'
  | 'objectKey'
  | 'visibility'
  | 'purpose'
  | 'scanStatus'
  | 'sha256'
  | 'mimeType'
>;
export function requireProfileReviewFile(
  file: ReviewFile | undefined,
  subjectId: string,
  bucket: string,
  purpose: 'avatar' | 'verification_document',
) {
  if (
    !file ||
    file.uploadedBy !== subjectId ||
    file.bucket !== bucket ||
    file.purpose !== purpose ||
    file.visibility !== 'private' ||
    file.scanStatus !== 'clean' ||
    file.sha256?.length !== 32 ||
    !file.objectKey.startsWith('private/' + purpose + '/' + file.id + '/')
  )
    throw new DomainError('NOT_FOUND', 404, 'Review evidence unavailable');
  return file;
}
