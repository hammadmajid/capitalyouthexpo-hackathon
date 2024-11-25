// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import type { SelfProfile } from '@hsm/contracts';
import { canEnter, contexts, initialContext } from './capabilities';
const profile: SelfProfile = {
  user: {
    id: randomUUID(),
    fullName: 'Identity',
    email: null,
    emailVerified: true,
    cnicLast4: null,
  },
  capabilities: { customer: false, owner: false, managerOf: [], admin: null },
};
it('SEC-001: absent grants deny every space, including resident access', () => {
  expect(contexts.every((context) => !canEnter(profile, context))).toBe(true);
  expect(initialContext(profile)).toBeUndefined();
});
it.each(['customer', 'owner'] as const)(
  'SEC-001: account capabilities enable only their named space',
  (kind) => {
    const granted = { ...profile, capabilities: { ...profile.capabilities, [kind]: true } };
    expect(canEnter(granted, kind)).toBe(true);
    expect(initialContext(granted)).toBe(kind);
    expect(canEnter(granted, 'resident')).toBe(false);
  },
);
it('SEC-001: manager and admin spaces require backend-provided grants', () => {
  expect(
    canEnter(
      {
        ...profile,
        capabilities: {
          ...profile.capabilities,
          managerOf: [{ branchId: randomUUID(), branchName: 'Scoped branch' }],
        },
      },
      'manager',
    ),
  ).toBe(true);
  expect(
    canEnter(
      {
        ...profile,
        capabilities: { ...profile.capabilities, admin: { isRoot: false, roles: ['support'] } },
      },
      'admin',
    ),
  ).toBe(true);
});
