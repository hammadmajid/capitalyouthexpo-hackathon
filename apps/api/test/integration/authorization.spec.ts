import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import {
  adminAccounts,
  adminRoleGrants,
  brands,
  branches,
  customerProfiles,
  managerAssignments,
  organizations,
  users,
} from '@hsm/db';
import { AuthCrypto, hashPassword } from '../../src/auth/crypto.js';
import { testKeys } from '../keys.js';
import { ScopeProbe } from '../security/scope-probe.js';
import { authFixture } from './auth-fixture.js';
import { managementFixture } from './management-fixture.js';
const now = new Date('2026-10-08T00:00:00Z');
let fixture: Awaited<ReturnType<typeof authFixture>>;
let passwordHash: string;
beforeAll(async () => {
  passwordHash = await hashPassword('Real scoped integration password');
  fixture = await authFixture(new AuthCrypto(testKeys()), now, {}, [ScopeProbe]);
  const retainedRoot = randomUUID();
  await fixture.connection.db
    .insert(users)
    .values({ id: retainedRoot, fullName: 'Retained fixture Root' });
  await fixture.connection.db
    .insert(adminAccounts)
    .values({ userId: retainedRoot, status: 'active', isRoot: true });
});
afterAll(async () => {
  await fixture?.close();
});
async function scopeFixture() {
  const value = await managementFixture(fixture.connection.db, passwordHash, now);
  const managerB = randomUUID(),
    assignmentB = randomUUID();
  await fixture.connection.db
    .insert(users)
    .values({ id: managerB, fullName: 'Branch B Manager', passwordHash, emailVerifiedAt: now });
  await fixture.connection.db
    .update(users)
    .set({ passwordHash, emailVerifiedAt: now })
    .where(eq(users.id, value.managerId));
  await fixture.connection.db
    .update(managerAssignments)
    .set({
      status: 'active',
      activatedAt: now,
      tempPasswordHash: null,
      tempPasswordExpiresAt: null,
    })
    .where(eq(managerAssignments.id, value.assignmentId));
  await fixture.connection.db.insert(managerAssignments).values({
    id: assignmentB,
    userId: managerB,
    branchId: value.branchB,
    appointedByUserId: value.ownerId,
    status: 'active',
    activatedAt: now,
  });
  return { ...value, managerB, assignmentB };
}
async function token(userId: string) {
  return (await fixture.service.issue(userId, 'mobile')).accessToken;
}
async function request(path: string, accessToken: string) {
  return fixture.application.inject({
    url: '/v1/scope-probe/' + path,
    headers: { authorization: 'Bearer ' + accessToken },
  });
}
it('ACC-002: real manager A gets own branch 200, foreign branch 403 and foreign child 404', async () => {
  const value = await scopeFixture();
  const access = await token(value.managerId);
  expect((await request('branches/' + value.branchA, access)).statusCode).toBe(200);
  expect((await request('branches/' + value.branchB, access)).statusCode).toBe(403);
  expect((await request('objects/' + value.assignmentB, access)).statusCode).toBe(404);
  expect(
    (await request('branches/' + value.branchA + '/objects/' + value.assignmentB, access))
      .statusCode,
  ).toBe(404);
  expect((await request('owner-branches/' + value.branchA, access)).statusCode).toBe(403);
});
it.each(['pending_activation', 'suspended', 'deactivated'] as const)(
  'MGR-004: persisted assignment %s denies the next management call without JWT expiry',
  async (status) => {
    const value = await scopeFixture();
    const access = await token(value.managerId);
    expect((await request('branches/' + value.branchA, access)).statusCode).toBe(200);
    await fixture.connection.db
      .update(managerAssignments)
      .set({ status })
      .where(eq(managerAssignments.id, value.assignmentId));
    expect((await request('branches/' + value.branchA, access)).statusCode).toBe(403);
  },
);
it.each(['branch', 'brand', 'organization'] as const)(
  'ACC-002: archived %s invalidates branch management scope',
  async (kind) => {
    const value = await scopeFixture();
    const access = await token(value.managerId),
      owner = await token(value.ownerId);
    const [branch] = await fixture.connection.db
      .select({ brandId: branches.brandId, organizationId: branches.organizationId })
      .from(branches)
      .where(eq(branches.id, value.branchA));
    if (!branch) throw new Error('Scope branch missing');
    if (kind === 'branch')
      await fixture.connection.db
        .update(branches)
        .set({ archivedAt: now })
        .where(eq(branches.id, value.branchA));
    if (kind === 'brand')
      await fixture.connection.db
        .update(brands)
        .set({ archivedAt: now })
        .where(eq(brands.id, branch.brandId));
    if (kind === 'organization')
      await fixture.connection.db
        .update(organizations)
        .set({ archivedAt: now })
        .where(eq(organizations.id, branch.organizationId));
    expect((await request('branches/' + value.branchA, access)).statusCode).toBe(403);
    expect((await request('owner-branches/' + value.branchA, owner)).statusCode).toBe(403);
  },
);
it('SEC: real simultaneous customer/owner/manager/admin grants remain independent', async () => {
  const value = await scopeFixture();
  await fixture.connection.db.insert(customerProfiles).values({ userId: value.ownerId });
  await fixture.connection.db.insert(managerAssignments).values({
    userId: value.ownerId,
    branchId: value.branchA,
    appointedByUserId: value.ownerId,
    status: 'active',
    activatedAt: now,
  });
  await fixture.connection.db
    .insert(adminAccounts)
    .values({ userId: value.ownerId, status: 'active' });
  await fixture.connection.db
    .insert(adminRoleGrants)
    .values({ adminUserId: value.ownerId, role: 'support', grantedByUserId: value.ownerId });
  const access = await token(value.ownerId);
  for (const path of [
    'customer',
    'owner',
    'branches/' + value.branchA,
    'branches/' + value.branchB,
    'admin/support',
  ])
    expect((await request(path, access)).statusCode).toBe(200);
  expect((await request('admin/verification', access)).statusCode).toBe(403);
  expect((await request('stay', access)).statusCode).toBe(403);
});
it('SEC: Root has no hostel bypass and normal-admin revocation takes effect immediately', async () => {
  const value = await scopeFixture();
  const root = randomUUID(),
    support = randomUUID();
  await fixture.connection.db.insert(users).values([
    { id: root, fullName: 'Scope Root' },
    { id: support, fullName: 'Scope Support' },
  ]);
  await fixture.connection.db.insert(adminAccounts).values([
    { userId: root, status: 'active', isRoot: true },
    { userId: support, status: 'active' },
  ]);
  await fixture.connection.db
    .insert(adminRoleGrants)
    .values({ adminUserId: support, role: 'support', grantedByUserId: root });
  const rootAccess = await token(root),
    supportAccess = await token(support);
  expect((await request('admin/verification', rootAccess)).statusCode).toBe(200);
  expect((await request('branches/' + value.branchA, rootAccess)).statusCode).toBe(403);
  expect((await request('admin/billing', rootAccess)).statusCode).toBe(403);
  expect((await request('admin/support', supportAccess)).statusCode).toBe(200);
  expect((await request('admin/root', supportAccess)).statusCode).toBe(403);
  await fixture.connection.db
    .update(adminRoleGrants)
    .set({ revokedAt: now })
    .where(and(eq(adminRoleGrants.adminUserId, support), eq(adminRoleGrants.role, 'support')));
  expect((await request('admin/support', supportAccess)).statusCode).toBe(403);
  await fixture.connection.db
    .update(adminAccounts)
    .set({ status: 'suspended' })
    .where(eq(adminAccounts.userId, root));
  expect((await request('admin/verification', rootAccess)).statusCode).toBe(403);
});
