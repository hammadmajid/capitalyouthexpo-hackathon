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
