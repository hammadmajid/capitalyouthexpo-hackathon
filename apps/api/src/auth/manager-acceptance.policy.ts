import { DomainError } from '@hsm/contracts';
import type { ManagerInvitation } from './manager.store.js';
export type PendingManagerInvitation = Pick<
  ManagerInvitation,
  'status' | 'lockedAt' | 'tempPasswordAttempts' | 'tempPasswordExpiresAt'
>;
export function requirePendingManagerInvitation<T extends PendingManagerInvitation>(
  invitation: T | undefined,
  now: Date,
) {
  if (!invitation) throw new DomainError('NOT_FOUND', 404, 'Invitation unavailable');
  if (
    invitation.status !== 'pending_activation' ||
    invitation.lockedAt ||
    invitation.tempPasswordAttempts >= 5 ||
    !invitation.tempPasswordExpiresAt ||
    invitation.tempPasswordExpiresAt <= now
  )
    throw new DomainError('CONFLICT', 409, 'Invitation unavailable');
  return invitation;
}
