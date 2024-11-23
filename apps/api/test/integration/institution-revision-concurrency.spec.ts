import { CustomerGovernanceService } from '../../src/admin/customer-governance.service.js';
import { randomUUID } from 'node:crypto';
import { AuditWriter } from '../../src/audit/writer.js';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { and, desc, eq, sql } from 'drizzle-orm';
import {
  adminAccounts,
  adminRoleGrants,
  cities,
  places,
  platformAuditLog,
  sessions,
  users,
  customerProfiles,
  notificationOutbox,
} from '@hsm/db';
import type { Actor } from '../../src/authorization/store.js';
import { AuthCrypto } from '../../src/auth/crypto.js';
import { IdempotencyRepository } from '../../src/idempotency/repository.js';
import { IdempotencyService } from '../../src/idempotency/service.js';
import { InstitutionRepository } from '../../src/marketplace/directory.repository.js';
import { InstitutionService } from '../../src/marketplace/directory.service.js';
import { AdminReferenceReadService } from '../../src/admin/reference-read.service.js';
import { testKeys } from '../keys.js';
import { authFixture } from './auth-fixture.js';

const now = new Date('2026-10-30T10:00:00.000Z');
const rootIds = [randomUUID(), randomUUID()];
const cityId = randomUUID();

let fixture: Awaited<ReturnType<typeof authFixture>>;
const actors: Actor[] = [];

beforeAll(async () => {
  fixture = await authFixture(new AuthCrypto(testKeys()), now, {}, [], (db, idempotency) => ({
    customerGovernance: new CustomerGovernanceService(db, idempotency, () => now),
  }));

  const db = fixture.connection.db;

  await db.insert(users).values(
    rootIds.map((id) => ({
      id,
      fullName: 'Disposable Institution Test Root',
    })),
  );

  await db.insert(adminAccounts).values(
    rootIds.map((userId) => ({
      userId,
      isRoot: true,
      status: 'active' as const,
    })),
  );

  await db.insert(cities).values({
    id: cityId,
    name: 'Disposable Concurrency City',
    slug: cityId,
  });

  for (const userId of rootIds) {
    if (!userId) throw new Error('Missing Root ID');

    await fixture.service.issue(userId, 'mobile');

    const [session] = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.userId, userId))
      .orderBy(desc(sessions.createdAt))
      .limit(1);

    if (!session) throw new Error('Root session was not created');

    actors.push({ userId, sessionId: session.id });
  }
});

afterAll(async () => {
  await fixture?.close();
});

it('GEO-003: competing authorized Root updates reject stale revision without duplicate audit', async () => {
  const db = fixture.connection.db;
  const [firstActor, secondActor] = actors;

  if (!firstActor || !secondActor) {
    throw new Error('Both Root actors are required');
  }

  const [isolation] = await db.transaction((tx) =>
    tx
      .select({
        level: sql<string>`current_setting('transaction_isolation')`,
      })
      .from(users)
      .limit(1),
  );

  expect(isolation?.level).toBe('read committed');

  const repository = new InstitutionRepository(undefined, () => now);

  const service = new InstitutionService(
    repository,
    new IdempotencyService(new IdempotencyRepository(db), () => now),
  );

  const reader = new AdminReferenceReadService(db, () => now);

  const initial = {
    name: 'Original University',
    changeReason: 'Verified institution location and identity',
    reapprove: true,
    shortName: null,
    cityId,
    areaId: null,
    address: 'Original address',
    latitude: 33.68,
    longitude: 73.04,
    aliases: ['Original Alias'],
    isActive: true,
    publicApproved: true,
  };

  const created = await service.save(firstActor, randomUUID(), initial);

  expect(created.status).toBe(201);

  const placeId = created.body.id;

  const original = await reader.institution(firstActor, placeId);

  if (!original) {
    throw new Error('Institution missing after creation');
  }

  expect(original.revision).toMatch(/^[1-9][0-9]*$/);

  // Test-only barrier: both authorized commands must enter
  // the real repository before either starts its save.
  const realSave = repository.save.bind(repository);

  let entered = 0;
  let release!: () => void;
  let gateTimeout: ReturnType<typeof setTimeout> | undefined;

  const gate = new Promise<void>((resolve, reject) => {
    release = () => {
      if (gateTimeout) clearTimeout(gateTimeout);
      resolve();
    };

    gateTimeout = setTimeout(() => {
      reject(new Error('Two Root updates did not reach the repository'));
    }, 10000);
  });

  const spy = vi.spyOn(repository, 'save').mockImplementation(async (...args) => {
    if (args[3]) {
      entered += 1;
      if (entered === 2) release();
      await gate;
    }

    return realSave(...args);
  });

  const results = await Promise.allSettled([
    service.save(
      firstActor,
      randomUUID(),
      {
        ...initial,
        name: 'First Root Update',
        latitude: 34,
        aliases: ['Reviewed alias'],
        expectedRevision: original.revision,
      },
      placeId,
    ),
    service.save(
      secondActor,
      randomUUID(),
      {
        ...initial,
        name: 'Second Root Update',
        latitude: 34,
        aliases: ['Reviewed alias'],
        expectedRevision: original.revision,
      },
      placeId,
    ),
  ]);

  spy.mockRestore();

  expect(entered).toBe(2);

  expect(results.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected']);

  for (const result of results) {
    if (result.status === 'rejected') {
      expect(result.reason).toMatchObject({
        code: 'CONFLICT',
        status: 409,
      });
    } else {
      expect(result.value.status).toBe(200);
      expect(result.value.replayed).toBe(false);
    }
  }

  const expectedName =
    results[0]?.status === 'fulfilled' ? 'First Root Update' : 'Second Root Update';

  const finalRecord = await reader.institution(firstActor, placeId);

  if (!finalRecord) {
    throw new Error('Institution missing after concurrent updates');
  }

  expect(finalRecord.name).toBe(expectedName);
  expect(finalRecord.revision).not.toBe(original.revision);

  const savedEvents = await db
    .select({ id: platformAuditLog.id })
    .from(platformAuditLog)
    .where(
      and(
        eq(platformAuditLog.targetType, 'place'),
        eq(platformAuditLog.targetId, placeId),
        eq(platformAuditLog.action, 'institution.saved'),
      ),
    );

  // Initial creation + exactly one successful update.
  // The rejected stale write must not produce an audit event.
  expect(savedEvents).toHaveLength(2);
  const history = await reader.institutionHistory(firstActor, placeId, { limit: 1 });
  expect(history.data[0]).toMatchObject({
    previousRevision: original.revision,
    reason: initial.changeReason,
    approval: 'reapproved',
    before: { name: initial.name },
    after: { name: expectedName },
  });
  expect(history.data[0]?.changedFields).toEqual(
    expect.arrayContaining(['name', 'latitude', 'aliases']),
  );
  expect(history.data[0]?.before?.aliases).toEqual(initial.aliases);
  expect(history.data[0]?.after?.aliases).toEqual(['Reviewed alias']);
  expect(history.nextCursor).toBeTruthy();
  const older = await reader.institutionHistory(firstActor, placeId, {
    cursor: history.nextCursor,
  });
  expect(older.data[0]).toMatchObject({ approval: 'created', before: null });
  expect(older.nextCursor).toBeNull();
  await expect(
    service.save(
      firstActor,
      randomUUID(),
      {
        ...initial,
        name: 'Unreviewed material edit',
        reapprove: false,
        expectedRevision: finalRecord.revision,
      },
      placeId,
    ),
  ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 });

  const [stored] = await db
    .select({ id: places.id, name: places.name })
    .from(places)
    .where(eq(places.id, placeId));

  expect(stored?.name).toBe(expectedName);
});

it('HMA-015: customer enforcement is audited, idempotent and protects Admin identities', async () => {
  const db = fixture.connection.db,
    actor = actors[0],
    protectedId = rootIds[1];
  if (!actor || !protectedId) throw new Error('Root fixtures missing');
  const target = randomUUID();
  await db.insert(users).values({ id: target, fullName: 'Disposable Customer', updatedAt: now });
  await db.insert(customerProfiles).values([{ userId: target }, { userId: protectedId }]);
  await fixture.service.issue(target, 'mobile');
  const service = new CustomerGovernanceService(
    db,
    new IdempotencyService(new IdempotencyRepository(db), () => now),
    () => now,
  );
  const list = await service.list(actor, {});
  expect(list.data.map((r) => r.userId)).not.toContain(protectedId);
  const current = list.data.find((r) => r.userId === target);
  if (!current) throw new Error('Customer missing');
  const body = {
    action: 'suspend',
    reason: 'Confirmed repeated platform harassment',
    expectedStatus: current.status,
    expectedUpdatedAt: current.updatedAt,
  };
  const failedAudit = vi
    .spyOn(AuditWriter.prototype, 'platform')
    .mockRejectedValueOnce(new Error('Disposable audit outage'));
  await expect(service.decide(actor, randomUUID(), target, body)).rejects.toThrow(
    'Disposable audit outage',
  );
  failedAudit.mockRestore();
  expect(
    (await db.select({ status: users.accountStatus }).from(users).where(eq(users.id, target)))[0]
      ?.status,
  ).toBe('active');
  expect(
    (await db.select().from(sessions).where(eq(sessions.userId, target))).every(
      (s) => s.revokedAt === null,
    ),
  ).toBe(true);
  expect(
    await db
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.recipientUserId, target)),
  ).toHaveLength(0);
  const key = randomUUID(),
    result = await service.decide(actor, key, target, body);
  expect(result.body.status).toBe('suspended');
  expect((await service.decide(actor, key, target, body)).replayed).toBe(true);
  await expect(service.decide(actor, randomUUID(), target, body)).rejects.toMatchObject({
    code: 'CONFLICT',
  });
  await expect(service.decide(actor, randomUUID(), protectedId, body)).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
  const targetSessions = await db.select().from(sessions).where(eq(sessions.userId, target));
  expect(targetSessions.every((s) => s.revokedAt !== null)).toBe(true);
  expect(
    await db
      .select()
      .from(platformAuditLog)
      .where(
        and(eq(platformAuditLog.targetId, target), eq(platformAuditLog.action, 'customer.suspend')),
      ),
  ).toHaveLength(1);
  expect(
    await db
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.recipientUserId, target)),
  ).toHaveLength(1);
  const restored = await service.decide(actor, randomUUID(), target, {
    action: 'reinstate',
    reason: 'Appeal reviewed and restriction lifted',
    expectedStatus: result.body.status,
    expectedUpdatedAt: result.body.updatedAt,
  });
  expect(restored.body.status).toBe('active');
  const rootToken = (await fixture.service.issue(actor.userId, 'mobile')).accessToken;
  const apiList = await fixture.application.inject({
    url: '/v1/admin/customers',
    headers: { authorization: 'Bearer ' + rootToken },
  });
  expect(apiList.statusCode).toBe(200);
  expect(apiList.body).not.toContain('phoneE164');

  expect(
    (await db.select().from(sessions).where(eq(sessions.userId, target))).every(
      (s) => s.revokedAt !== null,
    ),
  ).toBe(true);
  for (const role of ['content_moderator', 'verification', 'support'] as const) {
    const staffId = randomUUID();
    await db.insert(users).values({ id: staffId, fullName: 'Disposable role fixture' });
    await db.insert(adminAccounts).values({ userId: staffId, status: 'active' });
    await db
      .insert(adminRoleGrants)
      .values({ adminUserId: staffId, role, grantedByUserId: actor.userId });
    const token = (await fixture.service.issue(staffId, 'mobile')).accessToken;
    expect(
      (
        await fixture.application.inject({
          url: '/v1/admin/customers',
          headers: { authorization: 'Bearer ' + token },
        })
      ).statusCode,
    ).toBe(role === 'content_moderator' ? 200 : 403);
  }
  const customerToken = (await fixture.service.issue(target, 'mobile')).accessToken;
  expect(
    (
      await fixture.application.inject({
        url: '/v1/admin/customers',
        headers: { authorization: 'Bearer ' + customerToken },
      })
    ).statusCode,
  ).toBe(403);
});
