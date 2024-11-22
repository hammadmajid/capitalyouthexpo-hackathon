import { expect, it } from 'vitest';
import {
  invitationState,
  requireInvitationIdentity,
  requireTemporaryReset,
} from './invitation.policy.js';
const identity = {
  id: 'target',
  phoneE164: '+923001234567',
  accountStatus: 'active',
  passwordHash: null,
};
it('AUTH-M-001: invitations expire in 24 hours with a distinct existing-account consent path', () => {
  const now = new Date('2026-10-11T00:00:00Z');
  expect(invitationState('id', 'branch', false, now)).toMatchObject({
    status: 'pending_activation',
    expiresAt: '2026-10-12T00:00:00.000Z',
    acceptance: 'temporary_password',
  });
  expect(invitationState('id', 'branch', true, now).acceptance).toBe('authenticated_account');
});
it('SEC: new identities are allowed while an identity mapping change requires a retry', () => {
  expect(() => requireInvitationIdentity(undefined, 'new', identity.phoneE164)).not.toThrow();
  expect(() => requireInvitationIdentity(identity, identity.id, identity.phoneE164)).not.toThrow();
  expect(() => requireInvitationIdentity(identity, 'different', identity.phoneE164)).toThrow();
  expect(() => requireInvitationIdentity(identity, identity.id, '+923009999999')).toThrow();
});
it.each(['unclaimed', 'suspended', 'banned', 'deactivated'])(
  'SEC: inactive %s identity cannot receive an invitation',
  (accountStatus) => {
    expect(() =>
      requireInvitationIdentity({ ...identity, accountStatus }, identity.id, identity.phoneE164),
    ).toThrow();
  },
);
it('AUTH-M-003 SEC: reset is only for pending passwordless identities, including locked pending invitations', () => {
  expect(() => requireTemporaryReset('pending_activation', null)).not.toThrow();
  expect(() => requireTemporaryReset('pending_activation', 'permanent-hash')).toThrow();
  for (const status of ['active', 'suspended', 'deactivated'])
    expect(() => requireTemporaryReset(status, null)).toThrow();
});
