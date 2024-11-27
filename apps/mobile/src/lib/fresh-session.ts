import { ApiFailure } from '@hsm/api-client';
import { sessions } from './runtime';
// Access tokens expire (~10 min) between the provider's periodic restores. A read that fails
// only because the token expired refreshes through the serialized session manager and is
// retried once; any other failure, or a second expiry, is returned unchanged.
export async function withFreshSession<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (
      !(error instanceof ApiFailure) ||
      !['UNAUTHENTICATED', 'TOKEN_EXPIRED'].includes(error.code)
    )
      throw error;
    if (!(await sessions.restore())) throw error;
    return work();
  }
}
