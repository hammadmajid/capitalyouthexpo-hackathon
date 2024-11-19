import { expect, it } from 'vitest';
import {
  emailAssociationRequestSchema,
  emailAssociationVerificationSchema,
} from './email-association.js';
it('AUTH-M CHG-006: association requests normalize email and retain explicit permanent-password confirmation', () => {
  expect(
    emailAssociationRequestSchema.parse({
      email: 'Manager@EXAMPLE.TEST',
      currentPassword: 'Permanent password phrase',
    }),
  ).toEqual({ email: 'manager@example.test', currentPassword: 'Permanent password phrase' });
  expect(
    emailAssociationVerificationSchema.parse({ email: 'Manager@EXAMPLE.TEST', code: '123456' }),
  ).toEqual({ email: 'manager@example.test', code: '123456' });
});
it.each(['userId', 'sessionId', 'emailVerifiedAt', 'managerOf', 'newPassword'])(
  'SEC: association cannot accept caller-supplied %s identity/privilege fields',
  (field) => {
    expect(
      emailAssociationRequestSchema.safeParse({
        email: 'manager@example.test',
        currentPassword: 'Permanent password phrase',
        [field]: 'untrusted',
      }).success,
    ).toBe(false);
    expect(
      emailAssociationVerificationSchema.safeParse({
        email: 'manager@example.test',
        code: '123456',
        [field]: 'untrusted',
      }).success,
    ).toBe(false);
  },
);
it.each([
  { email: 'invalid', code: '123456' },
  { email: 'manager@example.test', code: '12345' },
  { email: 'manager@example.test', code: '1234567' },
  { email: 'manager@example.test', code: 'abcdef' },
])('AUTH-M SEC: invalid association proof rejects before dispatch %#', (input) => {
  expect(emailAssociationVerificationSchema.safeParse(input).success).toBe(false);
});
