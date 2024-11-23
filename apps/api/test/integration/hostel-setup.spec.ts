import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import {
  brands,
  branches,
  files,
  hostelAuditLog,
  idempotencyKeys,
  managerAssignments,
  organizations,
  ownerProfiles,
} from '@hsm/db';
import { hostelOnboardingSchema, hostelOnboardingStateSchema } from '@hsm/contracts';
import { AuditWriter, type Transaction } from '../../src/audit/writer.js';
import { AuthCrypto, hashPassword } from '../../src/auth/crypto.js';
import { HostelSetupRepository } from '../../src/management/hostel-setup.repository.js';
import { HostelSetupService } from '../../src/management/hostel-setup.service.js';
import { IdempotencyRepository } from '../../src/idempotency/repository.js';
import { IdempotencyService } from '../../src/idempotency/service.js';
import { testKeys } from '../keys.js';
import { authFixture } from './auth-fixture.js';
import { ownerDocument, ownerIdentity } from './owner-profile-fixture.js';
import {
  createSetup,
  mutateSetup,
  setupGeography,
  setupOwner,
  type SetupFixture,
} from './hostel-setup-fixture.js';
const now = new Date('2026-10-11T00:00:00Z');
let fixture: SetupFixture, passwordHash: string;
beforeAll(async () => {
  fixture = await authFixture(new AuthCrypto(testKeys()), now);
  passwordHash = await hashPassword('Permanent hostel setup integration phrase');
});
afterAll(async () => {
  await fixture?.close();
});
const owner = () => setupOwner(fixture, passwordHash, now);
const read = (headers: Record<string, string>, brandId: string) =>
  fixture.application.inject({
    url: `/v1/owner/brands/${brandId}/onboarding`,
    headers,
  });
const audits = (brandId: string) =>
  fixture.connection.db
    .select()
    .from(hostelAuditLog)
    .where(and(eq(hostelAuditLog.targetType, 'brand'), eq(hostelAuditLog.targetId, brandId)));
it('OWN-001 ONB-001 ACC-006: real creation saves one private incomplete primary with safe audit and fresh owner read/list', async () => {
  const identity = await owner(),
    response = await createSetup(fixture, identity);
  expect(response.statusCode).toBe(201);
  const state = hostelOnboardingStateSchema.parse(response.json());
  expect(state).toMatchObject({
    organizationId: identity.organizationId,
    verificationStatus: 'draft',
    missingFields: ['category', 'city', 'area', 'address', 'location'],
  });
  const [branch] = await fixture.connection.db
    .select()
    .from(branches)
    .where(eq(branches.id, z.string().uuid().parse(state.mainBranchId)));
  expect(branch).toMatchObject({
    organizationId: identity.organizationId,
    brandId: state.id,
    isPrimary: true,
    verificationStatus: 'draft',
    firstApprovedAt: null,
    cityId: null,
    areaId: null,
    location: null,
    addressLine: null,
    publicPhone: null,
    showPublicContact: false,
  });
  const detail = await read(identity.headers, state.id);
  expect(detail.statusCode).toBe(200);
  expect(detail.headers['cache-control']).toBe('no-store');
  expect(hostelOnboardingSchema.parse(detail.json()).mainBranch?.location).toBeNull();
  const list = await fixture.application.inject({
    url: `/v1/owner/organizations/${identity.organizationId}/brands`,
    headers: identity.headers,
  });
  expect(list.json().data).toEqual([
    {
      id: state.id,
      organizationId: identity.organizationId,
      name: 'Private draft hostel',
      logoFileId: null,
    },
  ]);
  const [audit] = await audits(state.id);
  expect(audit?.after).toEqual(state);
  expect(JSON.stringify(audit?.after)).not.toContain('Private draft hostel');
});
it('ONB-001 TRUST: partial setup persists and complete submission remains unapproved without appointing a manager', async () => {
  const identity = await owner(),
    created = await createSetup(fixture, identity);
  const { id, mainBranchId } = hostelOnboardingStateSchema.parse(created.json());
  expect((await mutateSetup(fixture, identity, id, 'submit', {})).statusCode).toBe(409);
  const geography = await setupGeography(fixture);
  expect(
    (
      await mutateSetup(fixture, identity, id, 'main-branch', {
        name: 'Main',
        cityId: geography.cityId,
      })
    ).statusCode,
  ).toBe(200);
  expect((await read(identity.headers, id)).json().mainBranch).toMatchObject({
    cityId: geography.cityId,
    areaId: null,
    location: null,
  });
  expect(
    (
      await mutateSetup(fixture, identity, id, 'main-branch', {
        ...geography,
        nearbyLandmark: 'Actual landmark',
        phone: '051-1234567',
      })
    ).statusCode,
  ).toBe(200);
  const submission = await mutateSetup(fixture, identity, id, 'submit', {});
  expect(submission.statusCode).toBe(200);
  expect(submission.json()).toMatchObject({ verificationStatus: 'submitted', missingFields: [] });
  const fresh = hostelOnboardingSchema.parse((await read(identity.headers, id)).json());
  expect(fresh.mainBranch).toMatchObject({
    location: geography.location,
    nearbyLandmark: 'Actual landmark',
    phone: '051-1234567',
  });
  expect(
    await fixture.connection.db
      .select()
      .from(managerAssignments)
      .where(eq(managerAssignments.branchId, z.string().uuid().parse(mainBranchId))),
  ).toHaveLength(0);
  const [branch] = await fixture.connection.db
    .select()
    .from(branches)
    .where(eq(branches.id, z.string().uuid().parse(mainBranchId)));
  expect(branch).toMatchObject({
    verificationStatus: 'submitted',
    firstApprovedAt: null,
    showPublicContact: false,
  });
  expect(
    (await mutateSetup(fixture, identity, id, 'basics', { name: 'Unreviewed change' })).statusCode,
  ).toBe(409);
  expect(
    (await mutateSetup(fixture, identity, id, 'main-branch', { name: 'Unreviewed change' }))
      .statusCode,
  ).toBe(409);
});
it('SEC ACC-006: real identical creation retries serialize to one brand/primary/audit and changed bodies conflict', async () => {
  const identity = await owner(),
    key = randomUUID();
  const responses = await Promise.all([
    createSetup(fixture, identity, { name: 'One hostel' }, key),
    createSetup(fixture, identity, { name: 'One hostel' }, key),
  ]);
  expect(responses.map((response) => response.statusCode)).toEqual([201, 201]);
  expect(responses[0]?.json()).toEqual(responses[1]?.json());
  expect(responses.map((response) => response.headers['idempotency-replayed']).sort()).toEqual([
    'false',
    'true',
  ]);
  const { id } = hostelOnboardingStateSchema.parse(responses[0]?.json());
  expect(
    await fixture.connection.db
      .select()
      .from(brands)
      .where(eq(brands.organizationId, identity.organizationId)),
  ).toHaveLength(1);
  expect(
    await fixture.connection.db.select().from(branches).where(eq(branches.brandId, id)),
  ).toHaveLength(1);
  expect(await audits(id)).toHaveLength(1);
  expect((await createSetup(fixture, identity, { name: 'Different hostel' }, key)).statusCode).toBe(
    409,
  );
});
it('SEC: foreign organization and brand IDs are concealed even when the caller is another valid Owner', async () => {
  const a = await owner(),
    b = await owner(),
    created = await createSetup(fixture, a);
  const { id } = hostelOnboardingStateSchema.parse(created.json());
  expect((await createSetup(fixture, { ...b, organizationId: a.organizationId })).statusCode).toBe(
    404,
  );
  expect((await read(b.headers, id)).statusCode).toBe(404);
  for (const action of ['basics', 'main-branch', 'submit'] as const)
    expect(
      (await mutateSetup(fixture, b, id, action, action === 'submit' ? {} : { name: 'Foreign' }))
        .statusCode,
    ).toBe(404);
});
it('SEC: archived brand scope is rechecked before replay without creating another audit', async () => {
  const identity = await owner(),
    created = await createSetup(fixture, identity);
  const { id } = hostelOnboardingStateSchema.parse(created.json()),
    key = randomUUID();
  const first = await mutateSetup(fixture, identity, id, 'basics', { name: 'Saved name' }, key);
  expect(first.statusCode).toBe(200);
  await fixture.connection.db.update(brands).set({ archivedAt: now }).where(eq(brands.id, id));
  expect(
    (await mutateSetup(fixture, identity, id, 'basics', { name: 'Saved name' }, key)).statusCode,
  ).toBe(404);
  expect((await read(identity.headers, id)).statusCode).toBe(404);
  expect(await audits(id)).toHaveLength(2);
});
it('SEC: wrong city/area/sub-area hierarchy rolls back changes, audit and replay response', async () => {
  const identity = await owner(),
    created = await createSetup(fixture, identity);
  const { id } = hostelOnboardingStateSchema.parse(created.json());
  const a = await setupGeography(fixture),
    b = await setupGeography(fixture);
  for (const patch of [
    { areaId: b.areaId },
    { subAreaId: b.subAreaId },
    { cityId: randomUUID() },
  ]) {
    const key = randomUUID();
    expect(
      (await mutateSetup(fixture, identity, id, 'main-branch', { ...a, ...patch }, key)).statusCode,
    ).toBe(404);
    expect(
      await fixture.connection.db
        .select()
        .from(idempotencyKeys)
        .where(and(eq(idempotencyKeys.userId, identity.user.id), eq(idempotencyKeys.key, key))),
    ).toHaveLength(0);
  }
  expect((await read(identity.headers, id)).json().mainBranch).toMatchObject({
    cityId: null,
    areaId: null,
    location: null,
  });
  expect(await audits(id)).toHaveLength(1);
});
it('SEC: owner evidence and listing attachments must remain own, private, correct-purpose and clean', async () => {
  const identity = await owner(),
    foreign = await owner();
  for (const patch of [
    { uploadedBy: foreign.user.id },
    { visibility: 'public' as const },
    { bucket: 'wrong-bucket' },
    { purpose: 'avatar' as const },
  ]) {
    const logoFileId = await ownerDocument(fixture, identity.user.id, {
      purpose: 'listing_photo',
      ...patch,
    });
    expect((await createSetup(fixture, identity, { name: 'Hostel', logoFileId })).statusCode).toBe(
      404,
    );
  }
  const logoFileId = await ownerDocument(fixture, identity.user.id, {
    purpose: 'listing_photo',
    scanStatus: 'pending',
  });
  expect((await createSetup(fixture, identity, { name: 'Hostel', logoFileId })).statusCode).toBe(
    409,
  );
  await fixture.connection.db
    .update(files)
    .set({ scanStatus: 'clean' })
    .where(eq(files.id, logoFileId));
  expect((await createSetup(fixture, identity, { name: 'Hostel', logoFileId })).statusCode).toBe(
    201,
  );
  await fixture.connection.db
    .update(files)
    .set({ scanStatus: 'rejected' })
    .where(eq(files.id, identity.body.cnicFrontFileId));
  expect((await createSetup(fixture, identity)).statusCode).toBe(409);
});
it('SEC: historical organization ownership alone cannot replace revised Owner profile completion', async () => {
  const identity = await ownerIdentity(fixture, passwordHash, now),
    organizationId = randomUUID();
  await fixture.connection.db
    .insert(organizations)
    .values({ id: organizationId, ownerUserId: identity.user.id, name: 'Historical organization' });
  expect((await createSetup(fixture, { ...identity, organizationId })).statusCode).toBe(403);
});
it('ACC-006: actual audit FK failure rolls back created brand, primary and idempotency response', async () => {
  const identity = await owner(),
    actor = await fixture.service.authenticate(identity.credential.accessToken);
  class RejectingAudit extends AuditWriter {
    override hostel(database: Transaction, event: Parameters<AuditWriter['hostel']>[1]) {
      return super.hostel(database, { ...event, organizationId: randomUUID() });
    }
  }
  const database = fixture.connection.db,
    key = randomUUID();
  const service = new HostelSetupService(
    new HostelSetupRepository(database, 'auth-private-fixture', new RejectingAudit(), () => now),
    new IdempotencyService(new IdempotencyRepository(database), () => now),
    () => now,
  );
  await expect(
    service.create(actor, key, identity.organizationId, { name: 'Atomic hostel' }),
  ).rejects.toThrow();
  expect(
    await database.select().from(brands).where(eq(brands.organizationId, identity.organizationId)),
  ).toHaveLength(0);
  expect(
    await database
      .select()
      .from(branches)
      .where(eq(branches.organizationId, identity.organizationId)),
  ).toHaveLength(0);
  expect(
    await database
      .select()
      .from(idempotencyKeys)
      .where(and(eq(idempotencyKeys.userId, actor.userId), eq(idempotencyKeys.key, key))),
  ).toHaveLength(0);
  expect(
    await database
      .select()
      .from(hostelAuditLog)
      .where(eq(hostelAuditLog.organizationId, identity.organizationId)),
  ).toHaveLength(0);
});
it('SEC: persisted logout immediately denies next setup mutation with an otherwise valid access JWT', async () => {
  const identity = await owner();
  await fixture.service.logout(identity.user.id, identity.credential.sessionId);
  expect((await createSetup(fixture, identity)).statusCode).toBe(401);
  expect(
    await fixture.connection.db
      .select()
      .from(brands)
      .where(eq(brands.organizationId, identity.organizationId)),
  ).toHaveLength(0);
});
it('ONB-001 ACC-006: concurrent verification submissions produce one state transition and one submission audit', async () => {
  const identity = await owner(),
    created = await createSetup(fixture, identity);
  const { id } = hostelOnboardingStateSchema.parse(created.json());
  expect(
    (await mutateSetup(fixture, identity, id, 'main-branch', await setupGeography(fixture)))
      .statusCode,
  ).toBe(200);
  const responses = await Promise.all([
    mutateSetup(fixture, identity, id, 'submit', {}),
    mutateSetup(fixture, identity, id, 'submit', {}),
  ]);
  expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 409]);
  expect((await audits(id)).filter((row) => row.action === 'hostel.setup.submit')).toHaveLength(1);
});

it('OWN-001: private basics save without optional CNIC photos, while final submission keeps its evidence gate', async () => {
  const identity = await owner();
  await fixture.connection.db
    .update(ownerProfiles)
    .set({ cnicFrontFileId: null, cnicBackFileId: null })
    .where(eq(ownerProfiles.userId, identity.user.id));
  const response = await createSetup(fixture, identity);
  expect(response.statusCode).toBe(201);
  const state = hostelOnboardingStateSchema.parse(response.json());
  expect(state.verificationStatus).toBe('draft');
  expect((await read(identity.headers, state.id)).statusCode).toBe(200);
  expect((await mutateSetup(fixture, identity, state.id, 'submit', {})).statusCode).toBe(403);
});
