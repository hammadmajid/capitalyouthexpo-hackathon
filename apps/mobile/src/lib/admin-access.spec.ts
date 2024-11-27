import { expect, it } from 'vitest';
import type { SelfProfile } from '@hsm/contracts';
import { adminSignature, canUseAdmin, isAdminKey } from './admin-access';
const base = { user: { id: 'actor' }, capabilities: { admin: null } } as SelfProfile;
it('ADM-001 SEC-001: identity or phone alone never grants Admin or Root', () => {
  expect(canUseAdmin(base)).toBe(false);
  expect(canUseAdmin(base, true)).toBe(false);
});
it('ADM-001..003: Normal Admin cannot enter Root routes; simultaneous Customer is independent', () => {
  const normal = {
    ...base,
    capabilities: {
      ...base.capabilities,
      customer: true,
      admin: { isRoot: false, roles: ['support'] },
    },
  } as SelfProfile;
  expect(canUseAdmin(normal)).toBe(true);
  expect(canUseAdmin(normal, true)).toBe(false);
  expect(
    canUseAdmin(
      { ...normal, capabilities: { ...normal.capabilities, admin: { isRoot: true, roles: [] } } },
      true,
    ),
  ).toBe(true);
});
it('SEC-003: actor/Root/role changes invalidate staff authorization and keys are scoped', () => {
  const root = {
    ...base,
    capabilities: { ...base.capabilities, admin: { isRoot: true, roles: [] } },
  };
  expect(adminSignature(root)).not.toBe(adminSignature(base));
  expect(adminSignature(root)).not.toBe(
    adminSignature({ ...root, user: { ...root.user, id: 'other' } }),
  );
  expect(isAdminKey(['platform-admin', 'actor'])).toBe(true);
  expect(isAdminKey(['owner-dashboard', 'actor'])).toBe(false);
});
