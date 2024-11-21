import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { customerProfiles, ownerProfiles, organizations, users, type Database } from '@hsm/db';
import { AuditWriter } from '../audit/writer.js';
import { lockActor } from './actor-lock.js';
import { ProfileDetailsRepository } from './profile-details.repository.js';
vi.mock('./actor-lock.js', () => ({ lockActor: vi.fn() }));
const sensitive = vi.spyOn(AuditWriter.prototype, 'sensitive');
const actor = { userId: randomUUID(), sessionId: randomUUID() };
const now = new Date('2026-10-11T12:00:00Z');
const user = {
  userId: actor.userId,
  fullName: 'Edit identity',
  email: 'edit@example.test',
  emailVerifiedAt: now,
  phone: '+923001234567',
  gender: 'female',
  cnicLast4: '5671',
  profilePhotoFileId: null,
};
const customer = { age: 26, institution: 'Institute', completedAt: now };
const owner = {
  address: 'Owner address',
  cnicFrontFileId: randomUUID(),
  cnicBackFileId: randomUUID(),
  agreementVersion: 'owner-foundation-v1',
  agreementAcceptedAt: now,
  completedAt: now,
};
const rows = new Map<unknown, unknown[]>();
const predicates: SQL[] = [];
let table: unknown;
const chain = { from: vi.fn(), where: vi.fn(), limit: vi.fn() };
const database = { select: vi.fn(), transaction: vi.fn() };
beforeEach(() => {
  vi.clearAllMocks();
  sensitive.mockResolvedValue(undefined);
  rows.clear();
  predicates.length = 0;
  rows.set(users, [user]);
  rows.set(customerProfiles, [customer]);
  rows.set(ownerProfiles, [owner]);
  vi.mocked(lockActor).mockResolvedValue(undefined);
  database.select.mockReturnValue(chain);
  chain.from.mockImplementation((value: unknown) => {
    table = value;
    return chain;
  });
  chain.where.mockImplementation((predicate: SQL) => {
    predicates.push(predicate);
    return table === organizations ? chain : Promise.resolve(rows.get(table) ?? []);
  });
  chain.limit.mockImplementation(async () => rows.get(table) ?? []);
  rows.set(organizations, [{ name: 'Saved organization' }]);
  database.transaction.mockImplementation(async (work: (tx: unknown) => Promise<unknown>) =>
    work(database),
  );
});
const repository = () => new ProfileDetailsRepository(database as unknown as Database, () => now);
it('SEC AUTH-C: self details lock the live actor first, filter every table by that actor and select no protected crypto', async () => {
  const value = await repository().read(actor);
  expect(lockActor).toHaveBeenCalledExactlyOnceWith(database, actor, expect.any(Function));
  expect(vi.mocked(lockActor).mock.invocationCallOrder[0]).toBeLessThan(
    database.select.mock.invocationCallOrder[0] ?? 0,
  );
  for (const predicate of predicates)
    expect(new PgDialect().sqlToQuery(predicate).params).toEqual([actor.userId]);
  const identityFields = Object.keys(database.select.mock.calls[0]?.[0] as object);
  expect(identityFields).not.toContain('passwordHash');
  expect(identityFields).not.toContain('cnicHash');
  expect(identityFields).not.toContain('cnicEncrypted');
  expect(value).toMatchObject({
    userId: actor.userId,
    emailVerified: true,
    customer: { age: 26, completed: true },
    owner: { agreementAcceptedAt: now.toISOString(), completed: true },
  });
});
it('AUTH-C: an initial identity has nullable Customer/Owner details and no false email verification', async () => {
  rows.set(users, [{ ...user, emailVerifiedAt: null }]);
  rows.delete(customerProfiles);
  rows.delete(ownerProfiles);
  expect(await repository().read(actor)).toMatchObject({
    emailVerified: false,
    customer: null,
    owner: null,
  });
});
it('AUTH-C: historical incomplete profile rows are not marked completed', async () => {
  rows.set(customerProfiles, [{ ...customer, age: null, completedAt: null }]);
  rows.set(ownerProfiles, [{ ...owner, completedAt: null }]);
  expect(await repository().read(actor)).toMatchObject({
    customer: { age: null, completed: false },
    owner: { completed: false },
  });
});
it('SEC: missing identity rejects before reading profile details', async () => {
  rows.delete(users);
  await expect(repository().read(actor)).rejects.toMatchObject({
    code: 'UNAUTHENTICATED',
    status: 401,
  });
  expect(database.select).toHaveBeenCalledTimes(1);
});
it('SEC: revoked actor rejection prevents all profile selection', async () => {
  const failure = new Error('live actor rejected');
  vi.mocked(lockActor).mockRejectedValue(failure);
  await expect(repository().read(actor)).rejects.toBe(failure);
  expect(database.select).not.toHaveBeenCalled();
});
it('SEC ACC-006: self profile details record sensitive access in the same locked transaction without field values', async () => {
  await repository().read(actor);
  expect(sensitive).toHaveBeenCalledExactlyOnceWith(database, {
    actorUserId: actor.userId,
    subjectUserId: actor.userId,
    resource: 'self_profile_details',
    resourceId: actor.userId,
    purpose: 'Self profile editing',
    createdAt: now,
  });
});
it('SEC ACC-006: a sensitive access audit failure prevents returning private edit details', async () => {
  const failure = new Error('audit unavailable');
  sensitive.mockRejectedValue(failure);
  await expect(repository().read(actor)).rejects.toBe(failure);
});
