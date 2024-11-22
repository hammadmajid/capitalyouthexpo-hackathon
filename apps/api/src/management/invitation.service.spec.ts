import { AuthCrypto } from '../auth/crypto.js';
import { testKeys } from '../../test/keys.js';
import { fingerprint } from '../idempotency/policy.js';
import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { DomainError } from '@hsm/contracts';
import type { Transaction } from '../audit/writer.js';
import { currentTransaction } from '../idempotency/context.js';
import type { InvitationRepository } from './invitation.repository.js';
import { InvitationService } from './invitation.service.js';
const actor = { userId: randomUUID(), sessionId: randomUUID() },
  branchId = randomUUID(),
  targetId = randomUUID(),
  assignmentId = randomUUID();
const now = new Date('2026-10-11T00:00:00Z');
const state = {
  id: assignmentId,
  branchId,
  status: 'pending_activation',
  expiresAt: '2026-10-12T00:00:00.000Z',
  acceptance: 'temporary_password',
};
const auto = {
  fullName: 'Manager Name',
  phone: '03001234567',
  temporaryCredential: { mode: 'auto' },
};
const database = {} as Transaction;
const transaction = { database, read: vi.fn(), save: vi.fn(), remove: vi.fn() };
const store = { transaction: vi.fn() };
const repository = {
  resolve: vi.fn(),
  resolveAssignment: vi.fn(),
  store: vi.fn(),
  authorize: vi.fn(),
  requireReset: vi.fn(),
  invite: vi.fn(),
  reset: vi.fn(),
};
const hash = vi.fn(),
  generate = vi.fn();
const service = () =>
  new InvitationService(
    repository as unknown as InvitationRepository,
    new AuthCrypto(testKeys()),
    () => now,
    hash,
    generate,
  );
beforeEach(() => {
  vi.clearAllMocks();
  repository.resolve.mockResolvedValue(targetId);
  repository.resolveAssignment.mockResolvedValue(targetId);
  repository.store.mockReturnValue(store);
  repository.authorize.mockResolvedValue(true);
  repository.requireReset.mockResolvedValue({});
  for (const method of ['invite', 'reset'] as const)
    repository[method].mockImplementation(async () => {
      expect(currentTransaction()).toBe(database);
      return state;
    });
  transaction.read.mockResolvedValue(undefined);
  transaction.save.mockResolvedValue(undefined);
  store.transaction.mockImplementation(
    async (_actor: unknown, _now: unknown, work: (value: typeof transaction) => Promise<unknown>) =>
      work(transaction),
  );
  generate.mockReturnValue('Generated private credential phrase');
  hash.mockResolvedValue('argon2-hash');
});
it('AUTH-M-001 SEC: normalized phone and participant locks precede same-transaction creation; only initial auto issuance exposes plaintext', async () => {
  const result = await service().invite(actor, randomUUID(), branchId, auto);
  expect(result).toMatchObject({
    status: 201,
    replayed: false,
    body: { ...state, generatedTempPassword: 'Generated private credential phrase' },
  });
  expect(repository.resolve).toHaveBeenCalledWith('+923001234567');
  expect(repository.store).toHaveBeenCalledWith(targetId);
  expect(repository.invite).toHaveBeenCalledWith(
    database,
    actor,
    branchId,
    targetId,
    { ...auto, phone: '+923001234567' },
    'argon2-hash',
    now,
  );
  expect(transaction.save.mock.calls[0]?.[1].responseBody).toEqual(state);
  expect(JSON.stringify(transaction.save.mock.calls)).not.toContain(
    'Generated private credential phrase',
  );
});
it('AUTH-M-001: manual credentials are hashed but never echoed', async () => {
  const result = await service().invite(actor, randomUUID(), branchId, {
    ...auto,
    temporaryCredential: { mode: 'manual', password: 'Manual private phrase' },
  });
  expect(hash).toHaveBeenCalledWith('Manual private phrase');
  expect(generate).not.toHaveBeenCalled();
  expect(result.body).not.toHaveProperty('generatedTempPassword');
});
it('SEC: an existing permanent identity never receives an owner-issued credential', async () => {
  repository.invite.mockResolvedValue({ ...state, acceptance: 'authenticated_account' });
  const result = await service().invite(actor, randomUUID(), branchId, auto);
  expect(result.body.acceptance).toBe('authenticated_account');
  expect(result.body).not.toHaveProperty('generatedTempPassword');
});
it.each(['invite', 'reset'] as const)(
  'SEC: %s replay revalidates scope and never reissues a generated credential',
  async (operation) => {
    const instance = service(),
      key = randomUUID();
    const run = () =>
      operation === 'invite'
        ? instance.invite(actor, key, branchId, auto)
        : instance.reset(actor, key, branchId, assignmentId, {
            temporaryCredential: { mode: 'auto' },
          });
    await run();
    transaction.read.mockResolvedValue(transaction.save.mock.calls[0]?.[1]);
    const result = await run();
    expect(result).toMatchObject({ replayed: true, body: state });
    expect(result.body).not.toHaveProperty('generatedTempPassword');
    expect(repository[operation]).toHaveBeenCalledTimes(1);
    expect(repository.authorize).toHaveBeenCalledTimes(2);
    if (operation === 'reset') expect(repository.requireReset).toHaveBeenCalledTimes(2);
  },
);
it('AUTH-M-003: reset uses the same transaction and a safe response projection', async () => {
  const result = await service().reset(actor, randomUUID(), branchId, assignmentId, {
    temporaryCredential: { mode: 'auto' },
  });
  expect(result.status).toBe(200);
  expect(repository.resolveAssignment).toHaveBeenCalledWith(branchId, assignmentId);
  expect(repository.requireReset).toHaveBeenCalledWith(database, branchId, assignmentId, targetId);
  expect(repository.reset).toHaveBeenCalledWith(
    database,
    actor,
    branchId,
    assignmentId,
    targetId,
    'argon2-hash',
    now,
  );
  expect(transaction.save.mock.calls[0]?.[1].responseBody).toEqual(state);
});
it('SEC: failed scope or permanent-password reset blocks work and replay persistence', async () => {
  repository.authorize.mockRejectedValueOnce(
    new DomainError('BRANCH_FORBIDDEN', 403, 'Unavailable'),
  );
  await expect(service().invite(actor, randomUUID(), branchId, auto)).rejects.toMatchObject({
    code: 'BRANCH_FORBIDDEN',
  });
  repository.requireReset.mockRejectedValueOnce(new DomainError('CONFLICT', 409, 'Unavailable'));
  await expect(
    service().reset(actor, randomUUID(), branchId, assignmentId, {
      temporaryCredential: { mode: 'auto' },
    }),
  ).rejects.toMatchObject({ code: 'CONFLICT' });
  expect(repository.invite).not.toHaveBeenCalled();
  expect(repository.reset).not.toHaveBeenCalled();
  expect(transaction.save).not.toHaveBeenCalled();
});
it('SEC: strict invalid inputs fail before credential hashing or target lookup', async () => {
  for (const body of [
    { ...auto, userId: targetId },
    { ...auto, temporaryCredential: { mode: 'auto', password: 'Hidden password' } },
    { ...auto, phone: 'invalid' },
  ])
    await expect(service().invite(actor, randomUUID(), branchId, body)).rejects.toThrow();
  await expect(
    service().reset(actor, randomUUID(), branchId, 'invalid', {
      temporaryCredential: { mode: 'auto' },
    }),
  ).rejects.toThrow();
  expect(hash).not.toHaveBeenCalled();
  expect(repository.resolve).not.toHaveBeenCalled();
});
it('SEC: audit/resource failure leaves no cached success or generated credential response', async () => {
  repository.invite.mockRejectedValueOnce(new Error('Audit failed'));
  await expect(service().invite(actor, randomUUID(), branchId, auto)).rejects.toThrow(
    'Audit failed',
  );
  expect(transaction.save).not.toHaveBeenCalled();
});

it('SEC: manual request fingerprint does not persist a fast unkeyed password verifier', async () => {
  const input = {
    ...auto,
    phone: '+923001234567',
    temporaryCredential: { mode: 'manual', password: 'Manual private phrase' },
  };
  await service().invite(actor, randomUUID(), branchId, input);
  const cached = transaction.save.mock.calls[0]?.[1];
  expect(
    cached.requestHash.equals(
      fingerprint('POST /manage/branches/:branchId/managers', { branchId }, input),
    ),
  ).toBe(false);
});

it('SEC: manual replay binds the same credential and rejects a changed credential', async () => {
  const instance = service(),
    key = randomUUID();
  const input = {
    ...auto,
    temporaryCredential: { mode: 'manual', password: 'Manual private phrase' },
  };
  await instance.invite(actor, key, branchId, input);
  transaction.read.mockResolvedValue(transaction.save.mock.calls[0]?.[1]);
  expect((await instance.invite(actor, key, branchId, input)).replayed).toBe(true);
  await expect(
    instance.invite(actor, key, branchId, {
      ...input,
      temporaryCredential: { mode: 'manual', password: 'Changed private phrase' },
    }),
  ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
});
it('AUTH-M-001 SEC: default generator uses a fresh 192-bit credential and the existing Argon2id primitive', async () => {
  const instance = new InvitationService(
    repository as unknown as InvitationRepository,
    new AuthCrypto(testKeys()),
    () => now,
  );
  const result = await instance.invite(actor, randomUUID(), branchId, auto);
  expect(result.body.generatedTempPassword).toMatch(/^[A-Za-z0-9_-]{32}$/);
  expect(repository.invite.mock.calls[0]?.[5]).toMatch(/^\$argon2id\$/);
});
