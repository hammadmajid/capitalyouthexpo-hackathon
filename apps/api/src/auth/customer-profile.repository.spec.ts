import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { customerProfiles, files, users, type Database } from '@hsm/db';
import { AuditWriter } from '../audit/writer.js';
import { lockActor } from './actor-lock.js';
import { CustomerProfileRepository } from './customer-profile.repository.js';
vi.mock('./actor-lock.js', () => ({ lockActor: vi.fn() }));
const actor = { userId: randomUUID(), sessionId: randomUUID() };
const now = new Date('2026-10-10T12:00:00Z');
const input = {
  fullName: 'Customer Identity',
  phone: '+923001234567',
  age: 21,
  gender: 'female' as const,
};
let table: unknown;
let mode: 'read' | 'write';
let phone: string | null;
let completedAt: Date | null;
let identity: { id: string } | undefined;
let attachment: { id: string; purpose: string; scanStatus: string } | undefined;
const chain = {
  from: vi.fn(),
  where: vi.fn(),
  for: vi.fn(),
  set: vi.fn(),
  values: vi.fn(),
  onConflictDoUpdate: vi.fn(),
  then: vi.fn(),
};
const database = { select: vi.fn(), update: vi.fn(), insert: vi.fn(), transaction: vi.fn() };
const audit = new AuditWriter();
const record = vi.spyOn(audit, 'platform');
beforeEach(() => {
  vi.clearAllMocks();
  identity = { id: actor.userId };
  attachment = { id: randomUUID(), purpose: 'avatar', scanStatus: 'clean' };
  phone = null;
  completedAt = null;
  vi.mocked(lockActor).mockResolvedValue(undefined);
  record.mockResolvedValue(undefined);
  database.select.mockImplementation(() => {
    mode = 'read';
    return chain;
  });
  database.update.mockImplementation((value: unknown) => {
    mode = 'write';
    table = value;
    return chain;
  });
  database.insert.mockReturnValue(chain);
  chain.from.mockImplementation((value: unknown) => {
    table = value;
    return chain;
  });
  for (const method of ['where', 'set', 'values'] as const) chain[method].mockReturnValue(chain);
  chain.for.mockImplementation(async () =>
    table === users ? (identity ? [identity] : []) : attachment ? [attachment] : [],
  );
  chain.then.mockImplementation((resolve: (value: unknown) => unknown) =>
    resolve(
      mode === 'write' ? undefined : table === customerProfiles ? [{ completedAt }] : [{ phone }],
    ),
  );
  chain.onConflictDoUpdate.mockResolvedValue(undefined);
  database.transaction.mockImplementation(async (work: (value: unknown) => Promise<unknown>) =>
    work(database),
  );
});
const repository = () =>
  new CustomerProfileRepository(
    database as unknown as Database,
    'private-profile-bucket',
    audit,
    () => now,
  );
it('AUTH-C SEC: the live actor lock precedes Customer writes and the same transaction records only safe audit metadata', async () => {
  await repository().transaction(actor, async (transaction) => {
    expect(transaction.identity?.id).toBe(actor.userId);
    expect(lockActor).toHaveBeenCalledWith(database, actor, expect.any(Function));
    await transaction.save({ ...input, institution: 'Example Institute' }, now);
  });
  expect(vi.mocked(lockActor).mock.invocationCallOrder[0]).toBeLessThan(
    database.select.mock.invocationCallOrder[0] ?? 0,
  );
  expect(chain.set).toHaveBeenCalledWith(
    expect.objectContaining({
      fullName: input.fullName,
      phoneE164: input.phone,
      phoneVerifiedAt: null,
    }),
  );
  expect(chain.set.mock.calls[0]?.[0]).not.toHaveProperty('dateOfBirth');
  expect(chain.set.mock.calls[0]?.[0]).not.toHaveProperty('cnicHash');
  // ADM-002: same-identity contact onboarding never changes permanent credentials or Root grants.
  expect(chain.set.mock.calls[0]?.[0]).not.toHaveProperty('passwordHash');
  expect(chain.set.mock.calls[0]?.[0]).not.toHaveProperty('id');
  expect(database.update.mock.calls.every(([table]) => table === users)).toBe(true);
  expect(chain.values).toHaveBeenCalledWith({
    userId: actor.userId,
    age: 21,
    institutionText: 'Example Institute',
    profileCompletedAt: now,
  });
  expect(record).toHaveBeenCalledWith(
    database,
    expect.objectContaining({
      actorUserId: actor.userId,
      targetId: actor.userId,
      after: { completed: true },
    }),
  );
  expect(JSON.stringify(record.mock.calls)).not.toContain(input.phone);
});
it('AUTH-C CHG-006: editing age preserves the first completion timestamp and unchanged verification history', async () => {
  phone = input.phone;
  completedAt = new Date(now.getTime() - 1000);
  const photo = randomUUID();
  await repository().transaction(actor, (transaction) =>
    transaction.save({ ...input, age: 36, profilePhotoFileId: photo }, now),
  );
  expect(chain.set.mock.calls[0]?.[0]).not.toHaveProperty('phoneVerifiedAt');
  expect(chain.set).toHaveBeenCalledWith(expect.objectContaining({ profilePhotoFileId: photo }));
  expect(chain.onConflictDoUpdate).toHaveBeenCalledWith({
    target: customerProfiles.userId,
    set: { age: 36, institutionText: null, profileCompletedAt: completedAt },
  });
});
it('SEC: photo lookup binds its ID, uploader, configured private bucket and private visibility under lock', async () => {
  const fileId = randomUUID();
  await repository().transaction(actor, async (transaction) => {
    expect(await transaction.file(fileId)).toEqual(attachment);
  });
  const condition = chain.where.mock.calls.at(-1)?.[0] as SQL;
  const query = new PgDialect().sqlToQuery(condition);
  expect(query.params).toEqual([fileId, actor.userId, 'private-profile-bucket', 'private']);
  expect(chain.from).toHaveBeenLastCalledWith(files);
  expect(chain.for).toHaveBeenLastCalledWith('update');
});
it('SEC: missing identity and attachment remain absent, never reconstructed from caller input', async () => {
  identity = undefined;
  attachment = undefined;
  await repository().transaction(actor, async (transaction) => {
    expect(transaction.identity).toBeUndefined();
    expect(await transaction.file(randomUUID())).toBeUndefined();
  });
});
it.each(['direct', 'wrapped'] as const)(
  'SEC: %s phone uniqueness conflicts return a typed opaque identity error',
  async (kind) => {
    const conflict = Object.assign(new Error('Private SQL and identifier'), { code: '23505' });
    database.transaction.mockRejectedValueOnce(
      kind === 'direct' ? conflict : new Error('Private database query', { cause: conflict }),
    );
    await expect(repository().transaction(actor, async () => undefined)).rejects.toMatchObject({
      code: 'IDENTITY_EXISTS',
      status: 409,
      message: 'Identity already exists',
    });
  },
);
it.each([new Error('Database unavailable'), 'Non-error dependency failure'])(
  'SEC: unrelated persistence errors are not misclassified as identity conflicts',
  async (error) => {
    database.transaction.mockRejectedValueOnce(error);
    await expect(repository().transaction(actor, async () => undefined)).rejects.toBe(error);
  },
);
it('SEC: revoked actor rejection prevents identity reads, callbacks and all profile writes', async () => {
  const work = vi.fn();
  vi.mocked(lockActor).mockRejectedValueOnce(new Error('Revoked actor'));
  await expect(repository().transaction(actor, work)).rejects.toThrow('Revoked actor');
  expect(work).not.toHaveBeenCalled();
  expect(database.select).not.toHaveBeenCalled();
  expect(database.update).not.toHaveBeenCalled();
});
it('SEC: failed audit rejects the enclosing persistence operation', async () => {
  record.mockRejectedValueOnce(new Error('Audit unavailable'));
  await expect(
    repository().transaction(actor, (transaction) => transaction.save(input, now)),
  ).rejects.toThrow('Audit unavailable');
});

it('SEC-003 / UI-001: explicit null unlinks only the current actor avatar while omission preserves it', async () => {
  await repository().transaction(actor, (transaction) =>
    transaction.save({ ...input, profilePhotoFileId: null }, now),
  );
  expect(chain.set).toHaveBeenCalledWith(expect.objectContaining({ profilePhotoFileId: null }));
});
