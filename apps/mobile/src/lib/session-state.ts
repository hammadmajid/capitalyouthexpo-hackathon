import { ApiFailure, ClientFailure } from '@hsm/api-client';
import type { SelfProfile } from '@hsm/contracts';
import { SecureStorageFailure } from './vault';
export type SessionState =
  | { phase: 'restoring' }
  | { phase: 'authenticated'; profile: SelfProfile }
  | { phase: 'guest'; notice?: string }
  | { phase: 'unavailable'; error: unknown }
  | { phase: 'cleanup'; error: SecureStorageFailure; allDevices: boolean };
const terminal = new Set([
  'UNAUTHENTICATED',
  'TOKEN_EXPIRED',
  'SESSION_REVOKED',
  'FORBIDDEN',
  'ACCOUNT_SUSPENDED',
]);
export function restoredState(profile: SelfProfile | undefined): SessionState {
  return profile ? { phase: 'authenticated', profile } : { phase: 'guest' };
}
export function restoreFailureState(error: unknown): SessionState {
  return error instanceof ApiFailure && terminal.has(error.code)
    ? { phase: 'guest', notice: 'Your session has ended. Please sign in again.' }
    : { phase: 'unavailable', error };
}
// No connection, or the server failed (5xx): the session itself was not refused.
export function transientFailure(error: unknown) {
  if (error instanceof ClientFailure) return error.code === 'NETWORK_UNAVAILABLE';
  return error instanceof ApiFailure && error.problem.status >= 500;
}
export function logoutFailureState(error: unknown, allDevices: boolean): SessionState {
  return error instanceof SecureStorageFailure && error.operation === 'remove'
    ? { phase: 'cleanup', error, allDevices }
    : {
        phase: 'guest',
        notice:
          'This device is signed out. Server sign-out could not be confirmed. Sign in and try again.',
      };
}
