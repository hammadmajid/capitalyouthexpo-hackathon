import { expect, it } from 'vitest';
import { ApiFailure, RetainedCommandFailure } from '@hsm/api-client';
import type { ErrorCode } from '@hsm/contracts';
import { safeMessage } from './messages';
it.each(['PENDING', 'UNRESOLVED', 'EXPIRED'] as const)(
  'PAY-008: %s has safe recovery guidance',
  (code) => {
    expect(safeMessage(new RetainedCommandFailure(code))).toContain(
      code === 'EXPIRED' ? 'reconciliation' : 'original details',
    );
  },
);
it.each<ErrorCode>([
  'SESSION_REVOKED',
  'UNAUTHENTICATED',
  'TOKEN_EXPIRED',
  'FORBIDDEN',
  'RATE_LIMITED',
  'IMPORT_ALREADY_COMMITTED',
  'EMAIL_NOT_VERIFIED',
  'VALIDATION_FAILED',
  'INTERNAL',
])('SEC-001: %s does not expose problem payloads', (code) => {
  const error = new ApiFailure({
    type: 'https://example.com/problem',
    title: 'private',
    detail: 'private',
    status: 401,
    code,
    // CHG-038: the short trace reference is shown on purpose so support can find the error;
    // the problem's title and detail must never be.
    traceId: 'trace-0001',
  });
  expect(safeMessage(error)).not.toContain('private');
});
it('SEC-001: unknown failures are safe', () => {
  expect(safeMessage(new Error('private'))).not.toContain('private');
});

it('AUTH-C OWN-001: identity collision gives safe actionable guidance instead of a generic failure', () => {
  const error = new ApiFailure({
    type: 'urn:hsm:error:identity_exists',
    title: 'private',
    detail: 'private',
    status: 409,
    code: 'IDENTITY_EXISTS',
    traceId: 'private',
  });
  expect(safeMessage(error)).toBe(
    'This mobile number or CNIC is already linked to another account. Sign in to that account or use your own unlinked details.',
  );
  expect(safeMessage(error)).not.toContain('private');
});
it('AUTH-C OWN-001: identity collision names only the caller’s own conflicting field', () => {
  const failure = (path: string) =>
    new ApiFailure({
      type: 'urn:hsm:error:identity_exists',
      title: 'private',
      detail: 'private',
      status: 409,
      code: 'IDENTITY_EXISTS',
      traceId: 'private',
      errors: [{ path, code: 'identity_exists', message: 'private' }],
    });
  expect(safeMessage(failure('phone'))).toContain('This mobile number is already linked');
  expect(safeMessage(failure('cnic'))).toContain('This CNIC is already linked');
  expect(safeMessage(failure('other'))).toContain('mobile number or CNIC');
  expect(safeMessage(failure('phone'))).not.toContain('private');
});
it('AUTH-M-003: a common password is named instead of a generic validation failure', () => {
  const problem = (detail: string) =>
    new ApiFailure({
      type: 'https://example.com/problem',
      title: 'private',
      detail,
      status: 400,
      code: 'VALIDATION_FAILED',
      traceId: 'private',
    });
  expect(safeMessage(problem('Choose a stronger password'))).toBe(
    'Choose a stronger password. Common ones like "password" are not allowed.',
  );
  // A bare code/title is not shown; a written input problem is (CHG-038).
  expect(safeMessage(problem('private'))).toBe('Some details are missing or not valid.');
  expect(safeMessage(problem('Start before end'))).toBe('Start before end.');
});
it('AUTH-M-003: wrong sign-in or activation details say so plainly', () => {
  const error = new ApiFailure({
    type: 'https://example.com/problem',
    title: 'private',
    detail: 'private',
    status: 401,
    code: 'INVALID_CREDENTIALS',
    traceId: 'private',
  });
  expect(safeMessage(error)).toBe('Mobile number, email or password is incorrect.');
});
