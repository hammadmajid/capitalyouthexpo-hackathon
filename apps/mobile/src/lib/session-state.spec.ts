import { expect, it } from 'vitest';
import { ApiFailure } from '@hsm/api-client';
import type { ErrorCode } from '@hsm/contracts';
import { SecureStorageFailure } from './vault';
import { restoredState, restoreFailureState, logoutFailureState } from './session-state';
const profile = {
  user: { id: 'identity', fullName: 'Identity', email: null, emailVerified: true, cnicLast4: null },
  capabilities: { customer: true, owner: false, managerOf: [], admin: null },
};
it('SEC-001: only a verified profile produces authenticated presentation', () => {
  expect(restoredState(profile)).toEqual({ phase: 'authenticated', profile });
  expect(restoredState(undefined)).toEqual({ phase: 'guest' });
});
it.each<ErrorCode>([
  'UNAUTHENTICATED',
  'TOKEN_EXPIRED',
  'SESSION_REVOKED',
  'FORBIDDEN',
  'ACCOUNT_SUSPENDED',
])('SEC-001: %s ends presentation without exposing backend details', (code) => {
  const state = restoreFailureState(
    new ApiFailure({
      type: 'https://example.com/problem',
      title: 'private',
      status: 401,
      code,
      detail: 'private',
      traceId: 'fixture',
    }),
  );
  expect(state.phase).toBe('guest');
  expect(JSON.stringify(state)).not.toContain('private');
});
it('SEC-001: transient restoration failures remain unavailable and cannot grant access', () => {
  const error = new Error('Unavailable');
  expect(restoreFailureState(error)).toEqual({ phase: 'unavailable', error });
  const rejected = new ApiFailure({
    type: 'https://example.com/problem',
    title: 'Rejected',
    status: 429,
    code: 'RATE_LIMITED',
    detail: 'Unavailable',
    traceId: 'fixture',
  });
  expect(restoreFailureState(rejected)).toEqual({ phase: 'unavailable', error: rejected });
});
it.each([false, true])(
  'SEC-001: failed credential deletion blocks completion for all=%s',
  (allDevices) => {
    const error = new SecureStorageFailure('remove');
    expect(logoutFailureState(error, allDevices)).toEqual({ phase: 'cleanup', error, allDevices });
  },
);
it.each(['read', 'write'] as const)(
  'SEC-001: %s failure followed by successful local cleanup never claims server revocation',
  (operation) => {
    expect(logoutFailureState(new SecureStorageFailure(operation), true).phase).toBe('guest');
  },
);
it('SEC-001: server outage after local cleanup preserves a truthful notice', () => {
  expect(logoutFailureState(new Error('private'), true)).toEqual({
    phase: 'guest',
    notice:
      'This device is signed out. Server sign-out could not be confirmed. Sign in and try again.',
  });
});
