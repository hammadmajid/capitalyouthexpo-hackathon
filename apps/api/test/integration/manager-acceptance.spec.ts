import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  branches,
  brands,
  customerProfiles,
  hostelAuditLog,
  managerAssignments,
  organizations,
  users,
} from '@hsm/db';
import { AuditWriter, type Transaction } from '../../src/audit/writer.js';
import { AuthCrypto, hashPassword } from '../../src/auth/crypto.js';
import { ManagerAcceptanceRepository } from '../../src/auth/manager-acceptance.repository.js';
import { authFixture } from './auth-fixture.js';
import { managementFixture } from './management-fixture.js';
const now = new Date('2026-10-10T12:00:00Z');
const crypto = new AuthCrypto({
  JWT_SECRET: randomBytes(48).toString('hex'),
  CNIC_HASH_KEY: randomBytes(32).toString('hex'),
  CNIC_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
});
let fixture: Awaited<ReturnType<typeof authFixture>>, permanentHash: string;
beforeAll(async () => {
  fixture = await authFixture(crypto, now);
  permanentHash = await hashPassword('Permanent authenticated manager phrase');
});
afterAll(async () => {
  await fixture?.close();
});
async function scope() {
  const result = await managementFixture(fixture.connection.db, permanentHash, now);
  await fixture.connection.db
    .update(users)
    .set({
      passwordHash: permanentHash,
      email: randomUUID() + '@example.test',
      emailVerifiedAt: now,
    })
    .where(eq(users.id, result.managerId));
  const credential = await fixture.service.issue(result.managerId, 'mobile');
  return { ...result, credential, headers: { authorization: 'Bearer ' + credential.accessToken } };
}
const accept = (headers: Record<string, string>, payload: Record<string, unknown> = {}) =>
  fixture.application.inject({
    method: 'POST',
    url: '/v1/me/manager-invitations/accept',
    headers,
    payload,
  });
async function assignment(id: string) {
  const [row] = await fixture.connection.db
    .select()
    .from(managerAssignments)
    .where(eq(managerAssignments.id, id));
  return row;
}
it('AUTH-M CHG-006 SEC: real authenticated acceptance adds Manager while preserving permanent password, Customer and live devices', async () => {
  const current = await scope();
  await fixture.connection.db.insert(customerProfiles).values({ userId: current.managerId });
  const result = await accept(current.headers);
  expect(result.statusCode).toBe(200);
  expect(result.headers['cache-control']).toBe('no-store');
  expect(result.json().capabilities).toMatchObject({
    customer: true,
    managerOf: [{ branchId: current.branchA, branchName: 'Branch A' }],
  });
  expect(result.json()).not.toHaveProperty('accessToken');
  expect(result.headers['set-cookie']).toBeUndefined();
  const [identity] = await fixture.connection.db
    .select()
    .from(users)
    .where(eq(users.id, current.managerId));
  expect(identity?.passwordHash).toBe(permanentHash);
  expect(await assignment(current.assignmentId)).toMatchObject({
    status: 'active',
    activatedAt: now,
    tempPasswordHash: null,
    tempPasswordExpiresAt: null,
    tempPasswordAttempts: 0,
    lockedAt: null,
  });
  expect(await fixture.service.authenticate(current.credential.accessToken)).toMatchObject({
    userId: current.managerId,
  });
  const audits = await fixture.connection.db
    .select()
    .from(hostelAuditLog)
    .where(eq(hostelAuditLog.targetId, current.assignmentId));
  expect(audits).toHaveLength(1);
  expect(audits[0]).toMatchObject({
    actorUserId: current.managerId,
    branchId: current.branchA,
    action: 'manager.invitation.accept',
    before: { status: 'pending_activation' },
    after: { status: 'active' },
  });
  expect((await accept(current.headers)).statusCode).toBe(409);
  const child = await fixture.application.inject({
    url: '/v1/manage/branches/' + current.branchA,
    headers: current.headers,
  });
  expect(child.statusCode).toBe(200);
  expect(
    (
      await fixture.application.inject({
        url: '/v1/manage/branches/' + current.branchB,
        headers: current.headers,
      })
    ).statusCode,
  ).toBe(403);
});
it('SEC: real acceptance cannot target a foreign identity or invitation', async () => {
  const current = await scope();
  await fixture.connection.db
    .update(users)
    .set({ passwordHash: permanentHash })
    .where(eq(users.id, current.ownerId));
  const owner = await fixture.service.issue(current.ownerId, 'mobile');
  const headers = { authorization: 'Bearer ' + owner.accessToken };
  expect((await accept(headers)).statusCode).toBe(404);
  expect(
    (await accept(headers, { userId: current.managerId, assignmentId: current.assignmentId }))
      .statusCode,
  ).toBe(400);
  expect(await assignment(current.assignmentId)).toMatchObject({
    status: 'pending_activation',
    activatedAt: null,
  });
});
it('SEC: real authenticated acceptance retains invitation expiry, attempts and lifecycle limits', async () => {
  const cases: { patch: Partial<typeof managerAssignments.$inferInsert>; status: number }[] = [
    { patch: { tempPasswordExpiresAt: now }, status: 409 },
    { patch: { tempPasswordExpiresAt: null }, status: 409 },
    { patch: { tempPasswordAttempts: 5 }, status: 409 },
    { patch: { lockedAt: now }, status: 409 },
    { patch: { status: 'suspended' }, status: 409 },
    { patch: { status: 'deactivated' }, status: 404 },
  ];
  for (const entry of cases) {
    const current = await scope();
    await fixture.connection.db
      .update(managerAssignments)
      .set(entry.patch)
      .where(eq(managerAssignments.id, current.assignmentId));
    expect((await accept(current.headers)).statusCode).toBe(entry.status);
    expect((await assignment(current.assignmentId))?.activatedAt).toBeNull();
  }
});
it('SEC: real archived branch, brand and organization cannot grant Manager capability', async () => {
  for (const target of ['branch', 'brand', 'organization'] as const) {
    const current = await scope();
    const [branch] = await fixture.connection.db
      .select()
      .from(branches)
      .where(eq(branches.id, current.branchA));
    if (!branch) throw new Error('Missing branch fixture');
    if (target === 'branch')
      await fixture.connection.db
        .update(branches)
        .set({ archivedAt: now })
        .where(eq(branches.id, branch.id));
    if (target === 'brand')
      await fixture.connection.db
        .update(brands)
        .set({ archivedAt: now })
        .where(eq(brands.id, branch.brandId));
    if (target === 'organization')
      await fixture.connection.db
        .update(organizations)
        .set({ archivedAt: now })
        .where(eq(organizations.id, branch.organizationId));
    expect((await accept(current.headers)).statusCode).toBe(404);
    expect(await assignment(current.assignmentId)).toMatchObject({
      status: 'pending_activation',
      activatedAt: null,
    });
  }
});
class InvalidAuditActor extends AuditWriter {
  override hostel(transaction: Transaction, event: Parameters<AuditWriter['hostel']>[1]) {
    return super.hostel(transaction, { ...event, actorUserId: randomUUID() });
  }
}
it('SEC-003: real audit-FK failure rolls back acceptance and preserves its single-use credential', async () => {
  const current = await scope();
  const repository = new ManagerAcceptanceRepository(
    fixture.connection.db,
    new InvalidAuditActor(),
    () => now,
  );
  await expect(
    repository.accept({ userId: current.managerId, sessionId: current.credential.sessionId }),
  ).rejects.toThrow();
  expect(await assignment(current.assignmentId)).toMatchObject({
    status: 'pending_activation',
    activatedAt: null,
    tempPasswordHash: permanentHash,
  });
  const [identity] = await fixture.connection.db
    .select()
    .from(users)
    .where(eq(users.id, current.managerId));
  expect(identity?.passwordHash).toBe(permanentHash);
});
it('SEC: persisted logout denies real acceptance on the next request', async () => {
  const current = await scope();
  await fixture.service.logout(current.managerId, current.credential.sessionId);
  expect((await accept(current.headers)).statusCode).toBe(401);
  expect(await assignment(current.assignmentId)).toMatchObject({
    status: 'pending_activation',
    activatedAt: null,
  });
});
it('AUTH-M CHG-006: concurrent real acceptance commits one capability grant and one audit', async () => {
  const current = await scope();
  const results = await Promise.all([accept(current.headers), accept(current.headers)]);
  expect(results.map((result) => result.statusCode).sort()).toEqual([200, 409]);
  expect(await assignment(current.assignmentId)).toMatchObject({ status: 'active' });
  const audits = await fixture.connection.db
    .select()
    .from(hostelAuditLog)
    .where(eq(hostelAuditLog.targetId, current.assignmentId));
  expect(audits).toHaveLength(1);
});
it('SEC: a real passwordless session cannot use authenticated acceptance to bypass permanent setup', async () => {
  const current = await scope();
  await fixture.connection.db
    .update(users)
    .set({ passwordHash: null })
    .where(eq(users.id, current.managerId));
  expect((await accept(current.headers)).statusCode).toBe(403);
  expect(await assignment(current.assignmentId)).toMatchObject({
    status: 'pending_activation',
    activatedAt: null,
  });
});
