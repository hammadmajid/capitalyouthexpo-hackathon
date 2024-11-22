import { randomUUID } from 'node:crypto';
import { Body, Controller, HttpCode, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { branches, hostelAuditLog, idempotencyKeys, managerAssignments } from '@hsm/db';
import { BranchScope } from '../../src/access.js';
import { actorOf } from '../../src/authorization/guards.js';
import { AuthCrypto } from '../../src/auth/crypto.js';
import { AuditWriter } from '../../src/audit/writer.js';
import { Idempotent } from '../../src/idempotency/interceptor.js';
import { requireTransaction } from '../../src/idempotency/context.js';
import { zodPipe } from '../../src/problem.js';
import { testKeys } from '../keys.js';
import { authFixture } from '../integration/auth-fixture.js';
import { managementFixture } from '../integration/management-fixture.js';
const bodySchema = z.object({ name: z.string().trim().min(1).max(100) }).strict();
const responseSchema = z.object({ branchId: z.string().uuid(), name: z.string() }).strict();
class ProbeRepository {
  failAfterAudit = false;
  invalidAuditActor = false;
  async rename(actorId: string, branchId: string, name: string) {
    const transaction = requireTransaction();
    const [branch] = await transaction
      .select()
      .from(branches)
      .where(eq(branches.id, branchId))
      .for('update');
    if (!branch) throw new Error('Fixture branch missing');
    await transaction.update(branches).set({ name }).where(eq(branches.id, branchId));
    await new AuditWriter().hostel(transaction, {
      actorUserId: this.invalidAuditActor ? randomUUID() : actorId,
      actorRole: 'fixture',
      action: 'fixture.branch.rename',
      targetType: 'branch',
      targetId: branchId,
      organizationId: branch.organizationId,
      branchId,
      before: { name: branch.name },
      after: { name },
    });
    if (this.failAfterAudit) throw new Error('Forced business failure');
    return { branchId, name };
  }
}
const repository = new ProbeRepository();
@Controller('idempotency-probe')
class Probe {
  @BranchScope()
  @Idempotent(responseSchema)
  @HttpCode(200)
  @Post('branches/:branchId')
  rename(
    @Req() request: FastifyRequest,
    @Param('branchId', zodPipe(z.string().uuid())) branchId: string,
    @Body(zodPipe(bodySchema)) body: z.infer<typeof bodySchema>,
  ) {
    return repository.rename(actorOf(request).userId, branchId, body.name);
  }
}
const now = new Date('2026-10-08T00:00:00Z');
let fixture: Awaited<ReturnType<typeof authFixture>>;
beforeAll(async () => {
  fixture = await authFixture(new AuthCrypto(testKeys()), now, {}, [Probe]);
});
afterAll(async () => {
  await fixture?.close();
});
async function scope() {
  const value = await managementFixture(fixture.connection.db, 'fixture hash', now);
  const access = (await fixture.service.issue(value.ownerId, 'mobile')).accessToken;
  return { ...value, access };
}
function request(access: string, branchId: string, key: string, name = 'Renamed once') {
  return fixture.application.inject({
    method: 'POST',
    url: '/v1/idempotency-probe/branches/' + branchId,
    headers: { authorization: 'Bearer ' + access, 'idempotency-key': key },
    payload: { name },
  });
}
async function auditRows(branchId: string) {
  return fixture.connection.db
    .select()
    .from(hostelAuditLog)
    .where(eq(hostelAuditLog.targetId, branchId));
}
async function cacheRows(userId: string, key: string) {
  return fixture.connection.db
    .select()
    .from(idempotencyKeys)
    .where(and(eq(idempotencyKeys.userId, userId), eq(idempotencyKeys.key, key)));
}
it('PAY-008/SEC-003: concurrent identical HTTP requests commit one mutation, audit and response', async () => {
  const value = await scope(),
    key = randomUUID();
  const responses = await Promise.all([
    request(value.access, value.branchA, key),
    request(value.access, value.branchA, key),
  ]);
  expect(responses.map((response) => response.statusCode)).toEqual([200, 200]);
  expect(responses[0]?.json()).toEqual(responses[1]?.json());
  expect(responses.map((response) => response.headers['idempotency-replayed']).sort()).toEqual([
    'false',
    'true',
  ]);
  expect(await auditRows(value.branchA)).toHaveLength(1);
  expect(await cacheRows(value.ownerId, key)).toHaveLength(1);
});
it('PAY-008: a changed body or actual branch conflicts with the same actor-bound key', async () => {
  const value = await scope(),
    key = randomUUID();
  expect((await request(value.access, value.branchA, key)).statusCode).toBe(200);
  expect((await request(value.access, value.branchA, key, 'Different')).statusCode).toBe(409);
  expect((await request(value.access, value.branchB, key)).statusCode).toBe(409);
  expect(await auditRows(value.branchA)).toHaveLength(1);
  expect(await auditRows(value.branchB)).toHaveLength(0);
});
it('PAY-008: another actor has an independent key and cannot replay a foreign branch response', async () => {
  const first = await scope(),
    second = await scope(),
    key = randomUUID();
  expect((await request(first.access, first.branchA, key)).statusCode).toBe(200);
  expect((await request(second.access, first.branchA, key)).statusCode).toBe(403);
  expect((await request(second.access, second.branchA, key, 'Second actor')).json()).toEqual({
    branchId: second.branchA,
    name: 'Second actor',
  });
  expect(await cacheRows(first.ownerId, key)).toHaveLength(1);
  expect(await cacheRows(second.ownerId, key)).toHaveLength(1);
});
it('PAY-008: expired response entries can execute a new request after 24 hours', async () => {
  const value = await scope(),
    key = randomUUID();
  await request(value.access, value.branchA, key);
  await fixture.connection.db
    .update(idempotencyKeys)
    .set({ createdAt: new Date(now.getTime() - 86400000) })
    .where(and(eq(idempotencyKeys.userId, value.ownerId), eq(idempotencyKeys.key, key)));
  const response = await request(value.access, value.branchA, key, 'After expiry');
  expect(response.statusCode).toBe(200);
  expect(response.headers['idempotency-replayed']).toBe('false');
  expect(response.json()).toEqual({ branchId: value.branchA, name: 'After expiry' });
  expect(await cacheRows(value.ownerId, key)).toHaveLength(1);
  expect(await auditRows(value.branchA)).toHaveLength(2);
});
it.each(['business', 'audit'] as const)(
  'PAY-008/SEC-003: %s failure rolls back mutation, audit and replay record; retry can succeed',
  async (kind) => {
    const value = await scope(),
      key = randomUUID();
    repository.failAfterAudit = kind === 'business';
    repository.invalidAuditActor = kind === 'audit';
    try {
      expect((await request(value.access, value.branchA, key)).statusCode).toBe(500);
    } finally {
      repository.failAfterAudit = false;
      repository.invalidAuditActor = false;
    }
    const [branch] = await fixture.connection.db
      .select()
      .from(branches)
      .where(eq(branches.id, value.branchA));
    expect(branch?.name).toBe('Branch A');
    expect(await auditRows(value.branchA)).toHaveLength(0);
    expect(await cacheRows(value.ownerId, key)).toHaveLength(0);
    expect((await request(value.access, value.branchA, key)).statusCode).toBe(200);
    expect(await auditRows(value.branchA)).toHaveLength(1);
  },
);
it('MGR-004: a revoked manager grant or session cannot replay a previously successful response', async () => {
  const value = await scope(),
    key = randomUUID();
  await fixture.connection.db
    .update(managerAssignments)
    .set({
      status: 'active',
      activatedAt: now,
      tempPasswordHash: null,
      tempPasswordExpiresAt: null,
    })
    .where(eq(managerAssignments.id, value.assignmentId));
  const manager = await fixture.service.issue(value.managerId, 'mobile');
  expect((await request(manager.accessToken, value.branchA, key)).statusCode).toBe(200);
  await fixture.connection.db
    .update(managerAssignments)
    .set({ status: 'suspended' })
    .where(eq(managerAssignments.id, value.assignmentId));
  expect((await request(manager.accessToken, value.branchA, key)).statusCode).toBe(403);
  expect(await auditRows(value.branchA)).toHaveLength(1);
  await fixture.service.logout(value.managerId, manager.sessionId);
  expect((await request(manager.accessToken, value.branchA, key)).statusCode).toBe(401);
});
