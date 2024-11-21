import { DomainError } from '@hsm/contracts';
import type { users } from '@hsm/db';
import { requireActiveAccount } from './session.policy.js';
export type ProfileIdentity = Pick<
  typeof users.$inferSelect,
  'id' | 'fullName' | 'email' | 'emailVerifiedAt' | 'passwordHash' | 'accountStatus'
>;
export function requireProfileIdentity<T extends ProfileIdentity>(
  identity: T | undefined,
  fullName: string,
): T {
  if (!identity) throw new DomainError('UNAUTHENTICATED', 401, 'Identity unavailable');
  requireActiveAccount(identity.accountStatus);
  if (!identity.email || !identity.emailVerifiedAt)
    throw new DomainError('EMAIL_NOT_VERIFIED', 403, 'Email verification required');
  if (!identity.passwordHash)
    throw new DomainError('INVALID_CREDENTIALS', 401, 'Permanent password required');
  if (identity.fullName !== '' && identity.fullName !== fullName)
    throw new DomainError('CONFLICT', 409, 'Identity correction requires review', 'fullName');
  return identity;
}
