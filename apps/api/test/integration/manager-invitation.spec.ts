import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import {
  branches,
  brands,
  customerProfiles,
  hostelAuditLog,
  idempotencyKeys,
  managerAssignments,
  users,
} from '@hsm/db';
import { managerInvitationResponseSchema, managerInvitationStateSchema } from '@hsm/contracts';
import { AuditWriter, type Transaction } from '../../src/audit/writer.js';
import { AuthCrypto, hashPassword, verifyPassword } from '../../src/auth/crypto.js';
import { InvitationRepository } from '../../src/management/invitation.repository.js';
import { InvitationService } from '../../src/management/invitation.service.js';
import { testKeys } from '../keys.js';
import { authFixture } from './auth-fixture.js';
import {
  activateInvitation,
  invitationBody,
  invitationOwner,
  inviteManager,
  persistedInvitation,
  resetInvitation,
  type InvitationFixture,
} from './manager-invitation-fixture.js';
const now = new Date('2026-10-11T00:00:00Z');
let fixture: InvitationFixture, permanentHash: string;
beforeAll(async () => {
  fixture = await authFixture(new AuthCrypto(testKeys()), now);
  permanentHash = await hashPassword('Existing permanent integration phrase');
});
afterAll(async () => {
  await fixture?.close();
});
const scope = () => invitationOwner(fixture, permanentHash, now);
const audits = (id: string) =>
  fixture.connection.db
    .select()
    .from(hostelAuditLog)
    .where(
      and(eq(hostelAuditLog.targetType, 'manager_assignment'), eq(hostelAuditLog.targetId, id)),
    );
it('AUTH-M-001 SEC ACC-006: real auto issuance stores hashes only, retains an unverified phone and never reissues a replay secret', async () => {
  const owner = await scope(),
    body = invitationBody(),
    key = randomUUID();
  const response = await inviteManager(fixture, owner.headers, owner.branchA, body, key);
  expect(response.statusCode).toBe(201);
  const state = managerInvitationResponseSchema.parse(response.json());
  expect(state.generatedTempPassword).toBeDefined();
  const persisted = await persistedInvitation(fixture, state.id);
  expect(persisted.identity).toMatchObject({
    fullName: body.fullName,
    phoneE164: body.phone,
    phoneVerifiedAt: null,
    email: null,
    passwordHash: null,
  });
  expect(persisted.assignment).toMatchObject({
    status: 'pending_activation',
    tempPasswordAttempts: 0,
    lockedAt: null,
    appointedByUserId: owner.ownerId,
  });
  expect(
    await verifyPassword(persisted.assignment.tempPasswordHash, state.generatedTempPassword ?? ''),
  ).toBe(true);
  const [cache] = await fixture.connection.db
    .select()
    .from(idempotencyKeys)
    .where(eq(idempotencyKeys.key, key));
  expect(managerInvitationStateSchema.parse(cache?.responseBody)).not.toHaveProperty(
    'generatedTempPassword',
  );
  expect(JSON.stringify(cache)).not.toContain(state.generatedTempPassword);
  const replay = await inviteManager(fixture, owner.headers, owner.branchA, body, key);
  expect(replay.statusCode).toBe(201);
  expect(replay.headers['idempotency-replayed']).toBe('true');
  expect(replay.json()).not.toHaveProperty('generatedTempPassword');
  const evidence = await audits(state.id);
  expect(evidence).toHaveLength(1);
  for (const privateValue of [body.fullName, body.phone, state.generatedTempPassword])
    expect(
      JSON.stringify(evidence, (_key, value: unknown) =>
        typeof value === 'bigint' ? value.toString() : value,
      ),
    ).not.toContain(privateValue);
  expect(
    (
      await inviteManager(
        fixture,
        owner.headers,
        owner.branchA,
        { ...body, fullName: 'Changed Manager' },
        key,
      )
    ).statusCode,
  ).toBe(409);
});
it('AUTH-M-001..003 SEC-001: manual invitation activates once and grants only its real branch', async () => {
  const owner = await scope(),
    body = invitationBody(),
    tempPassword = 'Owner supplied temporary phrase';
  const result = await inviteManager(fixture, owner.headers, owner.branchA, {
    ...body,
    temporaryCredential: { mode: 'manual', password: tempPassword },
  });
  expect(result.statusCode).toBe(201);
  expect(result.json()).not.toHaveProperty('generatedTempPassword');
  const activation = await activateInvitation(fixture, body.phone, tempPassword);
  expect(activation.statusCode).toBe(200);
  const headers = { authorization: 'Bearer ' + activation.json().accessToken };
  expect(
    (await fixture.application.inject({ url: '/v1/manage/branches/' + owner.branchA, headers }))
      .statusCode,
  ).toBe(200);
  expect(
    (await fixture.application.inject({ url: '/v1/manage/branches/' + owner.branchB, headers }))
      .statusCode,
  ).toBe(403);
  expect((await activateInvitation(fixture, body.phone, tempPassword)).statusCode).toBe(401);
  const persisted = await persistedInvitation(fixture, result.json().id);
  expect(persisted.assignment).toMatchObject({
    status: 'active',
    tempPasswordHash: null,
    tempPasswordExpiresAt: null,
    activatedAt: now,
  });
  expect(
    await verifyPassword(persisted.identity.passwordHash, 'Permanent invited Manager phrase'),
  ).toBe(true);
});
it('CHG-006 AUTH-M SEC: permanent Customer retains password/devices and must accept through their authenticated account', async () => {
  const owner = await scope(),
    body = invitationBody(),
    userId = randomUUID();
  await fixture.connection.db.insert(users).values({
    id: userId,
    fullName: 'Existing Customer',
    phoneE164: body.phone,
    passwordHash: permanentHash,
    email: randomUUID() + '@example.test',
    emailVerifiedAt: now,
  });
  await fixture.connection.db.insert(customerProfiles).values({ userId });
  const credential = await fixture.service.issue(userId, 'mobile');
  const result = await inviteManager(fixture, owner.headers, owner.branchA, body);
  expect(result.statusCode).toBe(201);
  expect(result.json()).toMatchObject({ acceptance: 'authenticated_account' });
  expect(result.json()).not.toHaveProperty('generatedTempPassword');
  const persisted = await persistedInvitation(fixture, result.json().id);
  expect(persisted.identity).toMatchObject({
    id: userId,
    fullName: 'Existing Customer',
    passwordHash: permanentHash,
  });
  expect(persisted.assignment.tempPasswordHash).toBeNull();
  expect(
    (await resetInvitation(fixture, owner.headers, owner.branchA, result.json().id)).statusCode,
  ).toBe(409);
  expect(
    (await activateInvitation(fixture, body.phone, 'Owner supplied temporary phrase')).statusCode,
  ).toBe(401);
  const accept = await fixture.application.inject({
    method: 'POST',
    url: '/v1/me/manager-invitations/accept',
    headers: { authorization: 'Bearer ' + credential.accessToken },
    payload: {},
  });
  expect(accept.statusCode).toBe(200);
  expect(accept.json().capabilities).toMatchObject({
    customer: true,
    managerOf: [{ branchId: owner.branchA }],
  });
  expect((await fixture.service.authenticate(credential.accessToken)).userId).toBe(userId);
  expect((await persistedInvitation(fixture, result.json().id)).identity.passwordHash).toBe(
    permanentHash,
  );
});
it('SEC-001: foreign Owners and Managers cannot issue or reset credentials', async () => {
  const owner = await scope(),
    foreign = await scope();
  expect((await inviteManager(fixture, foreign.headers, owner.branchA)).statusCode).toBe(403);
  const manager = await fixture.service.issue(owner.managerId, 'mobile');
  const headers = { authorization: 'Bearer ' + manager.accessToken };
  expect((await inviteManager(fixture, headers, owner.branchA)).statusCode).toBe(403);
  expect(
    (await resetInvitation(fixture, foreign.headers, owner.branchA, owner.assignmentId)).statusCode,
  ).toBe(403);
  expect(
    (await resetInvitation(fixture, owner.headers, owner.branchA, randomUUID())).statusCode,
  ).toBe(404);
});
it('AUTH-M-003 SEC: five persisted failed attempts lock activation; Owner reset retires the old credential and unlocks pending invitation', async () => {
  const owner = await scope(),
    body = invitationBody();
  const result = managerInvitationResponseSchema.parse(
    (await inviteManager(fixture, owner.headers, owner.branchA, body)).json(),
  );
  for (let attempt = 0; attempt < 5; attempt++)
    expect(
      (await activateInvitation(fixture, body.phone, 'Wrong temporary phrase')).statusCode,
    ).toBe(401);
  expect((await persistedInvitation(fixture, result.id)).assignment).toMatchObject({
    tempPasswordAttempts: 5,
    lockedAt: now,
  });
  expect(
    (await activateInvitation(fixture, body.phone, result.generatedTempPassword ?? '')).statusCode,
  ).toBe(401);
  const reset = await resetInvitation(fixture, owner.headers, owner.branchA, result.id);
  expect(reset.statusCode).toBe(200);
  const replacement = managerInvitationResponseSchema.parse(reset.json());
  expect(replacement.generatedTempPassword).not.toBe(result.generatedTempPassword);
  expect((await persistedInvitation(fixture, result.id)).assignment).toMatchObject({
    tempPasswordAttempts: 0,
    lockedAt: null,
  });
  expect(
    (await activateInvitation(fixture, body.phone, result.generatedTempPassword ?? '')).statusCode,
  ).toBe(401);
  expect(
    (await activateInvitation(fixture, body.phone, replacement.generatedTempPassword ?? ''))
      .statusCode,
  ).toBe(200);
  expect((await resetInvitation(fixture, owner.headers, owner.branchA, result.id)).statusCode).toBe(
    409,
  );
});
it('AUTH-M-003: expired invitation fails until Owner reset renews the existing 24-hour policy', async () => {
  const owner = await scope(),
    body = invitationBody();
  const state = managerInvitationResponseSchema.parse(
    (await inviteManager(fixture, owner.headers, owner.branchA, body)).json(),
  );
  await fixture.connection.db
    .update(managerAssignments)
    .set({ tempPasswordExpiresAt: new Date(now.getTime() - 1) })
    .where(eq(managerAssignments.id, state.id));
  expect(
    (await activateInvitation(fixture, body.phone, state.generatedTempPassword ?? '')).statusCode,
  ).toBe(401);
  const key = randomUUID(),
    reset = await resetInvitation(
      fixture,
      owner.headers,
      owner.branchA,
      state.id,
      { temporaryCredential: { mode: 'auto' } },
      key,
    );
  expect(reset.statusCode).toBe(200);
  expect(reset.json().expiresAt).toBe('2026-10-12T00:00:00.000Z');
  const replay = await resetInvitation(
    fixture,
    owner.headers,
    owner.branchA,
    state.id,
    { temporaryCredential: { mode: 'auto' } },
    key,
  );
  expect(replay.statusCode).toBe(200);
  expect(replay.headers['idempotency-replayed']).toBe('true');
  expect(replay.json()).not.toHaveProperty('generatedTempPassword');
});
it('ACC-006: concurrent same-key issuance has one identity, assignment, audit and one secret disclosure', async () => {
  const owner = await scope(),
    body = invitationBody(),
    key = randomUUID();
  const responses = await Promise.all(
    Array.from({ length: 3 }, () =>
      inviteManager(fixture, owner.headers, owner.branchA, body, key),
    ),
  );
  expect(responses.map((response) => response.statusCode)).toEqual([201, 201, 201]);
  const results = responses.map((response) =>
    managerInvitationResponseSchema.parse(response.json()),
  );
  expect(new Set(results.map((result) => result.id)).size).toBe(1);
  expect(results.filter((result) => result.generatedTempPassword)).toHaveLength(1);
  expect(await audits(results[0]?.id ?? '')).toHaveLength(1);
  expect(
    await fixture.connection.db.select().from(users).where(eq(users.phoneE164, body.phone)),
  ).toHaveLength(1);
});
it('ACC-006: concurrent different-key appointment cannot create a second live assignment', async () => {
  const owner = await scope(),
    body = invitationBody();
  const responses = await Promise.all([
    inviteManager(fixture, owner.headers, owner.branchA, body),
    inviteManager(fixture, owner.headers, owner.branchB, body),
  ]);
  expect(responses.map((response) => response.statusCode).sort()).toEqual([201, 409]);
  const [identity] = await fixture.connection.db
    .select()
    .from(users)
    .where(eq(users.phoneE164, body.phone));
  expect(
    await fixture.connection.db
      .select()
      .from(managerAssignments)
      .where(eq(managerAssignments.userId, identity?.id ?? '')),
  ).toHaveLength(1);
});
it('SEC ACC-006: actual audit FK failure rolls back identity, assignment and idempotency response', async () => {
  const owner = await scope(),
    body = invitationBody(),
    key = randomUUID();
  class FailingAudit extends AuditWriter {
    override hostel(database: Transaction, event: Parameters<AuditWriter['hostel']>[1]) {
      return super.hostel(database, { ...event, actorUserId: randomUUID() });
    }
  }
  const service = new InvitationService(
    new InvitationRepository(fixture.connection.db, new FailingAudit()),
    new AuthCrypto(testKeys()),
    () => now,
  );
  await expect(service.invite(owner.actor, key, owner.branchA, body)).rejects.toThrow();
  expect(
    await fixture.connection.db.select().from(users).where(eq(users.phoneE164, body.phone)),
  ).toHaveLength(0);
  expect(
    await fixture.connection.db.select().from(idempotencyKeys).where(eq(idempotencyKeys.key, key)),
  ).toHaveLength(0);
});
it('SEC: persisted logout rejects the very next invitation mutation', async () => {
  const owner = await scope();
  expect(
    (
      await fixture.application.inject({
        method: 'POST',
        url: '/v1/auth/logout',
        headers: owner.headers,
        payload: {},
      })
    ).statusCode,
  ).toBe(200);
  expect((await inviteManager(fixture, owner.headers, owner.branchA)).statusCode).toBe(401);
});
it('SEC: archive immediately rejects invitation replay and preserves prior history', async () => {
  const owner = await scope(),
    body = invitationBody(),
    key = randomUUID();
  const result = await inviteManager(fixture, owner.headers, owner.branchA, body, key);
  expect(result.statusCode).toBe(201);
  const [branch] = await fixture.connection.db
    .select()
    .from(branches)
    .where(eq(branches.id, owner.branchA));
  await fixture.connection.db
    .update(brands)
    .set({ archivedAt: now })
    .where(eq(brands.id, branch?.brandId ?? ''));
  expect((await inviteManager(fixture, owner.headers, owner.branchA, body, key)).statusCode).toBe(
    403,
  );
  expect((await persistedInvitation(fixture, result.json().id)).assignment.status).toBe(
    'pending_activation',
  );
});
it('AUTH-M MGR-004: deactivation preserves history and allows a new invitation without restoring old credentials', async () => {
  const owner = await scope(),
    body = invitationBody();
  const first = await inviteManager(fixture, owner.headers, owner.branchA, body);
  expect(first.statusCode).toBe(201);
  const deactivate = await fixture.application.inject({
    method: 'POST',
    url: '/v1/manage/branches/' + owner.branchA + '/managers/' + first.json().id + '/deactivate',
    headers: owner.headers,
    // AUTH-M-006: the Owner confirms with their own password.
    payload: { currentPassword: 'Existing permanent integration phrase' },
  });
  expect(deactivate.statusCode).toBe(200);
  const second = await inviteManager(fixture, owner.headers, owner.branchB, body);
  expect(second.statusCode).toBe(201);
  expect(second.json().id).not.toBe(first.json().id);
  expect((await persistedInvitation(fixture, first.json().id)).assignment).toMatchObject({
    status: 'deactivated',
    tempPasswordHash: null,
    deactivatedAt: now,
  });
  expect((await persistedInvitation(fixture, second.json().id)).assignment.branchId).toBe(
    owner.branchB,
  );
});
