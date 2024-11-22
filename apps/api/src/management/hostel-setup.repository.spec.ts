import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { brands, branches, type Database } from '@hsm/db';
import type { HostelOnboarding } from '@hsm/contracts';
import { AuditWriter } from '../audit/writer.js';
import { lockActor } from '../auth/actor-lock.js';
import {
  lockSetupScope,
  requireOwnerSetupEvidence,
  requireSetupFile,
} from './hostel-setup.scope.js';
import { readHostelSetup, validateSetupGeography } from './hostel-setup.projection.js';
import { newMainBranch } from './hostel-setup.policy.js';
import { HostelSetupRepository } from './hostel-setup.repository.js';
import { captureVerification } from '../admin/verification-capture.js';
vi.mock('../admin/verification-capture.js', () => ({
  captureVerification: vi.fn(async () => randomUUID()),
}));
vi.mock('../auth/actor-lock.js', () => ({ lockActor: vi.fn() }));
vi.mock('./hostel-setup.scope.js', () => ({
  lockSetupScope: vi.fn(),
  requireOwnerSetupEvidence: vi.fn(),
  requireSetupFile: vi.fn(),
}));
vi.mock('./hostel-setup.projection.js', async (original) => ({
  ...(await original<typeof import('./hostel-setup.projection.js')>()),
  readHostelSetup: vi.fn(),
  validateSetupGeography: vi.fn(),
}));
const actor = { userId: randomUUID(), sessionId: randomUUID() },
  now = new Date('2026-10-11T00:00:00Z');
const brand = {
  id: randomUUID(),
  organizationId: randomUUID(),
  name: 'Private hostel',
  logoFileId: null,
};
const branch = {
  ...newMainBranch(randomUUID(), { name: brand.name }),
  category: 'boys' as const,
  cityId: randomUUID(),
  areaId: randomUUID(),
  addressLine: 'Actual address',
  location: { latitude: 33, longitude: 73 },
};
let hostel: HostelOnboarding;
let rows: (typeof brand)[];
const chain = {
  from: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  set: vi.fn(),
  values: vi.fn(),
  then: vi.fn(),
};
const database = { select: vi.fn(), insert: vi.fn(), update: vi.fn(), transaction: vi.fn() };
const audit = new AuditWriter(),
  record = vi.spyOn(audit, 'hostel');
const repository = () =>
  new HostelSetupRepository(database as unknown as Database, 'private-bucket', audit, () => now);
beforeEach(() => {
  vi.clearAllMocks();
  hostel = { ...brand, mainBranch: branch, missingFields: [] };
  rows = [brand];
  database.select.mockReturnValue(chain);
  database.insert.mockReturnValue(chain);
  database.update.mockReturnValue(chain);
  for (const key of ['from', 'where', 'orderBy', 'set', 'values'] as const)
    chain[key].mockReturnValue(chain);
  chain.limit.mockImplementation(async () => rows);
  chain.then.mockImplementation((resolve: (value: unknown) => unknown) => resolve(undefined));
  database.transaction.mockImplementation(
    async (work: (transaction: unknown) => Promise<unknown>) => work(database),
  );
  vi.mocked(lockActor).mockResolvedValue(undefined);
  vi.mocked(lockSetupScope).mockResolvedValue(brand.organizationId);
  vi.mocked(requireOwnerSetupEvidence).mockResolvedValue(undefined);
  vi.mocked(requireSetupFile).mockResolvedValue(undefined);
  vi.mocked(readHostelSetup).mockImplementation(async () => hostel);
  vi.mocked(validateSetupGeography).mockResolvedValue(undefined);
  record.mockResolvedValue(undefined);
});
it('SEC: exact target scope and current private Owner evidence authorize every mutation/replay', async () => {
  const target = { kind: 'brand' as const, id: brand.id };
  expect(await repository().authorize(database as never, actor, target)).toBe(true);
  expect(lockSetupScope).toHaveBeenCalledWith(database, actor, target);
  expect(requireOwnerSetupEvidence).toHaveBeenCalledWith(database, actor, 'private-bucket', true);
  vi.mocked(lockSetupScope).mockRejectedValueOnce(new Error('Scope unavailable'));
  await expect(repository().authorize(database as never, actor, target)).rejects.toThrow(
    'Scope unavailable',
  );
});
it('SEC: fresh private read rechecks actor and owned resource inside a transaction', async () => {
  expect(await repository().read(actor, brand.id)).toEqual(hostel);
  expect(lockActor).toHaveBeenCalledWith(database, actor, expect.any(Function));
  expect(lockSetupScope).toHaveBeenCalledWith(database, actor, { kind: 'brand', id: brand.id });
  expect(readHostelSetup).toHaveBeenCalledWith(database, brand.id);
});
it('OWN-001 SEC: owner list checks exact organization, excludes archives and paginates', async () => {
  const next = { ...brand, id: randomUUID() };
  rows = [brand, next];
  expect(await repository().list(actor, brand.organizationId, { limit: 1 })).toEqual({
    data: [brand],
    nextCursor: brand.id,
  });
  expect(chain.limit).toHaveBeenCalledWith(2);
  expect(lockSetupScope).toHaveBeenCalledWith(database, actor, {
    kind: 'organization',
    id: brand.organizationId,
  });
  await repository().list(actor, brand.organizationId, { limit: 20, cursor: brand.id });
  const query = new PgDialect().sqlToQuery(chain.where.mock.calls.at(-1)?.[0] as SQL);
  expect(query.params).toEqual([brand.organizationId, brand.id]);
  expect(query.sql).toContain('"brands"."archived_at" is null');
  rows = [];
  expect(await repository().list(actor, brand.organizationId, { limit: 20 })).toEqual({
    data: [],
    nextCursor: null,
  });
});
it('OWN-001 ACC-006: creation persists brand and private incomplete primary, then fixed audit in the caller transaction', async () => {
  const result = await repository().create(
    database as never,
    actor,
    brand.organizationId,
    { name: brand.name },
    now,
  );
  expect(database.transaction).not.toHaveBeenCalled();
  expect(database.insert.mock.calls.map(([table]) => table)).toEqual([brands, branches]);
  expect(chain.values).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      organizationId: brand.organizationId,
      name: brand.name,
      logoFileId: null,
    }),
  );
  expect(chain.values).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({
      isPrimary: true,
      category: null,
      location: null,
      publicPhone: null,
      showPublicContact: false,
    }),
  );
  expect(record).toHaveBeenCalledWith(
    database,
    expect.objectContaining({
      action: 'hostel.setup.create',
      actorRole: 'owner',
      actorUserId: actor.userId,
      targetType: 'brand',
      after: result,
    }),
  );
  expect(result).not.toHaveProperty('name');
});
it('SEC: provided logo requires own clean private listing attachment before any write', async () => {
  const logoFileId = randomUUID();
  await repository().create(
    database as never,
    actor,
    brand.organizationId,
    { name: brand.name, logoFileId },
    now,
  );
  expect(requireSetupFile).toHaveBeenCalledWith(
    database,
    actor,
    'private-bucket',
    logoFileId,
    'listing_photo',
  );
  vi.mocked(requireSetupFile).mockRejectedValueOnce(new Error('Attachment unavailable'));
  database.insert.mockClear();
  await expect(
    repository().create(
      database as never,
      actor,
      brand.organizationId,
      { name: brand.name, logoFileId },
      now,
    ),
  ).rejects.toThrow('Attachment unavailable');
  expect(database.insert).not.toHaveBeenCalled();
});
it('OWN-001: basics update preserves primary name/geometry and explicit logo removal', async () => {
  await repository().basics(
    database as never,
    actor,
    brand.id,
    { name: 'Renamed', logoFileId: null, phone: '051-1234567' },
    now,
  );
  expect(chain.set).toHaveBeenNthCalledWith(1, {
    name: 'Renamed',
    logoFileId: null,
    updatedAt: now,
  });
  expect(chain.set).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({
      name: branch.name,
      publicPhone: '051-1234567',
      location: 'SRID=4326;POINT(73 33)',
    }),
  );
  expect(requireSetupFile).not.toHaveBeenCalled();
});
it('OWN-001: legacy brand without primary gains a private draft when basics are saved', async () => {
  hostel = { ...hostel, mainBranch: null };
  await repository().basics(
    database as never,
    actor,
    brand.id,
    { name: 'Legacy hostel', description: 'Saved description' },
    now,
  );
  expect(database.insert).toHaveBeenCalledWith(branches);
  expect(chain.values).toHaveBeenCalledWith(
    expect.objectContaining({
      brandId: brand.id,
      organizationId: brand.organizationId,
      description: 'Saved description',
      isPrimary: true,
      location: null,
    }),
  );
  expect(chain.set).toHaveBeenCalledWith({ name: 'Legacy hostel', updatedAt: now });
});
it('ONB-001: main draft updates validate the saved hierarchy and constrain the owned primary ID', async () => {
  await repository().main(database as never, actor, brand.id, { name: 'Renamed main' }, now);
  expect(validateSetupGeography).toHaveBeenCalledWith(
    database,
    expect.objectContaining({ name: 'Renamed main', cityId: branch.cityId }),
  );
  expect(database.update).toHaveBeenCalledWith(branches);
  const query = new PgDialect().sqlToQuery(chain.where.mock.calls[0]?.[0] as SQL);
  expect(query.params).toEqual([branch.id, brand.id]);
  expect(record).toHaveBeenCalledWith(
    database,
    expect.objectContaining({ action: 'hostel.setup.main-branch' }),
  );
});
it('ONB-001: legacy brand gains one primary from main-branch setup without inventing geography', async () => {
  hostel = { ...hostel, mainBranch: null };
  await repository().main(database as never, actor, brand.id, { name: 'Legacy main' }, now);
  expect(database.insert).toHaveBeenCalledWith(branches);
  expect(chain.values).toHaveBeenCalledWith(
    expect.objectContaining({
      brandId: brand.id,
      organizationId: brand.organizationId,
      name: 'Legacy main',
      isPrimary: true,
      location: null,
    }),
  );
});
it('SEC: invalid geography fails before saving or auditing', async () => {
  vi.mocked(validateSetupGeography).mockRejectedValueOnce(new Error('Location unavailable'));
  await expect(
    repository().main(database as never, actor, brand.id, { name: 'Main' }, now),
  ).rejects.toThrow('Location unavailable');
  expect(database.update).not.toHaveBeenCalled();
  expect(record).not.toHaveBeenCalled();
});
it('TRUST ONB-001: submission moves only to submitted and does not appoint a manager or approve', async () => {
  vi.mocked(readHostelSetup)
    .mockResolvedValueOnce(hostel)
    .mockResolvedValueOnce({
      ...hostel,
      mainBranch: { ...branch, verificationStatus: 'submitted' },
    });
  const result = await repository().submit(database as never, actor, brand.id, now);
  expect(captureVerification).toHaveBeenCalledWith(database, branch.id, actor.userId, now);
  expect(chain.set).toHaveBeenCalledWith({ verificationStatus: 'submitted', updatedAt: now });
  expect(result.verificationStatus).toBe('submitted');
  expect(record).toHaveBeenCalledWith(
    database,
    expect.objectContaining({ action: 'hostel.setup.submit', after: result }),
  );
});
it('SEC: incomplete or already submitted setup cannot mutate or produce a new audit', async () => {
  hostel = { ...hostel, mainBranch: null };
  await expect(repository().submit(database as never, actor, brand.id, now)).rejects.toThrow(
    'Complete main branch',
  );
  hostel = { ...hostel, mainBranch: { ...branch, verificationStatus: 'approved' } };
  await expect(
    repository().basics(database as never, actor, brand.id, { name: 'Spoof' }, now),
  ).rejects.toThrow('not editable');
  expect(database.update).not.toHaveBeenCalled();
  expect(record).not.toHaveBeenCalled();
});
it('ACC-006: audit failure propagates to the enclosing idempotency transaction', async () => {
  record.mockRejectedValueOnce(new Error('Audit rejected'));
  await expect(
    repository().create(database as never, actor, brand.organizationId, { name: brand.name }, now),
  ).rejects.toThrow('Audit rejected');
  expect(database.transaction).not.toHaveBeenCalled();
});
