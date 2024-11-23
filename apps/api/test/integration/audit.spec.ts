import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { users, branches, hostelAuditLog, platformAuditLog, sensitiveAccessLog } from '@hsm/db';
import { AuthCrypto } from '../../src/auth/crypto.js';
import { AuditWriter } from '../../src/audit/writer.js';
import { testKeys } from '../keys.js';
import { authFixture } from './auth-fixture.js';
import { managementFixture } from './management-fixture.js';
let fixture: Awaited<ReturnType<typeof authFixture>>;
const now = new Date('2026-10-08T00:00:00Z');
const writer = new AuditWriter();
beforeAll(async () => {
  fixture = await authFixture(new AuthCrypto(testKeys()), now);
});
afterAll(async () => {
  await fixture?.close();
});
it('SEC-003: business change and hostel audit commit together', async () => {
  const value = await managementFixture(fixture.connection.db, 'unused fixture hash', now);
  const [branch] = await fixture.connection.db
    .select({ organizationId: branches.organizationId })
    .from(branches)
    .where(eq(branches.id, value.branchA));
  if (!branch) throw new Error('Audit fixture branch missing');
  await fixture.connection.db.transaction(async (transaction) => {
    await transaction
      .update(users)
      .set({ fullName: 'Audited manager' })
      .where(eq(users.id, value.managerId));
    await writer.hostel(transaction, {
      actorUserId: value.ownerId,
      actorRole: 'owner',
      action: 'fixture.identity.updated',
      targetType: 'user',
      targetId: value.managerId,
      organizationId: branch.organizationId,
      branchId: value.branchA,
      before: { fullName: 'Integration Manager' },
      after: { fullName: 'Audited manager' },
      createdAt: now,
    });
  });
  const [identity] = await fixture.connection.db
    .select()
    .from(users)
    .where(eq(users.id, value.managerId));
  const rows = await fixture.connection.db
    .select()
    .from(hostelAuditLog)
    .where(eq(hostelAuditLog.targetId, value.managerId));
  expect(identity?.fullName).toBe('Audited manager');
  expect(rows).toHaveLength(1);
});
it('SEC-003: an audit constraint failure rolls back the preceding business write', async () => {
  const actor = randomUUID();
  await fixture.connection.db.insert(users).values({ id: actor, fullName: 'Original identity' });
  await expect(
    fixture.connection.db.transaction(async (transaction) => {
      await transaction
        .update(users)
        .set({ fullName: 'Must roll back' })
        .where(eq(users.id, actor));
      await writer.platform(transaction, {
        actorUserId: randomUUID(),
        actorRole: 'owner',
        action: 'fixture.identity.updated',
        targetType: 'user',
        targetId: actor,
      });
    }),
  ).rejects.toThrow();
  const [identity] = await fixture.connection.db.select().from(users).where(eq(users.id, actor));
  expect(identity?.fullName).toBe('Original identity');
  expect(
    await fixture.connection.db
      .select()
      .from(platformAuditLog)
      .where(eq(platformAuditLog.targetId, actor)),
  ).toEqual([]);
});
it('SEC-003: later business failure rolls back both platform and sensitive audit rows', async () => {
  const actor = randomUUID();
  await fixture.connection.db.insert(users).values({ id: actor, fullName: 'Audit actor' });
  await expect(
    fixture.connection.db.transaction(async (transaction) => {
      await transaction
        .update(users)
        .set({ fullName: 'Must not persist' })
        .where(eq(users.id, actor));
      await writer.platform(transaction, {
        actorUserId: actor,
        actorRole: 'customer',
        action: 'fixture.identity.read',
        targetType: 'user',
        targetId: actor,
      });
      await writer.sensitive(transaction, {
        actorUserId: actor,
        subjectUserId: actor,
        resource: 'cnic',
        purpose: 'Self identity',
      });
      throw new Error('Business failure');
    }),
  ).rejects.toThrow('Business failure');
  const [identity] = await fixture.connection.db.select().from(users).where(eq(users.id, actor));
  expect(identity?.fullName).toBe('Audit actor');
  expect(
    await fixture.connection.db
      .select()
      .from(platformAuditLog)
      .where(eq(platformAuditLog.targetId, actor)),
  ).toEqual([]);
  expect(
    await fixture.connection.db
      .select()
      .from(sensitiveAccessLog)
      .where(eq(sensitiveAccessLog.actorUserId, actor)),
  ).toEqual([]);
});
