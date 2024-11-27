import { expect, it } from 'vitest';
import { ApiFailure } from '@hsm/api-client';
import { z } from 'zod';
import { customerProfileError } from './customer-profile-error';
function conflict(detail: string) {
  return new ApiFailure({
    type: 'https://example.test/problem',
    title: 'Conflict',
    status: 409,
    code: 'CONFLICT',
    detail,
    traceId: 'fixture',
  });
}
it('AUTH-C: only the known identity-review conflict gives correction guidance', () => {
  expect(customerProfileError(conflict('Identity correction requires review'))).toContain(
    'identity review',
  );
  expect(customerProfileError(conflict('private SQL diagnostic'))).not.toContain('private SQL');
  expect(customerProfileError(new Error('private provider diagnostic'))).not.toContain(
    'private provider',
  );
});
it.each(['age', 'phone', 'fullName', 'gender', 'institution'])(
  'AUTH-C: %s validation has a safe useful message',
  (field) => {
    const error = new z.ZodError([{ code: 'custom', path: [field], message: 'private input' }]);
    expect(customerProfileError(error)).not.toContain('private input');
    expect(customerProfileError(error)).not.toContain('Unable to continue');
  },
);
