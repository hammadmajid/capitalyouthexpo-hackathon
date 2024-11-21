import { beforeEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Database } from '@hsm/db';
import { OtpRepository } from './otp.repository.js';
const actorId = randomUUID();
const database = { select: vi.fn(), insert: vi.fn(), update: vi.fn(), transaction: vi.fn() };
const chain = {
  from: vi.fn(),
  where: vi.fn(),
  for: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  values: vi.fn(),
  onConflictDoNothing: vi.fn(),
  set: vi.fn(),
};
beforeEach(() => {
  vi.resetAllMocks();
  database.select.mockReturnValue(chain);
  database.insert.mockReturnValue(chain);
  database.update.mockReturnValue(chain);
  for (const method of ['from', 'where', 'orderBy', 'set'] as const)
    chain[method].mockReturnValue(chain);
  chain.for.mockResolvedValue([{ id: actorId, email: 'otp@example.com' }]);
  chain.limit.mockResolvedValue([{ id: 'otp' }]);
  chain.values.mockReturnValue(chain);
  chain.onConflictDoNothing.mockResolvedValue(undefined);
  database.transaction.mockImplementation(async (work: (value: unknown) => Promise<unknown>) =>
    work(database),
  );
});
const repository = () => new OtpRepository(database as unknown as Database);
it('SEC: identity lock encloses OTP lookup, hash/outbox persistence, attempts and consumption', async () => {
  const now = new Date();
  await repository().transaction('otp@example.com', async (transaction) => {
    expect(chain.for).toHaveBeenCalledWith('update');
    expect(await transaction.latest('signup_verify')).toEqual({ id: 'otp' });
    const row = {
      email: 'otp@example.com',
      purpose: 'signup_verify' as const,
      codeHash: 'digest',
      expiresAt: now,
    };
    const message = {
      eventType: 'auth.otp',
      channel: 'email' as const,
      payload: { envelope: 'encrypted' },
      dedupeKey: 'otp:id',
    };
    await transaction.issue(row, message);
    expect(chain.values).toHaveBeenCalledWith(row);
    expect(chain.values).toHaveBeenCalledWith(message);
    await transaction.attempt('otp', 3);
    expect(chain.set).toHaveBeenCalledWith({ attempts: 3 });
    await transaction.consume('otp', now);
    expect(chain.set).toHaveBeenCalledWith({ consumedAt: now });
    await transaction.verifyEmail(now);
    expect(chain.set).toHaveBeenCalledWith({ emailVerifiedAt: now, updatedAt: now });
    await transaction.resetPassword('hash', now);
    expect(chain.set).toHaveBeenCalledWith({ passwordHash: 'hash', updatedAt: now });
    expect(chain.set).toHaveBeenCalledWith({ revokedAt: now, revokedReason: 'password_reset' });
  });
});
it('SEC: missing identity cannot read OTPs or change credentials', async () => {
  chain.for.mockResolvedValue([]);
  await repository().transaction('missing@example.com', async (transaction) => {
    expect(transaction.identity).toBeUndefined();
    expect(await transaction.latest('password_reset')).toBeUndefined();
    await transaction.verifyEmail(new Date());
    await transaction.resetPassword('hash', new Date());
    expect(database.update).not.toHaveBeenCalled();
  });
});

it.each(['verify', 'reset'] as const)(
  'NTF-002: %s queues a fixed private security notice in the credential transaction',
  async (kind) => {
    const now = new Date();
    await repository().transaction('otp@example.com', async (transaction) => {
      if (kind === 'verify') await transaction.verifyEmail(now);
      else await transaction.resetPassword('hash', now);
    });
    expect(chain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'notification.create',
        channel: 'in_app',
        recipientUserId: actorId,
        payload: expect.objectContaining({
          event: kind === 'verify' ? 'account.email_verified' : 'account.password_reset',
        }),
        createdAt: now,
      }),
    );
  },
);
it('NTF-002: outbox insertion failure propagates to abort the OTP/credential transaction', async () => {
  chain.onConflictDoNothing.mockRejectedValueOnce(new Error('Notification unavailable'));
  await expect(
    repository().transaction('otp@example.com', (transaction) =>
      transaction.verifyEmail(new Date()),
    ),
  ).rejects.toThrow('Notification unavailable');
});
