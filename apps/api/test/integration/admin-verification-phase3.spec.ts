import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import {
  adminAccounts,
  areas,
  branchVerificationEvents,
  branches,
  brands,
  cities,
  files,
  notificationOutbox,
  organizations,
  ownerProfiles,
  sensitiveAccessLog,
  users,
  verificationSubmissions,
  verificationSnapshotItems,
} from '@hsm/db';
import { AuthCrypto } from '../../src/auth/crypto.js';
import { testKeys } from '../keys.js';
import { authFixture } from './auth-fixture.js';
import { IdempotencyService } from '../../src/idempotency/service.js';
import { IdempotencyRepository } from '../../src/idempotency/repository.js';
import { GovernanceService } from '../../src/admin/governance.service.js';
import { VerificationReadService } from '../../src/admin/verification-read.service.js';
import { AuditWriter } from '../../src/audit/writer.js';
import * as notices from '../../src/services/notify.js';
import { captureVerification } from '../../src/admin/verification-capture.js';
import { VerificationSnapshotsService } from '../../src/admin/verification-snapshots.service.js';
import type { Actor } from '../../src/authorization/store.js';
let f: Awaited<ReturnType<typeof authFixture>>;
let actor: Actor;
let governance: GovernanceService;
let reader: VerificationReadService;
const now = new Date('2026-10-30T10:00:00Z');
const root = randomUUID(),
  owner = randomUUID(),
  org = randomUUID(),
  brand = randomUUID();
const city = randomUUID(),
  area = randomUUID(),
  branch = randomUUID(),
  front = randomUUID(),
  back = randomUUID();
const signer = vi.fn(async () => 'https://private.example.test/short-lived');
beforeAll(async () => {
  // authFixture always provisions its own random-port PostGIS/Redis containers.
  f = await authFixture(new AuthCrypto(testKeys()), now);
  const db = f.connection.db;
  await db.insert(users).values([
    { id: root, fullName: 'Verification Root fixture' },
    { id: owner, fullName: 'Owner fixture' },
  ]);
  await db.insert(adminAccounts).values({ userId: root, isRoot: true, status: 'active' });
  actor = { userId: root, sessionId: (await f.service.issue(root, 'mobile')).sessionId };
  await db.insert(cities).values({ id: city, name: 'Fixture city', slug: city });
  await db
    .insert(areas)
    .values({ id: area, cityId: city, level: 'area', name: 'Fixture area', slug: area });
  await db.insert(organizations).values({ id: org, ownerUserId: owner, name: 'Fixture org' });
  await db.insert(brands).values({ id: brand, organizationId: org, name: 'Fixture hostel' });
  await db.insert(branches).values({
    id: branch,
    organizationId: org,
    brandId: brand,
    name: 'Fixture branch',
    slug: branch,
    category: 'boys',
    cityId: city,
    areaId: area,
    addressLine: 'Fixture address',
    location: 'SRID=4326;POINT(73.05 33.68)',
    verificationStatus: 'submitted',
    updatedAt: now,
  });
  await db.insert(files).values(
    [front, back].map((id) => ({
      id,
      uploadedBy: owner,
      visibility: 'private' as const,
      bucket: 'verification-fixture',
      objectKey: 'private/verification_document/' + id + '/clean',
      purpose: 'verification_document' as const,
      mimeType: 'image/jpeg',
      sizeBytes: 100n,
      scanStatus: 'clean' as const,
      sha256: Buffer.alloc(32),
    })),
  );
  await db.insert(ownerProfiles).values({
    userId: owner,
    cnicFrontFileId: front,
    cnicBackFileId: back,
    address: 'Private owner address',
    agreementVersion: 'owner-foundation-v1',
    agreementAcceptedAt: now,
    profileCompletedAt: now,
  });
  const idempotency = new IdempotencyService(new IdempotencyRepository(db), () => now);
  governance = new GovernanceService(db, idempotency, () => now);
  reader = new VerificationReadService(
    db,
    { bucket: 'verification-fixture', storage: { presignDownload: signer } },
    () => now,
  );
});
afterAll(async () => {
  vi.restoreAllMocks();
  await f?.close();
});
it('NTF-001 ADM-007: outbox failure rolls back branch/event/notice; same-key retry and replay create one logical notice', async () => {
  const original = notices.notify;
  const failure = vi.spyOn(notices, 'notify').mockImplementationOnce(async (...args) => {
    await original(...args);
    throw new Error('Injected transaction interruption');
  });
  const key = randomUUID();
  const body = {
    action: 'start_review',
    expectedStatus: 'submitted',
    expectedUpdatedAt: now.toISOString(),
  };
  await expect(governance.decideVerification(actor, key, branch, body)).rejects.toThrow(
    'Injected transaction interruption',
  );
  failure.mockRestore();
  const db = f.connection.db;
  expect(
    (await db.select().from(branches).where(eq(branches.id, branch)))[0]?.verificationStatus,
  ).toBe('submitted');
  expect(
    await db
      .select()
      .from(branchVerificationEvents)
      .where(eq(branchVerificationEvents.branchId, branch)),
  ).toHaveLength(0);
  expect(
    await db.select().from(notificationOutbox).where(eq(notificationOutbox.recipientUserId, owner)),
  ).toHaveLength(0);
  const result = await governance.decideVerification(actor, key, branch, body);
  expect(result.replayed).toBe(false);
  expect((await governance.decideVerification(actor, key, branch, body)).replayed).toBe(true);
  const events = await db
    .select()
    .from(branchVerificationEvents)
    .where(eq(branchVerificationEvents.branchId, branch));
  const outbox = await db
    .select()
    .from(notificationOutbox)
    .where(eq(notificationOutbox.recipientUserId, owner));
  expect(events).toHaveLength(1);
  expect(outbox).toHaveLength(1);
  expect(outbox[0]?.payload).toEqual({
    event: 'owner.verification_updated',
    operationId: events[0]?.id,
  });
});
it('SEC-003 TRUST-002: dossier cannot leak storage keys or permanent address; cross-owner/unattached evidence denied', async () => {
  const dossier = await reader.dossier(actor, branch);
  expect(dossier.evidence).toHaveLength(2);
  expect(JSON.stringify(dossier)).not.toMatch(
    /Private owner address|objectKey|verification-fixture/,
  );
  await expect(
    reader.evidence(actor, branch, randomUUID(), { justification: 'Owner identity review' }),
  ).rejects.toMatchObject({ status: 404 });
  const foreign = randomUUID();
  await f.connection.db.insert(files).values({
    id: foreign,
    uploadedBy: root,
    visibility: 'private',
    bucket: 'verification-fixture',
    objectKey: 'private/verification_document/' + foreign + '/clean',
    purpose: 'verification_document',
    mimeType: 'image/jpeg',
    sizeBytes: 100n,
    scanStatus: 'clean',
    sha256: Buffer.alloc(32),
  });
  // Deliberately corrupt the fixture association; the server still checks true uploader.
  await f.connection.db
    .update(ownerProfiles)
    .set({ cnicFrontFileId: foreign })
    .where(eq(ownerProfiles.userId, owner));
  await expect(
    reader.evidence(actor, branch, foreign, { justification: 'Owner identity review' }),
  ).rejects.toMatchObject({ status: 404 });
  await f.connection.db
    .update(ownerProfiles)
    .set({ cnicFrontFileId: front })
    .where(eq(ownerProfiles.userId, owner));
});
it('SEC-003 TRUST-002: sensitive-audit interruption cannot return a URL; retry logs one access', async () => {
  signer.mockClear();
  const fault = vi
    .spyOn(AuditWriter.prototype, 'sensitive')
    .mockRejectedValueOnce(new Error('Injected audit outage'));
  await expect(
    reader.evidence(actor, branch, front, { justification: 'Owner identity review' }),
  ).rejects.toThrow('Injected audit outage');
  fault.mockRestore();
  expect(signer).not.toHaveBeenCalled();
  expect(
    await f.connection.db
      .select()
      .from(sensitiveAccessLog)
      .where(eq(sensitiveAccessLog.resourceId, front)),
  ).toHaveLength(0);
  expect(
    (await reader.evidence(actor, branch, front, { justification: 'Owner identity review' })).url,
  ).toBe('https://private.example.test/short-lived');
  expect(
    await f.connection.db
      .select()
      .from(sensitiveAccessLog)
      .where(
        and(eq(sensitiveAccessLog.resourceId, front), eq(sensitiveAccessLog.actorUserId, root)),
      ),
  ).toHaveLength(1);
});
it('TRUST-002: immutable submission survives later edits and exposes allowlisted approved diff', async () => {
  const db = f.connection.db;
  const first = await db.transaction(async (tx) => {
    await tx.select().from(branches).where(eq(branches.id, branch)).for('update');
    return captureVerification(tx, branch, owner, now);
  });
  await governance.decideVerification(actor, randomUUID(), branch, { action: 'approve' });
  await db
    .update(branches)
    .set({ description: 'Changed listing description', verificationStatus: 'submitted' })
    .where(eq(branches.id, branch));
  const second = await db.transaction(async (tx) => {
    await tx.select().from(branches).where(eq(branches.id, branch)).for('update');
    return captureVerification(tx, branch, owner, new Date(now.getTime() + 1000));
  });
  const result = await new VerificationSnapshotsService(db, () => now).comparison(actor, branch);
  expect(result.current?.id).toBe(second);
  expect(result.lastApproved?.id).toBe(first);
  expect(result.changedFields).toContain('description');
  expect(result.lastApproved?.dossier.description).toBeNull();
  expect(result.current?.dossier.description).toBe('Changed listing description');
  expect(result.historicalSnapshotUnavailable).toBe(false);
});
it('TRUST-002 AUD-001: database rejects mutation or deletion of immutable submission evidence', async () => {
  const db = f.connection.db;
  const [row] = await db
    .select()
    .from(verificationSubmissions)
    .where(eq(verificationSubmissions.branchId, branch));
  if (!row) throw new Error('Missing captured fixture');
  await expect(
    db
      .update(verificationSubmissions)
      .set({ dossier: {} })
      .where(eq(verificationSubmissions.id, row.id)),
  ).rejects.toThrow();
  await expect(
    db.delete(verificationSnapshotItems).where(eq(verificationSnapshotItems.submissionId, row.id)),
  ).rejects.toThrow();
});
