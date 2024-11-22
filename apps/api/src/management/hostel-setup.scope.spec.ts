import { randomBytes, randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { brands, organizations } from '@hsm/db';
import type { Transaction } from '../audit/writer.js';
import { ownedProfileAttachment } from '../auth/profile-attachments.js';
import {
  lockSetupScope,
  requireOwnerSetupEvidence,
  requireSetupFile,
} from './hostel-setup.scope.js';
vi.mock('../auth/profile-attachments.js', () => ({ ownedProfileAttachment: vi.fn() }));
const actor = { userId: randomUUID(), sessionId: randomUUID() },
  targetId = randomUUID();
let row: Record<string, unknown> | undefined;
const chain = { from: vi.fn(), innerJoin: vi.fn(), where: vi.fn(), for: vi.fn() };
const database = { select: vi.fn() };
const transaction = database as unknown as Transaction;
const evidence = () => ({
  fullName: 'Owner Identity',
  phone: '+923001234567',
  email: 'owner@example.test',
  verifiedAt: new Date(),
  passwordHash: 'permanent-hash',
  cnicHash: randomBytes(32),
  cnicEncrypted: randomBytes(64),
  frontId: randomUUID(),
  backId: randomUUID(),
  agreementVersion: 'owner-foundation-v1',
});
beforeEach(() => {
  vi.clearAllMocks();
  row = { id: targetId, organizationId: randomUUID() };
  database.select.mockReturnValue(chain);
  chain.from.mockReturnValue(chain);
  chain.innerJoin.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.for.mockImplementation(async () => (row ? [row] : []));
  vi.mocked(ownedProfileAttachment).mockResolvedValue({
    id: randomUUID(),
    purpose: 'verification_document',
    scanStatus: 'clean',
  });
});
it('SEC OWN-001: organization scope locks the exact live owner object', async () => {
  expect(await lockSetupScope(transaction, actor, { kind: 'organization', id: targetId })).toBe(
    targetId,
  );
  expect(chain.from).toHaveBeenCalledWith(organizations);
  const query = new PgDialect().sqlToQuery(chain.where.mock.calls[0]?.[0] as SQL);
  expect(query.params).toEqual([targetId, actor.userId]);
  expect(query.sql).toContain('"organizations"."archived_at" is null');
  expect(chain.for).toHaveBeenCalledWith('update');
});
it('SEC OWN-001: brand scope checks its current owner and both live parents under lock', async () => {
  const organizationId = row?.organizationId;
  expect(await lockSetupScope(transaction, actor, { kind: 'brand', id: targetId })).toBe(
    organizationId,
  );
  expect(chain.from).toHaveBeenCalledWith(brands);
  const query = new PgDialect().sqlToQuery(chain.where.mock.calls[0]?.[0] as SQL);
  expect(query.params).toEqual([targetId, actor.userId]);
  expect(query.sql).toContain('"brands"."archived_at" is null');
  expect(query.sql).toContain('"organizations"."archived_at" is null');
});
it.each(['organization', 'brand'] as const)(
  'SEC: absent or foreign %s returns the same opaque denial',
  async (kind) => {
    row = undefined;
    await expect(lockSetupScope(transaction, actor, { kind, id: targetId })).rejects.toMatchObject({
      status: 404,
    });
  },
);
it('OWN-001: both private clean CNIC sides are rechecked before setup mutation or replay', async () => {
  row = evidence();
  await requireOwnerSetupEvidence(transaction, actor, 'private-bucket');
  expect(ownedProfileAttachment).toHaveBeenNthCalledWith(
    1,
    transaction,
    actor.userId,
    'private-bucket',
    row.frontId,
  );
  expect(ownedProfileAttachment).toHaveBeenNthCalledWith(
    2,
    transaction,
    actor.userId,
    'private-bucket',
    row.backId,
  );
});
it.each([
  'email',
  'verifiedAt',
  'passwordHash',
  'cnicHash',
  'cnicEncrypted',
  'frontId',
  'backId',
  'agreementVersion',
])('SEC: missing current Owner evidence %s denies setup', async (field) => {
  row = { ...evidence(), [field]: null };
  await expect(
    requireOwnerSetupEvidence(transaction, actor, 'private-bucket'),
  ).rejects.toMatchObject({ status: 403 });
  expect(ownedProfileAttachment).not.toHaveBeenCalled();
});
it('SEC: a historical organization without completed Owner profile cannot bypass setup', async () => {
  row = undefined;
  await expect(
    requireOwnerSetupEvidence(transaction, actor, 'private-bucket'),
  ).rejects.toMatchObject({ status: 403 });
});
it('SEC: a different agreement version is not silently accepted', async () => {
  row = { ...evidence(), agreementVersion: 'unsupported' };
  await expect(
    requireOwnerSetupEvidence(transaction, actor, 'private-bucket'),
  ).rejects.toMatchObject({ status: 403 });
});
it('SEC: foreign, wrong-bucket or public attachment and wrong purpose are opaque', async () => {
  vi.mocked(ownedProfileAttachment).mockResolvedValue(undefined);
  await expect(
    requireSetupFile(transaction, actor, 'private', targetId, 'listing_photo'),
  ).rejects.toMatchObject({ status: 404 });
  vi.mocked(ownedProfileAttachment).mockResolvedValue({
    id: targetId,
    purpose: 'avatar',
    scanStatus: 'clean',
  });
  await expect(
    requireSetupFile(transaction, actor, 'private', targetId, 'listing_photo'),
  ).rejects.toMatchObject({ status: 404 });
});
it.each(['pending', 'rejected'] as const)(
  'SEC: attachment scan state %s blocks setup',
  async (scanStatus) => {
    vi.mocked(ownedProfileAttachment).mockResolvedValue({
      id: targetId,
      purpose: 'listing_photo',
      scanStatus,
    });
    await expect(
      requireSetupFile(transaction, actor, 'private', targetId, 'listing_photo'),
    ).rejects.toMatchObject({ status: 409 });
  },
);
it('OWN-001: clean private listing attachment is accepted without returning a URL', async () => {
  vi.mocked(ownedProfileAttachment).mockResolvedValue({
    id: targetId,
    purpose: 'listing_photo',
    scanStatus: 'clean',
  });
  expect(
    await requireSetupFile(transaction, actor, 'private', targetId, 'listing_photo'),
  ).toBeUndefined();
});

it.each([{ fullName: ' ' }, { phone: null }, { phone: 'invalid' }])(
  'SEC: incomplete current Owner name/phone format denies setup without claiming phone ownership',
  async (patch) => {
    row = { ...evidence(), ...patch };
    await expect(
      requireOwnerSetupEvidence(transaction, actor, 'private-bucket'),
    ).rejects.toMatchObject({ status: 403 });
  },
);

it('OWN-001: optional Owner photos do not prevent saving private hostel basics; submission still requires both', async () => {
  row = { ...evidence(), frontId: null, backId: null };
  await expect(
    requireOwnerSetupEvidence(transaction, actor, 'private-bucket', false),
  ).resolves.toBeUndefined();
  expect(ownedProfileAttachment).not.toHaveBeenCalled();
  await expect(
    requireOwnerSetupEvidence(transaction, actor, 'private-bucket'),
  ).rejects.toMatchObject({ status: 403 });
});
