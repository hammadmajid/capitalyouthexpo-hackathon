import { DomainError, type ManagerInvitationState } from '@hsm/contracts';
type Identity = {
  id: string;
  phoneE164: string | null;
  accountStatus: string;
  passwordHash: string | null;
};
export function requireInvitationIdentity(
  identity: Identity | undefined,
  id: string,
  phone: string,
) {
  if (identity && (identity.id !== id || identity.phoneE164 !== phone))
    throw new DomainError('CONFLICT', 409, 'Invitation identity changed; retry');
  if (identity && identity.accountStatus !== 'active')
    throw new DomainError('CONFLICT', 409, 'Invitation unavailable');
}
export function requireTemporaryReset(status: string, passwordHash: string | null) {
  if (status !== 'pending_activation' || passwordHash !== null)
    throw new DomainError('CONFLICT', 409, 'Temporary password reset unavailable');
}
export function invitationState(
  id: string,
  branchId: string,
  permanentPassword: boolean,
  now: Date,
): ManagerInvitationState {
  return {
    id,
    branchId,
    status: 'pending_activation',
    expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    acceptance: permanentPassword ? 'authenticated_account' : 'temporary_password',
  };
}
