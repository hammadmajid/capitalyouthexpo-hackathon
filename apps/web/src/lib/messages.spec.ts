// @vitest-environment node
import { expect, it } from 'vitest';
import { ApiFailure, ClientFailure, RetainedCommandFailure } from '@hsm/api-client';
import type { ErrorCode } from '@hsm/contracts';
import { errorMessage } from './messages';
it.each(['PENDING', 'UNRESOLVED', 'EXPIRED'] as const)(
  'PAY-008: %s has safe recovery guidance',
  (code) => {
    expect(errorMessage(new RetainedCommandFailure(code))).toContain(
      code === 'EXPIRED' ? 'reconciliation' : 'original details',
    );
  },
);
it.each([
  'INVALID_CREDENTIALS',
  'EMAIL_NOT_VERIFIED',
  'TOKEN_EXPIRED',
  'UNAUTHENTICATED',
  'SESSION_REVOKED',
  'ACCOUNT_SUSPENDED',
  'RATE_LIMITED',
  'IMPORT_ALREADY_COMMITTED',
  'FORBIDDEN',
  'BRANCH_FORBIDDEN',
  'INTERNAL',
] as ErrorCode[])('SEC-003: server detail never becomes a user-facing error', (code) => {
  const failure = new ApiFailure({
    type: 'https://example.com/problem',
    title: 'PRIVATE_MARKER',
    code,
    status: 403,
    detail: 'PRIVATE_MARKER',
    traceId: 'trace',
  });
  expect(errorMessage(failure)).not.toContain('PRIVATE_MARKER');
  expect(errorMessage(failure).length).toBeGreaterThan(10);
});
it.each(['NETWORK_UNAVAILABLE', 'INVALID_RESPONSE'] as const)(
  'SEC-003: client errors have actionable safe messages',
  (code) => {
    expect(errorMessage(new ClientFailure(code)).length).toBeGreaterThan(10);
  },
);
it('SEC-003: unknown exceptions have no private detail', () => {
  expect(errorMessage(new Error('PRIVATE_MARKER'))).not.toContain('PRIVATE_MARKER');
});
