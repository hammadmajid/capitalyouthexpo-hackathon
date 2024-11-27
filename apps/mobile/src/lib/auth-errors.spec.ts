import { expect, it } from 'vitest';
import { managerActivationSchema } from '@hsm/contracts';
import { authErrorMessage } from './auth-errors';
it('AUTH-M-003: an invalid activation field is named', () => {
  const result = managerActivationSchema.safeParse({
    phone: '12345',
    tempPassword: 'short',
    newPassword: 'Replacement 12',
  });
  if (result.success) throw Error('expected failure');
  expect(authErrorMessage(result.error)).toBe(
    'Check: mobile number (03XXXXXXXXX), temporary password (8+ characters)',
  );
});
