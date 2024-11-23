import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { customerProfiles, files, organizations, platformAuditLog, users } from '@hsm/db';
import { AuditWriter, type Transaction } from '../../src/audit/writer.js';
import { AuthCrypto, hashPassword } from '../../src/auth/crypto.js';
import { CustomerProfileRepository } from '../../src/auth/customer-profile.repository.js';
import { CustomerProfileService } from '../../src/auth/customer-profile.service.js';
import { ProfileRepository } from '../../src/auth/profile.repository.js';
import { authFixture } from './auth-fixture.js';
const now = new Date('2026-10-10T12:00:00Z');
const crypto = new AuthCrypto({
  JWT_SECRET: randomBytes(48).toString('hex'),
  CNIC_HASH_KEY: randomBytes(32).toString('hex'),
  CNIC_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
});
let fixture: Awaited<ReturnType<typeof authFixture>>;
let permanentHash: string;
beforeAll(async () => {
  fixture = await authFixture(crypto, now);
  permanentHash = await hashPassword('Permanent customer integration phrase');
});
afterAll(async () => {
  await fixture?.close();
});
const phone = () => '+923' + randomInt(100000000, 999999999).toString();
async function identity() {
  const [user] = await fixture.connection.db
    .insert(users)
    .values({
      fullName: '',
      email: randomUUID() + '@example.test',
      emailVerifiedAt: now,
      passwordHash: permanentHash,
    })
    .returning();
  if (!user) throw new Error('Missing Customer fixture');
  const credential = await fixture.service.issue(user.id, 'mobile');
  const headers = { authorization: 'Bearer ' + credential.accessToken };
  return {
    user,
    credential,
    headers,
    body: { fullName: 'Customer Integration', phone: phone(), age: 18, gender: 'female' },
  };
}
async function photo(userId: string, patch: Partial<typeof files.$inferInsert> = {}) {
  const [row] = await fixture.connection.db
    .insert(files)
    .values({
      uploadedBy: userId,
      visibility: 'private',
      bucket: 'auth-private-fixture',
      objectKey: randomUUID(),
      mimeType: 'image/jpeg',
      sizeBytes: 100n,
      sha256: randomBytes(32),
      purpose: 'avatar',
      scanStatus: 'clean',
      ...patch,
    })
    .returning();
  if (!row) throw new Error('Missing private photo fixture');
  return row.id;
}
const complete = (headers: Record<string, string>, body: Record<string, unknown>) =>
  fixture.application.inject({
    method: 'PUT',
    url: '/v1/me/customer-profile',
    headers,
    payload: body,
  });
it('AUTH-C CHG-006: real Customer completion and age editing preserve the same verified identity and simultaneous Owner capability', async () => {
  const scope = await identity();
  await fixture.connection.db
    .insert(organizations)
    .values({ ownerUserId: scope.user.id, name: 'Existing Owner organization' });
  const response = await complete(scope.headers, scope.body);
  expect(response.statusCode).toBe(200);
  expect(response.json().capabilities).toMatchObject({ customer: true, owner: true });
  const [persisted] = await fixture.connection.db
    .select()
    .from(users)
    .where(eq(users.id, scope.user.id));
  expect(persisted).toMatchObject({
    phoneE164: scope.body.phone,
    phoneVerifiedAt: null,
    dateOfBirth: null,
    cnicHash: null,
    cnicEncrypted: null,
    passwordHash: permanentHash,
    emailVerifiedAt: now,
  });
  const firstCompleted = new Date(now.getTime() - 1000);
  await fixture.connection.db
    .update(customerProfiles)
    .set({ profileCompletedAt: firstCompleted })
    .where(eq(customerProfiles.userId, scope.user.id));
  expect(
    (await complete(scope.headers, { ...scope.body, age: 35, institution: ' Example Institute ' }))
      .statusCode,
  ).toBe(200);
  const [profile] = await fixture.connection.db
    .select()
    .from(customerProfiles)
    .where(eq(customerProfiles.userId, scope.user.id));
  expect(profile).toMatchObject({
    age: 35,
    institutionText: 'Example Institute',
    profileCompletedAt: firstCompleted,
  });
  const audit = await fixture.connection.db
    .select()
    .from(platformAuditLog)
    .where(eq(platformAuditLog.targetId, scope.user.id));
  expect(audit).toHaveLength(2);
  expect(
    audit.every((row) => JSON.stringify(row.after) === JSON.stringify({ completed: true })),
  ).toBe(true);
});
it('SEC: real private attachment rules reject foreign, wrong-bucket, pending and wrong-purpose files before granting Customer capability', async () => {
  const scope = await identity(),
    other = await identity();
  const cases = [
    { id: await photo(other.user.id), status: 404 },
    { id: await photo(scope.user.id, { bucket: 'foreign-bucket' }), status: 404 },
    { id: await photo(scope.user.id, { scanStatus: 'pending', sha256: null }), status: 409 },
    { id: await photo(scope.user.id, { purpose: 'verification_document' }), status: 404 },
  ];
  for (const entry of cases)
    expect(
      (await complete(scope.headers, { ...scope.body, profilePhotoFileId: entry.id })).statusCode,
    ).toBe(entry.status);
  expect(
    await fixture.connection.db
      .select()
      .from(customerProfiles)
      .where(eq(customerProfiles.userId, scope.user.id)),
  ).toHaveLength(0);
  const clean = await photo(scope.user.id);
  expect(
    (await complete(scope.headers, { ...scope.body, profilePhotoFileId: clean })).statusCode,
  ).toBe(200);
  const [user] = await fixture.connection.db
    .select()
    .from(users)
    .where(eq(users.id, scope.user.id));
  expect(user?.profilePhotoFileId).toBe(clean);
});
it('SEC: real unique phone conflict rolls back Customer identity, profile and audit together', async () => {
  const scope = await identity(),
    other = await identity();
  await fixture.connection.db
    .update(users)
    .set({ phoneE164: scope.body.phone })
    .where(eq(users.id, other.user.id));
  const response = await complete(scope.headers, scope.body);
  expect(response.statusCode).toBe(409);
  expect(response.json().code).toBe('IDENTITY_EXISTS');
  const [user] = await fixture.connection.db
    .select()
    .from(users)
    .where(eq(users.id, scope.user.id));
  expect(user).toMatchObject({ fullName: '', phoneE164: null, gender: null });
  expect(
    await fixture.connection.db
      .select()
      .from(customerProfiles)
      .where(eq(customerProfiles.userId, scope.user.id)),
  ).toHaveLength(0);
  expect(
    await fixture.connection.db
      .select()
      .from(platformAuditLog)
      .where(eq(platformAuditLog.targetId, scope.user.id)),
  ).toHaveLength(0);
});
class InvalidAuditActor extends AuditWriter {
  override platform(transaction: Transaction, event: Parameters<AuditWriter['platform']>[1]) {
    // Real FK violation after business writes; no database or transaction mocks.
    return super.platform(transaction, { ...event, actorUserId: randomUUID() });
  }
}
it('SEC-003: a real audit FK failure rolls back all Customer writes', async () => {
  const scope = await identity();
  const service = new CustomerProfileService(
    new CustomerProfileRepository(
      fixture.connection.db,
      'auth-private-fixture',
      new InvalidAuditActor(),
      () => now,
    ),
    new ProfileRepository(fixture.connection.db),
    () => now,
  );
  await expect(
    service.complete({ userId: scope.user.id, sessionId: scope.credential.sessionId }, scope.body),
  ).rejects.toThrow();
  const [user] = await fixture.connection.db
    .select()
    .from(users)
    .where(eq(users.id, scope.user.id));
  expect(user).toMatchObject({ fullName: '', phoneE164: null, gender: null });
  expect(
    await fixture.connection.db
      .select()
      .from(customerProfiles)
      .where(eq(customerProfiles.userId, scope.user.id)),
  ).toHaveLength(0);
});
it('SEC: persisted logout rejects the next Customer completion request without a profile write', async () => {
  const scope = await identity();
  await fixture.service.logout(scope.user.id, scope.credential.sessionId);
  expect((await complete(scope.headers, scope.body)).statusCode).toBe(401);
  expect(
    await fixture.connection.db
      .select()
      .from(customerProfiles)
      .where(eq(customerProfiles.userId, scope.user.id)),
  ).toHaveLength(0);
});

it('SEC-003 / CHG-059: real self-profile omission preserves the avatar and null unlinks it without deleting its private file', async () => {
  const scope = await identity(),
    other = await identity();
  const avatar = await photo(scope.user.id);
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
  expect(audit.some((row) => row.action === 'customer.profile.save')).toBe(true);
});
