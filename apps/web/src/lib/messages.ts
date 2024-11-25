import { ApiFailure, ClientFailure, RetainedCommandFailure } from '@hsm/api-client';
export function errorMessage(error: unknown) {
  if (error instanceof RetainedCommandFailure)
    return error.code === 'EXPIRED'
      ? 'The previous request needs reconciliation. Check its server history with support before recording another action.'
      : 'The previous request is unresolved. Retry its original details before making another change.';
  if (error instanceof ClientFailure)
    return error.code === 'NETWORK_UNAVAILABLE'
      ? 'We could not connect. Please try again.'
      : 'We could not read the response. Please try again.';
  if (error instanceof ApiFailure) {
    switch (error.code) {
      case 'INVALID_CREDENTIALS':
        return 'Check your sign-in details and try again.';
      case 'EMAIL_NOT_VERIFIED':
        return 'Verify your email before signing in.';
      case 'TOKEN_EXPIRED':
      case 'UNAUTHENTICATED':
      case 'SESSION_REVOKED':
        return 'Your session has ended. Please sign in again.';
      case 'ACCOUNT_SUSPENDED':
        return 'This account is unavailable. Contact support.';
      case 'RATE_LIMITED':
        return 'Too many attempts. Please wait before trying again.';
      case 'IMPORT_ALREADY_COMMITTED':
        return 'This CSV content was already imported. Refresh current inventory before importing another file.';
      case 'FORBIDDEN':
      case 'BRANCH_FORBIDDEN':
        return 'You do not have access to this space.';
      default:
        return 'We could not complete this request. Please try again.';
    }
  }
  return 'We could not complete this request. Please try again.';
}
