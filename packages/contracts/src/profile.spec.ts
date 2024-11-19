import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { selfProfileSchema } from './profile.js';
it('AUTH-C: self profile exposes only projected identity and capability fields', () => {
  const profile = {
    user: {
      id: randomUUID(),
      fullName: 'Identity',
      email: 'self@example.com',
      emailVerified: true,
      cnicLast4: '5671',
    },
    capabilities: { customer: true, owner: false, managerOf: [], admin: null },
  };
  expect(selfProfileSchema.parse(profile)).toEqual(profile);
  expect(
    selfProfileSchema.safeParse({ ...profile, user: { ...profile.user, cnic: '3520212345671' } })
      .success,
  ).toBe(false);
  expect(selfProfileSchema.safeParse({ ...profile, passwordHash: 'sensitive' }).success).toBe(
    false,
  );
});
