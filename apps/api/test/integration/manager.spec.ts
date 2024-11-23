import { ProfileRepository } from '../../src/auth/profile.repository.js';
import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { brands, branches, managerAssignments, users } from '@hsm/db';
import { AuthCrypto, hashPassword, verifyPassword } from '../../src/auth/crypto.js';
import { authFixture } from './auth-fixture.js';
import { managementFixture } from './management-fixture.js';
const crypto = new AuthCrypto({
  JWT_SECRET: randomBytes(48).toString('hex'),
  CNIC_HASH_KEY: randomBytes(32).toString('hex'),
  CNIC_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
});
const now = new Date('2026-10-07T12:00:00Z');
const tempPassword = 'Temporary integration manager phrase';
const newPassword = 'Permanent integration manager phrase';
let fixture: Awaited<ReturnType<typeof authFixture>>;
let tempHash: string;
beforeAll(async () => {
  fixture = await authFixture(crypto, now);
  tempHash = await hashPassword(tempPassword);
});
afterAll(async () => {
  await fixture?.close();
});
const activate = (phone: string, temporary = tempPassword) =>
  fixture.application.inject({
    method: 'POST',
    url: '/v1/auth/manager/activate',
    payload: { phone, tempPassword: temporary, newPassword, client: 'mobile' },
  });
it('AUTH-M-003/005: real single-use activation persists the permanent hash and permits phone-only login', async () => {
  const scope = await managementFixture(fixture.connection.db, tempHash, now);
  const previous = await fixture.service.issue(scope.managerId, 'mobile');
  const response = await activate(scope.phone);
  expect(response.statusCode).toBe(200);
  const body = response.json<{
    accessToken: string;
    capabilities: { managerOf: { branchId: string }[] };
  }>();
  expect(body.capabilities.managerOf).toEqual([
    { branchId: scope.branchA, branchName: 'Branch A' },
  ]);
  expect((await activate(scope.phone)).statusCode).toBe(401);
  await expect(fixture.service.authenticate(previous.accessToken)).rejects.toMatchObject({
    code: 'SESSION_REVOKED',
  });
  const [assignment] = await fixture.connection.db
    .select()
    .from(managerAssignments)
    .where(eq(managerAssignments.id, scope.assignmentId));
  expect(assignment).toMatchObject({
    status: 'active',
    tempPasswordHash: null,
    tempPasswordExpiresAt: null,
    activatedAt: now,
  });
  const [user] = await fixture.connection.db
    .select()
    .from(users)
    .where(eq(users.id, scope.managerId));
  expect(user?.emailVerifiedAt).toBeNull();
  expect(await verifyPassword(user?.passwordHash ?? null, newPassword)).toBe(true);
  const login = () =>
    fixture.application.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { identifier: scope.phone, password: newPassword, client: 'mobile' },
    });
  expect((await login()).statusCode).toBe(200);
  await fixture.connection.db
    .update(managerAssignments)
    .set({ status: 'suspended', suspendedAt: now })
    .where(eq(managerAssignments.id, scope.assignmentId));
  expect((await login()).statusCode).toBe(403);
});
it('AUTH-M-003: real wrong attempts persist a lock and expired credentials cannot activate', async () => {
  const scope = await managementFixture(fixture.connection.db, tempHash, now);
  for (let attempt = 0; attempt < 5; attempt++)
    expect((await activate(scope.phone, 'Wrong temporary manager phrase')).statusCode).toBe(401);
  expect((await activate(scope.phone)).statusCode).toBe(401);
  const [assignment] = await fixture.connection.db
    .select()
    .from(managerAssignments)
    .where(eq(managerAssignments.id, scope.assignmentId));
  expect(assignment).toMatchObject({
    tempPasswordAttempts: 5,
    lockedAt: now,
    status: 'pending_activation',
  });
  const expired = await managementFixture(fixture.connection.db, tempHash, now);
  await fixture.connection.db
    .update(managerAssignments)
    .set({ tempPasswordExpiresAt: now })
    .where(eq(managerAssignments.id, expired.assignmentId));
  expect((await activate(expired.phone)).statusCode).toBe(401);
});
it('AUTH-M-003: concurrent real activation consumes the invitation exactly once', async () => {
  const scope = await managementFixture(fixture.connection.db, tempHash, now);
  const results = await Promise.all([activate(scope.phone), activate(scope.phone)]);
  expect(results.map((response) => response.statusCode).sort()).toEqual([200, 401]);
});

it('SEC-001/AUTH-M-003: archived brands deny real activation without consuming an invitation', async () => {
  const scope = await managementFixture(fixture.connection.db, tempHash, now);
  const [branch] = await fixture.connection.db
    .select()
    .from(branches)
    .where(eq(branches.id, scope.branchA));
  if (!branch) throw new Error('Fixture branch missing');
  await fixture.connection.db
    .update(brands)
    .set({ archivedAt: now })
    .where(eq(brands.id, branch.brandId));
  expect((await activate(scope.phone)).statusCode).toBe(401);
  const [assignment] = await fixture.connection.db
    .select()
    .from(managerAssignments)
    .where(eq(managerAssignments.id, scope.assignmentId));
  expect(assignment).toMatchObject({
    status: 'pending_activation',
    tempPasswordAttempts: 0,
    activatedAt: null,
  });
});
it('SEC-001/AUTH-M-005: archiving a real brand removes capability and phone-only login eligibility', async () => {
  const scope = await managementFixture(fixture.connection.db, tempHash, now);
  expect((await activate(scope.phone)).statusCode).toBe(200);
  const [branch] = await fixture.connection.db
    .select()
    .from(branches)
    .where(eq(branches.id, scope.branchA));
  if (!branch) throw new Error('Fixture branch missing');
  await fixture.connection.db
    .update(brands)
    .set({ archivedAt: now })
    .where(eq(brands.id, branch.brandId));
  const profile = await new ProfileRepository(fixture.connection.db).read(scope.managerId);
  expect(profile.capabilities.managerOf).toEqual([]);
  const response = await fixture.application.inject({
    method: 'POST',
    url: '/v1/auth/login',
    payload: { identifier: scope.phone, password: newPassword, client: 'mobile' },
  });
  expect(response.statusCode).toBe(403);
});

it.each([tempPassword, 'Incorrect temporary integration phrase'])(
  'CHG-006 SEC: real temporary activation cannot replace an existing permanent password or revoke its devices',
  async (temporary) => {
    const scope = await managementFixture(fixture.connection.db, tempHash, now);
    await fixture.connection.db
      .update(users)
      .set({
        email: randomUUID() + '@example.test',
        emailVerifiedAt: now,
        passwordHash: tempHash,
      })
      .where(eq(users.id, scope.managerId));
    const previous = await fixture.service.issue(scope.managerId, 'mobile');
    expect((await activate(scope.phone, temporary)).statusCode).toBe(401);
    const [identity] = await fixture.connection.db
      .select()
      .from(users)
      .where(eq(users.id, scope.managerId));
    expect(identity?.passwordHash).toBe(tempHash);
    expect(await verifyPassword(identity?.passwordHash ?? null, tempPassword)).toBe(true);
    expect(await fixture.service.authenticate(previous.accessToken)).toMatchObject({
      userId: scope.managerId,
      sessionId: previous.sessionId,
    });
    const [assignment] = await fixture.connection.db
      .select()
      .from(managerAssignments)
      .where(eq(managerAssignments.id, scope.assignmentId));
    expect(assignment).toMatchObject({
      status: 'pending_activation',
      tempPasswordAttempts: 0,
      lockedAt: null,
      activatedAt: null,
      tempPasswordHash: tempHash,
    });
    const login = await fixture.application.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { identifier: scope.phone, password: tempPassword, client: 'mobile' },
    });
    expect(login.statusCode).toBe(200);
  },
);
