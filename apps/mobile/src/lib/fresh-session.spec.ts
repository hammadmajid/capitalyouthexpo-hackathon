import { beforeEach, expect, it, vi } from 'vitest';
import { ApiFailure } from '@hsm/api-client';
const restore = vi.fn();
vi.mock('./runtime', () => ({ sessions: { restore: () => restore() } }));
import { withFreshSession } from './fresh-session';
const failure = (code: 'TOKEN_EXPIRED' | 'UNAUTHENTICATED' | 'FORBIDDEN') =>
  new ApiFailure({ type: 'urn:x', title: 't', detail: 'd', status: 401, code, traceId: 'r' });
beforeEach(() => restore.mockReset());
it('SEC-001: an expired token refreshes through the session manager and retries once', async () => {
  restore.mockResolvedValue({ user: { id: 'u' } });
  const work = vi.fn().mockRejectedValueOnce(failure('TOKEN_EXPIRED')).mockResolvedValue('ok');
  await expect(withFreshSession(work)).resolves.toBe('ok');
  expect(restore).toHaveBeenCalledTimes(1);
  expect(work).toHaveBeenCalledTimes(2);
});
it('SEC-001: other failures and failed restores are never retried or masked', async () => {
  const forbidden = vi.fn().mockRejectedValue(failure('FORBIDDEN'));
  await expect(withFreshSession(forbidden)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(restore).not.toHaveBeenCalled();
  restore.mockResolvedValue(undefined);
  const expired = vi.fn().mockRejectedValue(failure('UNAUTHENTICATED'));
  await expect(withFreshSession(expired)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  expect(expired).toHaveBeenCalledTimes(1);
  restore.mockResolvedValue({ user: { id: 'u' } });
  const twice = vi.fn().mockRejectedValue(failure('TOKEN_EXPIRED'));
  await expect(withFreshSession(twice)).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' });
  expect(twice).toHaveBeenCalledTimes(2);
});
