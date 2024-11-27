import { expect, it } from 'vitest';
import { canEnter, contexts } from './capabilities';
const profile = {
  user: { id: 'identity', fullName: 'Identity', email: null, emailVerified: true, cnicLast4: null },
  capabilities: { customer: false, owner: false, managerOf: [], admin: null },
};
it('ACC-002: all mobile contexts deny absent backend capabilities', () => {
  expect(contexts.filter((context) => canEnter(profile, context))).toEqual([]);
});
it('ACC-002: simultaneous capabilities remain separate from presentation modes', () => {
  const granted = {
    ...profile,
    capabilities: {
      customer: true,
      owner: true,
      managerOf: [{ branchId: 'branch', branchName: 'Branch' }],
      admin: { isRoot: true, roles: [] },
    },
  };
  expect(contexts.filter((context) => canEnter(granted, context))).toEqual([
    'customer',
    'owner',
    'manager',
    'admin',
  ]);
  expect(canEnter(granted, 'resident')).toBe(false);
});
