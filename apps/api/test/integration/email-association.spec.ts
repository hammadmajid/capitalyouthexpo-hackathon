import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  emailOtps,
  managerAssignments,
  notificationOutbox,
  platformAuditLog,
  users,
} from '@hsm/db';
import { AuthCrypto, hashPassword } from '../../src/auth/crypto.js';
import { AuditWriter, type Transaction } from '../../src/audit/writer.js';
import { EmailAssociationRepository } from '../../src/auth/email-association.repository.js';
import { EmailAssociationService } from '../../src/auth/email-association.service.js';
import { ProfileRepository } from '../../src/auth/profile.repository.js';
import { testKeys } from '../keys.js';
import { authFixture } from './auth-fixture.js';
import { managementFixture } from './management-fixture.js';
const now = new Date('2026-10-12T12:00:00Z'),
  crypto = new AuthCrypto(testKeys());
const password = 'Permanent phone-only Manager phrase';
let fixture: Awaited<ReturnType<typeof authFixture>>, hash: string;
beforeAll(async () => {
  fixture = await authFixture(crypto, now);
  hash = await hashPassword(password);
});
afterAll(async () => {
  await fixture?.close();
});
async function manager() {
  const scope = await managementFixture(fixture.connection.db, hash, now);
  await fixture.connection.db
    .update(users)
    .set({ passwordHash: hash })
    .where(eq(users.id, scope.managerId));
  await fixture.connection.db
    .update(managerAssignments)
    .set({
      status: 'active',
      activatedAt: now,
      tempPasswordHash: null,
      tempPasswordExpiresAt: null,
    })
    .where(eq(managerAssignments.id, scope.assignmentId));
  const credentials = await fixture.service.issue(scope.managerId, 'mobile');
  return {
    ...scope,
    credentials,
    email: randomUUID() + '@example.test',
    headers: { authorization: 'Bearer ' + credentials.accessToken },
  };
}
type Manager = Awaited<ReturnType<typeof manager>>;
const post = (scope: Manager, suffix: string, payload: Record<string, unknown>) =>
  fixture.application.inject({
    method: 'POST',
    url: '/v1/auth/email/associate' + suffix,
    headers: scope.headers,
    payload,
  });
const request = (scope: Manager) =>
  post(scope, '', { email: scope.email, currentPassword: password });
async function proof(scope: Manager) {
  const [message] = await fixture.connection.db
    .select()
    .from(notificationOutbox)
    .where(
      and(
        eq(notificationOutbox.recipientUserId, scope.managerId),
        eq(notificationOutbox.eventType, 'auth.otp'),
      ),
    )
    .orderBy(desc(notificationOutbox.createdAt), desc(notificationOutbox.id))
    .limit(1);
  const envelope = z.string().parse(message?.payload.envelope);
  return z
    .object({ code: z.string(), purpose: z.literal('email_change'), email: z.literal(scope.email) })
    .parse(JSON.parse(crypto.decrypt(Buffer.from(envelope, 'base64'), 'email').toString())).code;
}
async function state(scope: Manager) {
  const [identity] = await fixture.connection.db
    .select()
    .from(users)
    .where(eq(users.id, scope.managerId));
  const [challenge] = await fixture.connection.db
    .select()
    .from(emailOtps)
    .where(eq(emailOtps.userId, scope.managerId))
    .orderBy(desc(emailOtps.createdAt), desc(emailOtps.id))
    .limit(1);
  const audits = await fixture.connection.db
    .select()
    .from(platformAuditLog)
    .where(
      and(
        eq(platformAuditLog.targetId, scope.managerId),
        eq(platformAuditLog.action, 'auth.email_associated'),
      ),
    );
  return { identity, challenge, audits };
}
it('AUTH-M CHG-006 AUD-001: real email proof binds the same Manager once without replacing password, phone or live sessions', async () => {
  const scope = await manager();
  expect((await request(scope)).statusCode).toBe(202);
  expect((await request(scope)).statusCode).toBe(202);
  const pending = await state(scope);
  expect(pending.identity?.email).toBeNull();
  expect(pending.challenge?.consumedAt).toBeNull();
  const messages = await fixture.connection.db
    .select()
    .from(notificationOutbox)
    .where(
      and(
        eq(notificationOutbox.recipientUserId, scope.managerId),
        eq(notificationOutbox.eventType, 'auth.otp'),
      ),
    );
  expect(messages).toHaveLength(1);
  const code = await proof(scope),
    result = await post(scope, '/verify', { email: scope.email.toUpperCase(), code });
  expect(result.statusCode).toBe(200);
  expect(result.headers['cache-control']).toBe('no-store');
  expect(result.headers['set-cookie']).toBeUndefined();
  expect(result.json()).not.toHaveProperty('accessToken');
  expect(result.json().user).toMatchObject({
    id: scope.managerId,
    email: scope.email,
    emailVerified: true,
  });
  expect(result.json().capabilities.managerOf).toEqual([
    { branchId: scope.branchA, branchName: 'Branch A' },
  ]);
  const saved = await state(scope);
  expect(saved.identity).toMatchObject({
    email: scope.email,
    emailVerifiedAt: now,
    phoneE164: scope.phone,
    phoneVerifiedAt: null,
    passwordHash: hash,
  });
  expect(saved.challenge).toMatchObject({ attempts: 1, consumedAt: now });
  expect(saved.audits).toHaveLength(1);
  expect(saved.audits[0]?.after).toEqual({ emailVerified: true });
  expect(await fixture.service.authenticate(scope.credentials.accessToken)).toMatchObject({
    userId: scope.managerId,
  });
  expect((await post(scope, '/verify', { email: scope.email, code })).statusCode).toBe(403);
});
it('SEC: real incorrect proof attempts persist and lock without binding or consuming', async () => {
  const scope = await manager();
  await request(scope);
  const code = await proof(scope),
    wrong = code === '000000' ? '111111' : '000000';
  for (let i = 0; i < 6; i++)
    expect((await post(scope, '/verify', { email: scope.email, code: wrong })).statusCode).toBe(
      401,
    );
  expect(await state(scope)).toMatchObject({
    identity: { email: null },
    challenge: { attempts: 5, consumedAt: null },
    audits: [],
  });
  expect((await post(scope, '/verify', { email: scope.email, code })).statusCode).toBe(401);
});
it('SEC: claimed email acknowledgement never merges identities and a later claim prevents consumption', async () => {
  const scope = await manager();
  await fixture.connection.db
    .insert(users)
    .values({ fullName: 'Existing identity', email: scope.email });
  expect((await request(scope)).json()).toEqual({ accepted: true });
  expect((await state(scope)).challenge).toBeUndefined();
  const other = await manager();
  await request(other);
  const code = await proof(other);
  await fixture.connection.db
    .insert(users)
    .values({ fullName: 'Claimed identity', email: other.email });
  expect((await post(other, '/verify', { email: other.email, code })).statusCode).toBe(401);
  expect(await state(other)).toMatchObject({
    identity: { email: null },
    challenge: { attempts: 1, consumedAt: null },
    audits: [],
  });
});
it('AUTH-M SEC: concurrent valid proofs for one email commit exactly one identity and audit', async () => {
  const a = await manager(),
    b = await manager();
  b.email = a.email;
  await request(a);
  await request(b);
  const [codeA, codeB] = await Promise.all([proof(a), proof(b)]);
  const results = await Promise.all([
    post(a, '/verify', { email: a.email, code: codeA }),
    post(b, '/verify', { email: b.email, code: codeB }),
  ]);
  expect(results.map((r) => r.statusCode).sort()).toEqual([200, 401]);
  const [stateA, stateB] = await Promise.all([state(a), state(b)]);
  expect([stateA.identity?.email, stateB.identity?.email].filter(Boolean)).toEqual([a.email]);
  expect(stateA.audits.length + stateB.audits.length).toBe(1);
  expect([stateA.challenge?.consumedAt, stateB.challenge?.consumedAt].filter(Boolean)).toHaveLength(
    1,
  );
});
class InvalidAudit extends AuditWriter {
  override platform(tx: Transaction, input: Parameters<AuditWriter['platform']>[1]) {
    return super.platform(tx, { ...input, actorUserId: randomUUID() });
  }
}
it('AUD-001 SEC: real audit foreign-key failure rolls back email, verified flag, attempt, consumption and notice', async () => {
  const scope = await manager();
  await request(scope);
  const code = await proof(scope);
  const service = new EmailAssociationService(
    new EmailAssociationRepository(fixture.connection.db, new InvalidAudit(), () => now),
    fixture.otp,
    new ProfileRepository(fixture.connection.db),
    () => now,
  );
  await expect(
    service.verify(
      { userId: scope.managerId, sessionId: scope.credentials.sessionId },
      { email: scope.email, code },
    ),
  ).rejects.toThrow();
  expect(await state(scope)).toMatchObject({
    identity: { email: null, emailVerifiedAt: null },
    challenge: { attempts: 0, consumedAt: null },
    audits: [],
  });
  const notices = await fixture.connection.db
    .select()
    .from(notificationOutbox)
    .where(
      and(
        eq(notificationOutbox.recipientUserId, scope.managerId),
        eq(notificationOutbox.eventType, 'notification.create'),
      ),
    );
  expect(notices).toHaveLength(0);
});
it('SEC: logout or loss of live Manager assignment denies email verification immediately', async () => {
  for (const kind of ['logout', 'deactivate'] as const) {
    const scope = await manager();
    await request(scope);
    const code = await proof(scope);
    if (kind === 'logout')
      await fixture.service.logout(scope.managerId, scope.credentials.sessionId);
    else
      await fixture.connection.db
        .update(managerAssignments)
        .set({ status: 'deactivated' })
        .where(eq(managerAssignments.id, scope.assignmentId));
    expect((await post(scope, '/verify', { email: scope.email, code })).statusCode).toBe(
      kind === 'logout' ? 401 : 403,
    );
    expect(await state(scope)).toMatchObject({
      identity: { email: null },
      challenge: { attempts: 0, consumedAt: null },
      audits: [],
    });
  }
});
