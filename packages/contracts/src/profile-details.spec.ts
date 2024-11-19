import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { profileDetailsSchema } from './profile-details.js';
const identity = {
  userId: randomUUID(),
  fullName: '',
  email: null,
  emailVerified: false,
  phone: null,
  gender: null,
  cnicLast4: null,
  profilePhotoFileId: null,
  customer: null,
  owner: null,
};
it('AUTH-C CHG-006: uncompleted and phone-only self identities have explicit nullable edit details', () => {
  expect(profileDetailsSchema.parse(identity)).toEqual(identity);
});
it('AUTH-C CHG-006: completed profiles retain editable adult age and private evidence references with masked CNIC', () => {
  const value = {
    ...identity,
    fullName: 'Profile identity',
    email: 'profile@example.test',
    emailVerified: true,
    phone: '+923001234567',
    gender: 'male',
    cnicLast4: '5671',
    profilePhotoFileId: randomUUID(),
    customer: { age: 26, institution: 'Institution', completed: true },
    owner: {
      address: 'Owner address',
      cnicFrontFileId: randomUUID(),
      cnicBackFileId: randomUUID(),
      agreementVersion: 'owner-foundation-v1',
      agreementAcceptedAt: '2026-10-11T12:00:00.000Z',
      completed: true,
    },
  };
  expect(profileDetailsSchema.parse(value)).toEqual(value);
});
it.each([
  'passwordHash',
  'cnic',
  'cnicHash',
  'cnicEncrypted',
  'setupToken',
  'accessToken',
  'uploadUrl',
  'signedUrl',
])('SEC-003: edit projection rejects unexpected sensitive field %s', (field) => {
  expect(profileDetailsSchema.safeParse({ ...identity, [field]: 'private' }).success).toBe(false);
});
it.each([17, 121, 18.5])('AUTH-C: invalid persisted age %s cannot reach an edit form', (age) => {
  expect(
    profileDetailsSchema.safeParse({
      ...identity,
      customer: { age, institution: null, completed: true },
    }).success,
  ).toBe(false);
});
it('SEC-003: nested projection cannot include storage capabilities or an unmasked CNIC', () => {
  expect(profileDetailsSchema.safeParse({ ...identity, cnicLast4: '6110112345671' }).success).toBe(
    false,
  );
  expect(
    profileDetailsSchema.safeParse({
      ...identity,
      customer: { age: 18, institution: null, completed: true, signedUrl: 'private' },
    }).success,
  ).toBe(false);
});
