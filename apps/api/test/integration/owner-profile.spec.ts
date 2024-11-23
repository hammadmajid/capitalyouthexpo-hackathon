import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  files,
  customerProfiles,
  organizations,
  ownerProfiles,
  platformAuditLog,
  users,
} from '@hsm/db';
import { AuditWriter, type Transaction } from '../../src/audit/writer.js';
import { AuthCrypto, hashPassword } from '../../src/auth/crypto.js';
import { OwnerProfileRepository } from '../../src/auth/owner-profile.repository.js';
import { OwnerProfileService } from '../../src/auth/owner-profile.service.js';
import { ProfileRepository } from '../../src/auth/profile.repository.js';
import { authFixture } from './auth-fixture.js';
import {
  ownerDocument,
  ownerIdentity,
  ownerRequest,
  type OwnerFixture,
} from './owner-profile-fixture.js';
const now = new Date('2026-10-10T12:00:00Z');
const crypto = new AuthCrypto({
  JWT_SECRET: randomBytes(48).toString('hex'),
  CNIC_HASH_KEY: randomBytes(32).toString('hex'),
  CNIC_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
});
let fixture: OwnerFixture;
let permanentHash: string;
beforeAll(async () => {
  fixture = await authFixture(crypto, now);
  permanentHash = await hashPassword('Permanent Owner integration phrase');
});
afterAll(async () => {
  await fixture?.close();
});
const identity = () => ownerIdentity(fixture, permanentHash, now);
const complete = (headers: Record<string, string>, body: Record<string, unknown>) =>
  ownerRequest(fixture, headers, body);
async function ownerRows(userId: string) {
  return fixture.connection.db.select().from(ownerProfiles).where(eq(ownerProfiles.userId, userId));
}
async function organizationRows(userId: string) {
  return fixture.connection.db
    .select()
    .from(organizations)
    .where(eq(organizations.ownerUserId, userId));
}
it('OWN-001 CHG-006: real Owner completion protects CNIC and adds capability without overwriting Customer identity history', async () => {
  const scope = await identity();
  const historicalAddress = 'Historical Customer permanent address';
  await fixture.connection.db
    .update(users)
    .set({
      fullName: scope.body.fullName,
      gender: 'female',
      phoneE164: scope.body.phone,
      permanentAddress: historicalAddress,
    })
    .where(eq(users.id, scope.user.id));
  await fixture.connection.db
    .insert(customerProfiles)
    .values({ userId: scope.user.id, age: 21, profileCompletedAt: now });
  const response = await complete(scope.headers, scope.body);
  expect(response.statusCode).toBe(200);
  expect(response.json().capabilities).toMatchObject({ customer: true, owner: true });
  expect(response.json().user.cnicLast4).toBe(scope.body.cnic.slice(-4));
  expect(response.json().user).not.toHaveProperty('cnic');
  const [persisted] = await fixture.connection.db
    .select()
    .from(users)
    .where(eq(users.id, scope.user.id));
  expect(persisted).toMatchObject({
    permanentAddress: historicalAddress,
    emailVerifiedAt: now,
    passwordHash: permanentHash,
    phoneVerifiedAt: null,
  });
  expect(persisted?.cnicHash).toEqual(crypto.protectCnic(scope.body.cnic).cnicHash);
  if (!persisted?.cnicEncrypted) throw new Error('Missing encrypted Owner identity');
  expect(crypto.decrypt(persisted.cnicEncrypted, 'cnic')).toBe(scope.body.cnic);
  const [profile] = await ownerRows(scope.user.id);
  expect(profile).toMatchObject({
    address: scope.body.address,
    cnicFrontFileId: scope.body.cnicFrontFileId,
    cnicBackFileId: scope.body.cnicBackFileId,
    agreementVersion: scope.body.agreementVersion,
    agreementAcceptedAt: now,
  });
  expect(await organizationRows(scope.user.id)).toHaveLength(1);
  const audit = await fixture.connection.db
    .select()
    .from(platformAuditLog)
    .where(eq(platformAuditLog.targetId, scope.user.id));
  expect(audit).toHaveLength(1);
  const evidence = JSON.stringify(audit[0]?.after);
  for (const value of [
    scope.body.cnic,
    scope.body.phone,
    scope.body.address,
    scope.body.cnicFrontFileId,
  ])
    expect(evidence).not.toContain(value);
});
it('OWN-001: an existing live organization is reused without rename and original acceptance metadata survives profile updates', async () => {
  const scope = await identity();
  await fixture.connection.db
    .insert(organizations)
    .values({ ownerUserId: scope.user.id, name: 'Existing private organization' });
  expect(
    (await complete(scope.headers, { ...scope.body, organizationName: 'Never silently rename' }))
      .statusCode,
  ).toBe(200);
  const firstAcceptance = new Date(now.getTime() - 1000);
  await fixture.connection.db
    .update(ownerProfiles)
    .set({ agreementAcceptedAt: firstAcceptance, profileCompletedAt: firstAcceptance })
    .where(eq(ownerProfiles.userId, scope.user.id));
  expect(
    (
      await complete(scope.headers, {
        ...scope.body,
        address: 'Updated Owner correspondence address',
      })
    ).statusCode,
  ).toBe(200);
  const persistedOrganizations = await organizationRows(scope.user.id);
  expect(persistedOrganizations).toHaveLength(1);
  expect(persistedOrganizations[0]?.name).toBe('Existing private organization');
  const [profile] = await ownerRows(scope.user.id);
  expect(profile).toMatchObject({
    agreementAcceptedAt: firstAcceptance,
    profileCompletedAt: firstAcceptance,
    address: 'Updated Owner correspondence address',
  });
});
it('SEC: real Owner evidence rejects foreign, public, wrong-bucket, unclean and wrong-purpose files without partial grants', async () => {
  const scope = await identity(),
    other = await identity();
  const cases = [
    { id: await ownerDocument(fixture, other.user.id), status: 404 },
    { id: await ownerDocument(fixture, scope.user.id, { visibility: 'public' }), status: 404 },
    { id: await ownerDocument(fixture, scope.user.id, { bucket: 'foreign-bucket' }), status: 404 },
    {
      id: await ownerDocument(fixture, scope.user.id, { scanStatus: 'pending', sha256: null }),
      status: 409,
    },
    {
      id: await ownerDocument(fixture, scope.user.id, { scanStatus: 'rejected', sha256: null }),
      status: 409,
    },
    { id: await ownerDocument(fixture, scope.user.id, { purpose: 'avatar' }), status: 404 },
  ];
  for (const entry of cases)
    expect(
      (await complete(scope.headers, { ...scope.body, cnicFrontFileId: entry.id })).statusCode,
    ).toBe(entry.status);
  expect(await ownerRows(scope.user.id)).toHaveLength(0);
  expect(await organizationRows(scope.user.id)).toHaveLength(0);
  const [user] = await fixture.connection.db
    .select()
    .from(users)
    .where(eq(users.id, scope.user.id));
  expect(user?.cnicHash).toBeNull();
});
it.each(['cnic', 'phone'] as const)(
  'SEC: real unique %s conflict rolls back Owner identity, evidence, organization and audit',
  async (field) => {
    const scope = await identity(),
      other = await identity();
    await fixture.connection.db
      .update(users)
      .set(field === 'cnic' ? crypto.protectCnic(scope.body.cnic) : { phoneE164: scope.body.phone })
      .where(eq(users.id, other.user.id));
    const response = await complete(scope.headers, scope.body);
    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe('IDENTITY_EXISTS');
    expect(await ownerRows(scope.user.id)).toHaveLength(0);
    expect(await organizationRows(scope.user.id)).toHaveLength(0);
    const [user] = await fixture.connection.db
      .select()
      .from(users)
      .where(eq(users.id, scope.user.id));
    expect(user).toMatchObject({
      fullName: '',
      cnicHash: null,
      cnicEncrypted: null,
      phoneE164: null,
    });
    expect(
      await fixture.connection.db
        .select()
        .from(platformAuditLog)
        .where(eq(platformAuditLog.targetId, scope.user.id)),
    ).toHaveLength(0);
  },
);
it('OWN-001 SEC: concurrent real Owner completions preserve one profile and one owner organization', async () => {
  const scope = await identity();
  const results = await Promise.all([
    complete(scope.headers, scope.body),
    complete(scope.headers, scope.body),
  ]);
  expect(results.map((result) => result.statusCode)).toEqual([200, 200]);
  expect(await ownerRows(scope.user.id)).toHaveLength(1);
  expect(await organizationRows(scope.user.id)).toHaveLength(1);
});
class InvalidAuditActor extends AuditWriter {
  override platform(transaction: Transaction, event: Parameters<AuditWriter['platform']>[1]) {
    return super.platform(transaction, { ...event, actorUserId: randomUUID() });
  }
}
it('SEC-003: real audit FK failure rolls back Owner profile, protected identity and organization creation together', async () => {
  const scope = await identity();
  const service = new OwnerProfileService(
    new OwnerProfileRepository(
      fixture.connection.db,
      'auth-private-fixture',
      new InvalidAuditActor(),
      () => now,
    ),
    crypto,
    new ProfileRepository(fixture.connection.db),
    () => now,
  );
  await expect(
    service.complete({ userId: scope.user.id, sessionId: scope.credential.sessionId }, scope.body),
  ).rejects.toThrow();
  expect(await ownerRows(scope.user.id)).toHaveLength(0);
  expect(await organizationRows(scope.user.id)).toHaveLength(0);
  const [user] = await fixture.connection.db
    .select()
    .from(users)
    .where(eq(users.id, scope.user.id));
  expect(user).toMatchObject({
    fullName: '',
    phoneE164: null,
    cnicHash: null,
    cnicEncrypted: null,
  });
});
it('SEC: a real existing CNIC mismatch cannot replace protected identity through Owner completion', async () => {
  const scope = await identity();
  const existing = crypto.protectCnic(
    scope.body.cnic.slice(0, -1) + (scope.body.cnic.endsWith('0') ? '1' : '0'),
  );
  await fixture.connection.db.update(users).set(existing).where(eq(users.id, scope.user.id));
  expect((await complete(scope.headers, scope.body)).statusCode).toBe(409);
  const [user] = await fixture.connection.db
    .select()
    .from(users)
    .where(eq(users.id, scope.user.id));
  expect(user?.cnicHash).toEqual(existing.cnicHash);
  expect(user?.cnicEncrypted).toEqual(existing.cnicEncrypted);
  expect(await ownerRows(scope.user.id)).toHaveLength(0);
  expect(await organizationRows(scope.user.id)).toHaveLength(0);
});
it('SEC: persisted logout denies the next protected Owner completion request', async () => {
  const scope = await identity();
  await fixture.service.logout(scope.user.id, scope.credential.sessionId);
  expect((await complete(scope.headers, scope.body)).statusCode).toBe(401);
  expect(await ownerRows(scope.user.id)).toHaveLength(0);
  expect(await organizationRows(scope.user.id)).toHaveLength(0);
});

it('OWN-001 CHG-024: real API completes without photos and later omissions preserve uploaded evidence', async () => {
  const scope = await identity();
  const withoutPhotos = { ...scope.body, cnicFrontFileId: undefined, cnicBackFileId: undefined };
  const response = await complete(scope.headers, withoutPhotos);
  expect(response.statusCode).toBe(200);
  expect(response.json().capabilities.owner).toBe(true);
  expect((await ownerRows(scope.user.id))[0]).toMatchObject({
    cnicFrontFileId: null,
    cnicBackFileId: null,
  });
  expect((await complete(scope.headers, scope.body)).statusCode).toBe(200);
  expect(
    (await complete(scope.headers, { ...withoutPhotos, address: 'Updated Owner address' }))
      .statusCode,
  ).toBe(200);
  expect((await ownerRows(scope.user.id))[0]).toMatchObject({
    cnicFrontFileId: scope.body.cnicFrontFileId,
    cnicBackFileId: scope.body.cnicBackFileId,
  });
});

it('SEC-003 / CHG-059: real self-profile omission preserves the avatar and null unlinks it without deleting its private file', async () => {
  const scope = await identity(),
    other = await identity();
  const avatar = await ownerDocument(fixture, scope.user.id, { purpose: 'avatar' });
  expect(
    (await complete(scope.headers, { ...scope.body, profilePhotoFileId: avatar })).statusCode,
  ).toBe(200);
  expect((await complete(scope.headers, scope.body)).statusCode).toBe(200);
  const current = async () =>
    (await fixture.connection.db.select().from(users).where(eq(users.id, scope.user.id)))[0];
  expect((await current())?.profilePhotoFileId).toBe(avatar);
  expect(
    (await complete(other.headers, { ...other.body, profilePhotoFileId: avatar })).statusCode,
  ).toBe(404);
  expect(
    (await complete(scope.headers, { ...scope.body, profilePhotoFileId: null })).statusCode,
  ).toBe(200);
  expect((await current())?.profilePhotoFileId).toBeNull();
  const retained = await fixture.connection.db.select().from(files).where(eq(files.id, avatar));
  expect(retained).toHaveLength(1);
  expect(retained[0]?.uploadedBy).toBe(scope.user.id);
  const audit = await fixture.connection.db
    .select()
    .from(platformAuditLog)
    .where(eq(platformAuditLog.targetId, scope.user.id));
  expect(audit.some((row) => row.action === 'owner.profile.save')).toBe(true);
});
