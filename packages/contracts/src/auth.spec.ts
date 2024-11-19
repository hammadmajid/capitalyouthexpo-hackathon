import { expect, it } from 'vitest';
import {
  emailRequestSchema,
  emailVerificationSessionSchema,
  passwordResetSchema,
  passwordChangeSchema,
  managerActivationSchema,
  refreshRequestSchema,
} from './auth.js';
it('AUTH-C-002: authentication request boundaries normalize email and reject unknown fields', () => {
  expect(emailRequestSchema.parse({ email: 'USER@example.com' })).toEqual({
    email: 'user@example.com',
  });
  expect(
    emailVerificationSessionSchema.parse({ email: 'USER@example.com', code: '123456' }).client,
  ).toBe('mobile');
  expect(
    emailVerificationSessionSchema.parse({
      email: 'user@example.com',
      code: '123456',
      client: 'web',
    }).client,
  ).toBe('web');
  expect(
    passwordResetSchema.parse({
      email: 'USER@example.com',
      code: '123456',
      newPassword: 'strong phrase',
    }).email,
  ).toBe('user@example.com');
  expect(refreshRequestSchema.parse({})).toEqual({});
  expect(refreshRequestSchema.parse({ refreshToken: 'r'.repeat(48) }).refreshToken).toHaveLength(
    48,
  );
  expect(
    emailRequestSchema.safeParse({ email: 'user@example.com', password: 'extra' }).success,
  ).toBe(false);
  expect(
    passwordResetSchema.safeParse({ email: 'user@example.com', code: 'bad', newPassword: 'short' })
      .success,
  ).toBe(false);
  expect(refreshRequestSchema.safeParse({ refreshToken: 'short' }).success).toBe(false);
});

it('SEC: password change rejects unknown identity fields and short passwords', () => {
  const input = { currentPassword: 'Current secure phrase', newPassword: 'Next secure phrase' };
  expect(passwordChangeSchema.parse(input)).toEqual(input);
  expect(passwordChangeSchema.safeParse({ ...input, userId: 'foreign' }).success).toBe(false);
  expect(passwordChangeSchema.safeParse({ ...input, newPassword: 'short' }).success).toBe(false);
});

it('AUTH-M-004: activation supports both client transports with strict identity boundaries', () => {
  const input = {
    phone: '+923001234567',
    tempPassword: 'Temporary phrase',
    newPassword: 'Permanent phrase',
  };
  expect(managerActivationSchema.parse(input).client).toBe('mobile');
  expect(managerActivationSchema.parse({ ...input, client: 'web' }).client).toBe('web');
  expect(managerActivationSchema.safeParse({ ...input, branchId: 'foreign' }).success).toBe(false);
});
