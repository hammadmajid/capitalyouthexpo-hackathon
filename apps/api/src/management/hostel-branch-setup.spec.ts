import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { branches, type Database } from '@hsm/db';
import type { HostelOnboarding } from '@hsm/contracts';
import { AuditWriter } from '../audit/writer.js';
import { lockActor } from '../auth/actor-lock.js';
import { lockSetupScope } from './hostel-setup.scope.js';
import { readHostelSetup, validateSetupGeography } from './hostel-setup.projection.js';
import { applyMainDraft, newAdditionalBranch, newMainBranch } from './hostel-setup.policy.js';
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
  now = new Date('2026-10-29T00:00:00Z');
const brand = { id: randomUUID(), organizationId: randomUUID(), name: 'Hostel', logoFileId: null };
const primary = {
  ...applyMainDraft(newMainBranch(randomUUID(), { name: brand.name }), {
    name: 'F-8 branch',
    category: 'girls',
    propertyTier: 'premium',
    description: 'Quiet hostel',
    phone: '0300 1234567',
    cityId: randomUUID(),
    areaId: randomUUID(),
    addressLine: 'Primary address',
    location: { latitude: 33.7, longitude: 73.04 },
  }),
  verificationStatus: 'submitted' as const,
};
const extra = { ...newAdditionalBranch(randomUUID(), primary, { name: 'G-10 branch' }) };
let hostel: HostelOnboarding;
const chain = { set: vi.fn(), values: vi.fn(), where: vi.fn(), then: vi.fn() };
const database = { insert: vi.fn(), update: vi.fn(), transaction: vi.fn() };
const audit = new AuditWriter(),
  record = vi.spyOn(audit, 'hostel');
const repository = () =>
  new HostelSetupRepository(database as unknown as Database, 'private-bucket', audit, () => now);
beforeEach(() => {
  vi.clearAllMocks();
  hostel = {
    ...brand,
    mainBranch: { ...primary, verificationStatus: 'approved' },
    missingFields: [],
  };
  database.insert.mockReturnValue(chain);
  database.update.mockReturnValue(chain);
  for (const key of ['set', 'values', 'where'] as const) chain[key].mockReturnValue(chain);
  chain.then.mockImplementation((resolve: (value: unknown) => unknown) => resolve(undefined));
  database.transaction.mockImplementation(
    async (work: (transaction: unknown) => Promise<unknown>) => work(database),
  );
  vi.mocked(lockActor).mockResolvedValue(undefined);
  vi.mocked(lockSetupScope).mockResolvedValue(brand.organizationId);
  vi.mocked(readHostelSetup).mockImplementation(async () => hostel);
  vi.mocked(validateSetupGeography).mockResolvedValue(undefined);
  record.mockResolvedValue(undefined);
});
it('BRN-001: an additional branch needs a submitted main branch and copies only its basics', () => {
  expect(extra).toMatchObject({
    name: 'G-10 branch',
    isPrimary: false,
    verificationStatus: 'draft',
    category: 'girls',
    propertyTier: 'premium',
    description: 'Quiet hostel',
    cityId: null,
    areaId: null,
    addressLine: null,
    location: null,
  });
  for (const main of [null, { ...primary, verificationStatus: 'draft' as const }])
    expect(() => newAdditionalBranch(randomUUID(), main, { name: 'Branch' })).toThrow(
      'Submit the main branch before adding branches',
    );
});
it('BRN-001 ACC-006: adding a branch inserts a private non-primary draft and audits that branch', async () => {
  const state = await repository().addBranch(
    database as never,
    actor,
    brand.id,
    { name: 'G-10 branch' },
    now,
  );
  expect(database.insert).toHaveBeenCalledWith(branches);
  const inserted = chain.values.mock.calls[0]?.[0] as Record<string, unknown>;
  expect(inserted).toMatchObject({
    organizationId: brand.organizationId,
    brandId: brand.id,
    isPrimary: false,
    name: 'G-10 branch',
    category: 'girls',
    location: null,
  });
  expect(inserted).not.toHaveProperty('verificationStatus');
  expect(String(inserted.slug)).toMatch(/^branch-/);
  expect(readHostelSetup).toHaveBeenLastCalledWith(database, brand.id, inserted.id);
  expect(record).toHaveBeenCalledWith(
    database,
    expect.objectContaining({ action: 'hostel.setup.branch.create', targetId: brand.id }),
  );
  expect(state).toMatchObject({ id: brand.id });
});
it('BRN-001 SEC: branch save edits only the selected draft branch of the locked hostel', async () => {
  hostel = { ...brand, mainBranch: extra, missingFields: ['city'] };
  await repository().saveBranch(
    database as never,
    actor,
    { brandId: brand.id, branchId: extra.id },
    { name: 'G-10 branch', addressLine: 'Street 1, G-10' },
    now,
  );
  expect(readHostelSetup).toHaveBeenCalledWith(database, brand.id, extra.id);
  expect(chain.set).toHaveBeenCalledWith(
    expect.objectContaining({ addressLine: 'Street 1, G-10', name: 'G-10 branch' }),
  );
  expect(record).toHaveBeenCalledWith(
    database,
    expect.objectContaining({ action: 'hostel.setup.branch' }),
  );
});
it('BRN-001: a submitted branch cannot be edited and an incomplete one cannot be submitted', async () => {
  hostel = {
    ...brand,
    mainBranch: { ...extra, verificationStatus: 'submitted' },
    missingFields: [],
  };
  const target = { brandId: brand.id, branchId: extra.id };
  await expect(
    repository().saveBranch(database as never, actor, target, { name: 'Renamed' }, now),
  ).rejects.toThrow('Hostel setup is not editable');
  hostel = { ...brand, mainBranch: extra, missingFields: ['city'] };
  await expect(repository().submitBranch(database as never, actor, target, now)).rejects.toThrow(
    'Complete main branch setup before submission',
  );
  expect(database.update).not.toHaveBeenCalled();
});
it('BRN-001 ONB-001: a complete branch is submitted for verification on its own', async () => {
  const complete = applyMainDraft(extra, {
    name: 'G-10 branch',
    cityId: randomUUID(),
    areaId: randomUUID(),
    addressLine: 'Street 1, G-10',
    location: { latitude: 33.68, longitude: 73.02 },
  });
  hostel = { ...brand, mainBranch: complete, missingFields: [] };
  await repository().submitBranch(
    database as never,
    actor,
    { brandId: brand.id, branchId: extra.id },
    now,
  );
  expect(chain.set).toHaveBeenCalledWith({ verificationStatus: 'submitted', updatedAt: now });
  expect(captureVerification).toHaveBeenCalledWith(database, extra.id, actor.userId, now);
  expect(record).toHaveBeenCalledWith(
    database,
    expect.objectContaining({ action: 'hostel.setup.branch.submit', branchId: extra.id }),
  );
});
it('BRN-001 SEC: branch read rechecks actor and owned hostel before reading that branch', async () => {
  await repository().readBranch(actor, brand.id, extra.id);
  expect(lockActor).toHaveBeenCalled();
  expect(lockSetupScope).toHaveBeenCalledWith(database, actor, { kind: 'brand', id: brand.id });
  expect(readHostelSetup).toHaveBeenCalledWith(database, brand.id, extra.id);
});
it('BRN-001 SEC: a hostel whose main branch is still a draft cannot get another branch', async () => {
  hostel = { ...brand, mainBranch: { ...primary, verificationStatus: 'draft' }, missingFields: [] };
  await expect(
    repository().addBranch(database as never, actor, brand.id, { name: 'G-10 branch' }, now),
  ).rejects.toThrow('Submit the main branch before adding branches');
  expect(database.insert).not.toHaveBeenCalled();
  expect(record).not.toHaveBeenCalled();
});
