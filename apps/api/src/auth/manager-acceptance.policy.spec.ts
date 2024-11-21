import { expect, it } from 'vitest';
import {
  requirePendingManagerInvitation,
  type PendingManagerInvitation,
} from './manager-acceptance.policy.js';
const now = new Date('2026-10-10T12:00:00Z');
const pending: PendingManagerInvitation = {
  status: 'pending_activation',
  lockedAt: null,
  tempPasswordAttempts: 0,
  tempPasswordExpiresAt: new Date(now.getTime() + 1000),
};
it('AUTH-M CHG-006: authenticated acceptance retains pending invitation policy and exact identity', () => {
  expect(requirePendingManagerInvitation(pending, now)).toBe(pending);
  expect(
    requirePendingManagerInvitation({ ...pending, tempPasswordAttempts: 4 }, now),
  ).toMatchObject({
    tempPasswordAttempts: 4,
  });
});
it('SEC: no assigned invitation stays opaque', () => {
  expect(() => requirePendingManagerInvitation(undefined, now)).toThrowError(
    expect.objectContaining({ code: 'NOT_FOUND', status: 404 }),
  );
});
it.each<Partial<PendingManagerInvitation>>([
  { status: 'active' },
  { status: 'suspended' },
  { status: 'deactivated' },
  { lockedAt: now },
  { tempPasswordAttempts: 5 },
  { tempPasswordExpiresAt: null },
  { tempPasswordExpiresAt: now },
  { tempPasswordExpiresAt: new Date(now.getTime() - 1) },
])('SEC: permanent authentication cannot bypass invitation status, lockout or expiry', (patch) => {
  expect(() => requirePendingManagerInvitation({ ...pending, ...patch }, now)).toThrowError(
    expect.objectContaining({ code: 'CONFLICT', status: 409 }),
  );
});
