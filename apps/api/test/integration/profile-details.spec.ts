import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { sensitiveAccessLog, sessions, users } from '@hsm/db';
import { profileDetailsSchema } from '@hsm/contracts';
import { AuthCrypto, hashPassword } from '../../src/auth/crypto.js';
import { ProfileDetailsRepository } from '../../src/auth/profile-details.repository.js';
import { ProfileDetailsService } from '../../src/auth/profile-details.service.js';
import { authFixture } from './auth-fixture.js';
import { ownerIdentity, ownerRequest } from './owner-profile-fixture.js';
const now = new Date('2026-10-11T12:00:00Z');
const crypto = new AuthCrypto({
  JWT_SECRET: randomBytes(48).toString('hex'),
  CNIC_HASH_KEY: randomBytes(32).toString('hex'),
  CNIC_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
});
let fixture: Awaited<ReturnType<typeof authFixture>>, permanentHash: string;
beforeAll(async () => {
  fixture = await authFixture(crypto, now);
  permanentHash = await hashPassword('Private profile integration phrase');
});
afterAll(async () => {
  await fixture?.close();
});
const read = (headers: Record<string, string>) =>
  fixture.application.inject({ url: '/v1/me/profile-details', headers });
it('AUTH-C SEC: real initial self edit projection has no completed or sensitive profile data', async () => {
  const identity = await ownerIdentity(fixture, permanentHash, now);
  const response = await read(identity.headers);
  expect(response.statusCode).toBe(200);
  expect(response.headers['cache-control']).toBe('no-store');
  expect(profileDetailsSchema.parse(response.json())).toMatchObject({
    userId: identity.user.id,
    fullName: '',
    phone: null,
    cnicLast4: null,
    customer: null,
    owner: null,
  });
  const access = await fixture.connection.db
    .select()
    .from(sensitiveAccessLog)
    .where(
      and(
        eq(sensitiveAccessLog.actorUserId, identity.user.id),
        eq(sensitiveAccessLog.resource, 'self_profile_details'),
      ),
    );
  expect(access).toHaveLength(1);
  expect(access[0]).toMatchObject({
    subjectUserId: identity.user.id,
    resourceId: identity.user.id,
    purpose: 'Self profile editing',
    createdAt: now,
  });
});
it('AUTH-C CHG-006: real saved Customer and Owner fields can be resumed and editable age reflects the last transaction', async () => {
  const identity = await ownerIdentity(fixture, permanentHash, now);
  expect((await ownerRequest(fixture, identity.headers, identity.body)).statusCode).toBe(200);
  const customer = {
    fullName: identity.body.fullName,
    phone: identity.body.phone,
    gender: 'female',
    age: 26,
    institution: 'Saved institute',
  };
  expect(
    (
      await fixture.application.inject({
        method: 'PUT',
        url: '/v1/me/customer-profile',
        headers: identity.headers,
        payload: customer,
      })
    ).statusCode,
  ).toBe(200);
  let response = await read(identity.headers);
  expect(response.statusCode).toBe(200);
  const details = profileDetailsSchema.parse(response.json());
  expect(details).toMatchObject({
    userId: identity.user.id,
    phone: identity.body.phone,
    cnicLast4: identity.body.cnic.slice(-4),
    customer: { age: 26, institution: customer.institution, completed: true },
    owner: {
      address: identity.body.address,
      cnicFrontFileId: identity.body.cnicFrontFileId,
      cnicBackFileId: identity.body.cnicBackFileId,
      agreementVersion: identity.body.agreementVersion,
      completed: true,
    },
  });
  expect(response.body).not.toContain(identity.body.cnic);
  for (const field of ['passwordHash', 'cnicHash', 'cnicEncrypted', 'signedUrl', 'uploadUrl'])
    expect(details).not.toHaveProperty(field);
  expect(
    (
      await fixture.application.inject({
        method: 'PUT',
        url: '/v1/me/customer-profile',
        headers: identity.headers,
        payload: { ...customer, age: 29 },
      })
    ).statusCode,
  ).toBe(200);
  response = await read(identity.headers);
  expect(profileDetailsSchema.parse(response.json()).customer?.age).toBe(29);
});
it('SEC: another live identity cannot select or observe the completed private Owner profile', async () => {
  const owner = await ownerIdentity(fixture, permanentHash, now),
    other = await ownerIdentity(fixture, permanentHash, now);
  expect((await ownerRequest(fixture, owner.headers, owner.body)).statusCode).toBe(200);
  const response = await read(other.headers);
  expect(response.statusCode).toBe(200);
  expect(profileDetailsSchema.parse(response.json())).toMatchObject({
    userId: other.user.id,
    owner: null,
    cnicLast4: null,
  });
  expect(response.body).not.toContain(owner.body.cnicFrontFileId);
  expect(
    (
      await fixture.application.inject({
        url: '/v1/me/profile-details/' + owner.user.id,
        headers: other.headers,
      })
    ).statusCode,
  ).toBe(404);
});
it('SEC MGR-004: persisted session revocation rejects HTTP and transactional detail reads immediately', async () => {
  const identity = await ownerIdentity(fixture, permanentHash, now);
  await fixture.connection.db
    .update(sessions)
    .set({ revokedAt: now, revokedReason: 'logout' })
    .where(eq(sessions.id, identity.credential.sessionId));
  expect((await read(identity.headers)).statusCode).toBe(401);
  const service = new ProfileDetailsService(
    new ProfileDetailsRepository(fixture.connection.db, () => now),
  );
  await expect(
    service.read({ userId: identity.user.id, sessionId: identity.credential.sessionId }),
  ).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
});
it('SEC: persisted suspended account cannot read its private edit details', async () => {
  const identity = await ownerIdentity(fixture, permanentHash, now);
  await fixture.connection.db
    .update(users)
    .set({ accountStatus: 'suspended' })
    .where(eq(users.id, identity.user.id));
  expect((await read(identity.headers)).statusCode).toBe(403);
});
