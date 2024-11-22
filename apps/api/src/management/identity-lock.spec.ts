import { beforeEach, expect, it, vi } from 'vitest';
import type { Transaction } from '../audit/writer.js';
import { lockParticipants } from './identity-lock.js';
const actor = { userId: 'b', sessionId: 'session' };
const now = new Date();
const session = { revokedAt: null, expiresAt: new Date(now.getTime() + 60000) };
const rows = vi.fn();
const chain = {
  from: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  for: rows,
  then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
    rows().then(resolve, reject),
};
const transaction = { select: vi.fn(() => chain) };
beforeEach(() => {
  vi.clearAllMocks();
  for (const method of ['from', 'where', 'orderBy'] as const) chain[method].mockReturnValue(chain);
  rows.mockResolvedValueOnce([{ id: 'b', status: 'active' }]).mockResolvedValueOnce([session]);
});
it('SEC-001: participant rows lock in database order before fresh session validation', async () => {
  const clock = vi.fn(() => now);
  await lockParticipants(transaction as unknown as Transaction, actor, 'a', clock);
  expect(chain.orderBy).toHaveBeenCalledOnce();
  expect(chain.for).toHaveBeenCalledWith('update');
  expect(clock).toHaveBeenCalledOnce();
});
it('SEC-001: self-targeting deduplicates identity locks', async () => {
  await lockParticipants(transaction as unknown as Transaction, actor, actor.userId, () => now);
  expect(transaction.select).toHaveBeenCalledTimes(2);
});
it('SEC-001: absent actor is rejected', async () => {
  rows.mockReset().mockResolvedValueOnce([]);
  await expect(
    lockParticipants(transaction as unknown as Transaction, actor, 'a', () => now),
  ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
});
it('SEC-001: suspended actor is rejected before reading a session', async () => {
  rows.mockReset().mockResolvedValueOnce([{ id: 'b', status: 'suspended' }]);
  await expect(
    lockParticipants(transaction as unknown as Transaction, actor, 'a', () => now),
  ).rejects.toMatchObject({ code: 'ACCOUNT_SUSPENDED' });
});
it('SEC-001: revoked session is rejected after identity locks', async () => {
  rows
    .mockReset()
    .mockResolvedValueOnce([{ id: 'b', status: 'active' }])
    .mockResolvedValueOnce([{ ...session, revokedAt: now }]);
  await expect(
    lockParticipants(transaction as unknown as Transaction, actor, 'a', () => now),
  ).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
});
