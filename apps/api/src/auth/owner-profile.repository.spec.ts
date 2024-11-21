import { randomBytes, randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { organizations, ownerProfiles, users, type Database } from '@hsm/db';
import { AuditWriter } from '../audit/writer.js';
import { lockActor } from './actor-lock.js';
import { OwnerProfileRepository } from './owner-profile.repository.js';
vi.mock('./actor-lock.js', () => ({ lockActor: vi.fn() }));
const actor = { userId: randomUUID(), sessionId: randomUUID() };
const now = new Date('2026-10-10T12:00:00Z');
const input = {
  fullName: 'Owner Identity',
  phone: '+923001234567',
  cnicFrontFileId: randomUUID(),
  cnicBackFileId: randomUUID(),
  address: 'Private Owner address',
  agreementAccepted: true as const,
  agreementVersion: 'owner-foundation-v1' as const,
};
const protectedCnic = {
  cnicHash: randomBytes(32),
  cnicEncrypted: randomBytes(64),
  cnicLast4: '5671',
};
let table: unknown, mode: 'read' | 'write';
let identity: { id: string; phoneE164: string | null } | undefined;
let previous: { acceptedAt: Date; completedAt: Date } | undefined;
let existingOrganization: { id: string } | undefined;
let createdOrganization: { id: string } | undefined;
const chain = {
  from: vi.fn(),
  where: vi.fn(),
  for: vi.fn(),
  set: vi.fn(),
  values: vi.fn(),
  onConflictDoUpdate: vi.fn(),
  limit: vi.fn(),
  returning: vi.fn(),
  then: vi.fn(),
};
const database = { select: vi.fn(), update: vi.fn(), insert: vi.fn(), transaction: vi.fn() };
const audit = new AuditWriter(),
  record = vi.spyOn(audit, 'platform');
beforeEach(() => {
  vi.clearAllMocks();
  identity = { id: actor.userId, phoneE164: null };
  previous = undefined;
  existingOrganization = undefined;
  createdOrganization = { id: randomUUID() };
  vi.mocked(lockActor).mockResolvedValue(undefined);
  record.mockResolvedValue(undefined);
  database.select.mockImplementation(() => {
    mode = 'read';
    return chain;
  });
  database.update.mockImplementation((value: unknown) => {
    table = value;
    mode = 'write';
    return chain;
  });
  database.insert.mockReturnValue(chain);
  chain.from.mockImplementation((value: unknown) => {
    table = value;
    return chain;
  });
  for (const method of ['where', 'set', 'values'] as const) chain[method].mockReturnValue(chain);
  chain.for.mockImplementation(async () =>
    table === users
      ? identity
        ? [identity]
        : []
      : [{ id: input.cnicFrontFileId, purpose: 'verification_document', scanStatus: 'clean' }],
  );
  chain.then.mockImplementation((resolve: (value: unknown) => unknown) =>
    resolve(mode === 'write' ? undefined : previous ? [previous] : []),
  );
  chain.onConflictDoUpdate.mockResolvedValue(undefined);
  chain.limit.mockImplementation(async () => (existingOrganization ? [existingOrganization] : []));
  chain.returning.mockImplementation(async () =>
    createdOrganization ? [createdOrganization] : [],
  );
  database.transaction.mockImplementation(async (work: (value: unknown) => Promise<unknown>) =>
    work(database),
  );
});
const repository = () =>
  new OwnerProfileRepository(
    database as unknown as Database,
    'private-profile-bucket',
    audit,
    () => now,
  );
it('OWN-001 SEC: Owner persistence rechecks the live actor, writes protected identity and initializes its own organization with safe audit metadata', async () => {
  await repository().transaction(actor, async (transaction) => {
    expect(transaction.identity?.id).toBe(actor.userId);
    await transaction.save(input, protectedCnic, now);
  });
  expect(vi.mocked(lockActor).mock.invocationCallOrder[0]).toBeLessThan(
    database.select.mock.invocationCallOrder[0] ?? 0,
  );
  expect(chain.set).toHaveBeenCalledWith(
    expect.objectContaining({
      ...protectedCnic,
      phoneE164: input.phone,
      phoneVerifiedAt: null,
      fullName: input.fullName,
    }),
  );
  expect(chain.set.mock.calls[0]?.[0]).not.toHaveProperty('cnic');
  expect(chain.set.mock.calls[0]?.[0]).not.toHaveProperty('permanentAddress');
  expect(chain.values).toHaveBeenCalledWith(
    expect.objectContaining({
      userId: actor.userId,
      cnicFrontFileId: input.cnicFrontFileId,
      cnicBackFileId: input.cnicBackFileId,
      agreementAcceptedAt: now,
      profileCompletedAt: now,
    }),
  );
  expect(chain.values).toHaveBeenCalledWith(
    expect.objectContaining({ ownerUserId: actor.userId, name: 'Personal hostel organization' }),
  );
  expect(record).toHaveBeenCalledWith(
    database,
    expect.objectContaining({
      targetId: actor.userId,
      after: {
        completed: true,
        organizationId: createdOrganization?.id,
        organizationCreated: true,
        agreementVersion: input.agreementVersion,
      },
    }),
  );
  const evidence = JSON.stringify(record.mock.calls);
  for (const value of [input.phone, input.address, input.cnicFrontFileId, protectedCnic.cnicLast4])
    expect(evidence).not.toContain(value);
});
it('OWN-001: optional organization name initializes a new owner relationship only', async () => {
  await repository().transaction(actor, (transaction) =>
    transaction.save({ ...input, organizationName: 'New Owner Organization' }, protectedCnic, now),
  );
  expect(chain.values).toHaveBeenCalledWith(
    expect.objectContaining({ ownerUserId: actor.userId, name: 'New Owner Organization' }),
  );
});
it('OWN-001 SEC: existing live organization and agreement history are reused without rename or duplicate owner grants', async () => {
  existingOrganization = { id: randomUUID() };
  previous = {
    acceptedAt: new Date(now.getTime() - 2000),
    completedAt: new Date(now.getTime() - 1000),
  };
  if (!identity) throw new Error('Missing unit Owner');
  identity.phoneE164 = input.phone;
  const photo = randomUUID();
  await repository().transaction(actor, (transaction) =>
    transaction.save(
      { ...input, profilePhotoFileId: photo, organizationName: 'Never silently rename' },
      protectedCnic,
      now,
    ),
  );
  expect(database.insert).not.toHaveBeenCalledWith(organizations);
  expect(chain.set.mock.calls[0]?.[0]).not.toHaveProperty('phoneVerifiedAt');
  expect(chain.set).toHaveBeenCalledWith(expect.objectContaining({ profilePhotoFileId: photo }));
  expect(chain.onConflictDoUpdate).toHaveBeenCalledWith({
    target: ownerProfiles.userId,
    set: expect.objectContaining({
      agreementAcceptedAt: previous.acceptedAt,
      profileCompletedAt: previous.completedAt,
    }),
  });
  expect(record).toHaveBeenCalledWith(
    database,
    expect.objectContaining({
      after: expect.objectContaining({
        organizationId: existingOrganization.id,
        organizationCreated: false,
      }),
    }),
  );
  const clauses = chain.where.mock.calls.map(([clause]) =>
    new PgDialect().sqlToQuery(clause as SQL),
  );
  expect(
    clauses.some(
      (query) => query.sql.includes('archived_at') && query.params.includes(actor.userId),
    ),
  ).toBe(true);
});
it('SEC: Owner file references reuse uploader/private-bucket authorization under lock', async () => {
  const id = randomUUID();
  await repository().transaction(actor, async (transaction) => {
    expect((await transaction.file(id))?.scanStatus).toBe('clean');
  });
  const query = new PgDialect().sqlToQuery(chain.where.mock.calls.at(-1)?.[0] as SQL);
  expect(query.params).toEqual([id, actor.userId, 'private-profile-bucket', 'private']);
  expect(chain.for).toHaveBeenLastCalledWith('update');
});
it('SEC: missing identity remains absent instead of accepting any caller-provided owner', async () => {
  identity = undefined;
  await repository().transaction(actor, async (transaction) => {
    expect(transaction.identity).toBeUndefined();
  });
});
it('SEC: missing organization insertion result rejects the whole Owner operation', async () => {
  createdOrganization = undefined;
  await expect(
    repository().transaction(actor, (transaction) => transaction.save(input, protectedCnic, now)),
  ).rejects.toThrow('Owner organization unavailable');
  expect(record).not.toHaveBeenCalled();
});
it.each(['direct', 'wrapped'] as const)(
  'SEC: %s uniqueness failure cannot disclose CNIC, phone or database statements',
  async (kind) => {
    const conflict = Object.assign(new Error('Private query and identity'), { code: '23505' });
    database.transaction.mockRejectedValueOnce(
      kind === 'direct' ? conflict : new Error('Private query', { cause: conflict }),
    );
    await expect(repository().transaction(actor, async () => undefined)).rejects.toMatchObject({
      code: 'IDENTITY_EXISTS',
      message: 'Identity already exists',
    });
  },
);
it('SEC: revoked actor and audit failures reject Owner persistence', async () => {
  vi.mocked(lockActor).mockRejectedValueOnce(new Error('Revoked actor'));
  await expect(repository().transaction(actor, async () => undefined)).rejects.toThrow(
    'Revoked actor',
  );
  expect(database.update).not.toHaveBeenCalled();
  record.mockRejectedValueOnce(new Error('Owner audit unavailable'));
  await expect(
    repository().transaction(actor, (transaction) => transaction.save(input, protectedCnic, now)),
  ).rejects.toThrow('Owner audit unavailable');
});

it('OWN-001: omitting photos never clears historically saved evidence on upsert', async () => {
  const withoutPhotos = { ...input, cnicFrontFileId: undefined, cnicBackFileId: undefined };
  await repository().transaction(actor, (transaction) =>
    transaction.save(withoutPhotos, protectedCnic, now),
  );
  const fields = chain.onConflictDoUpdate.mock.calls[0]?.[0].set;
  expect(fields).not.toHaveProperty('cnicFrontFileId');
  expect(fields).not.toHaveProperty('cnicBackFileId');
});

it('SEC-003 / UI-001: explicit null unlinks only the current actor avatar while omission preserves it', async () => {
  await repository().transaction(actor, (transaction) =>
    transaction.save({ ...input, profilePhotoFileId: null }, protectedCnic, now),
  );
  expect(chain.set).toHaveBeenCalledWith(expect.objectContaining({ profilePhotoFileId: null }));
});
