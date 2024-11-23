import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import {
  branches,
  cities,
  areas,
  users,
  hostelAuditLog,
  managerAssignments,
  notificationOutbox,
  organizations,
  sessions,
} from '@hsm/db';
import { AuthCrypto } from '../../src/auth/crypto.js';
import { testKeys } from '../keys.js';
import { authFixture } from './auth-fixture.js';
import { managementFixture } from './management-fixture.js';
const now = new Date('2026-10-08T12:00:00Z');
let fixture: Awaited<ReturnType<typeof authFixture>>;
beforeAll(async () => {
  fixture = await authFixture(new AuthCrypto(testKeys()), now);
});
afterAll(async () => {
  await fixture?.close();
});
async function scopeFixture() {
  const scope = await managementFixture(fixture.connection.db, 'unused fixture hash', now);
  await fixture.connection.db
    .update(managerAssignments)
    .set({
      status: 'active',
      activatedAt: now,
      tempPasswordHash: null,
      tempPasswordExpiresAt: null,
    })
    .where(eq(managerAssignments.id, scope.assignmentId));
  return scope;
}
async function token(userId: string) {
  return (await fixture.service.issue(userId, 'mobile')).accessToken;
}
function request(url: string, accessToken: string, payload?: object) {
  return fixture.application.inject({
    method: payload ? 'POST' : 'GET',
    url: '/v1/' + url,
    headers: { authorization: 'Bearer ' + accessToken },
    ...(payload ? { payload } : {}),
  });
}
const path = (scope: Awaited<ReturnType<typeof scopeFixture>>, action: string) =>
  'manage/branches/' + scope.branchA + '/managers/' + scope.assignmentId + '/' + action;
it('SEC-001/ACC-002: real management lists and lookup enforce owner/manager scope and strict pagination', async () => {
  const scope = await scopeFixture();
  const owner = await token(scope.ownerId),
    manager = await token(scope.managerId);
  const list = await request('manage/branches', manager);
  expect(list.statusCode).toBe(200);
  expect(list.json<{ data: { id: string }[] }>().data.map((row) => row.id)).toEqual([
    scope.branchA,
  ]);
  expect((await request('manage/branches/' + scope.branchA, manager)).statusCode).toBe(200);
  expect((await request('manage/branches/' + scope.branchB, manager)).statusCode).toBe(403);
  expect(
    (await request('manage/branches/' + scope.branchA + '/managers', manager)).statusCode,
  ).toBe(403);
  expect((await request('owner/organizations', manager)).statusCode).toBe(403);
  const page = await request('owner/branches?limit=1', owner);
  expect(page.statusCode).toBe(200);
  const body = page.json<{ data: { id: string }[]; nextCursor: string }>();
  expect(body.data).toHaveLength(1);
  expect(body.nextCursor).toBe(body.data[0]?.id);
  expect(
    (await request('owner/branches?limit=1&cursor=' + body.nextCursor, owner)).json<{
      data: unknown[];
      nextCursor: null;
    }>(),
  ).toMatchObject({ data: [expect.anything()], nextCursor: null });
  expect((await request('owner/branches?limit=101', owner)).statusCode).toBe(400);
  expect((await request('owner/branches?userId=' + scope.managerId, owner)).statusCode).toBe(400);
});
it.each(['suspend', 'deactivate'] as const)(
  'MGR-004/ACC-003: real %s revokes every device before the next protected request',
  async (action) => {
    const scope = await scopeFixture();
    const owner = await token(scope.ownerId),
      manager = await token(scope.managerId);
    const device = await fixture.service.issue(scope.managerId, 'mobile');
    expect((await request('manage/branches/' + scope.branchA, manager)).statusCode).toBe(200);
    const response = await request(
      path(scope, action),
      owner,
      action === 'suspend' ? { reason: 'Owner suspension' } : {},
    );
    expect(response.statusCode).toBe(200);
    expect((await request('manage/branches/' + scope.branchA, manager)).statusCode).toBe(401);
    await expect(fixture.service.refresh(device.refreshToken, 'mobile')).rejects.toMatchObject({
      code: 'SESSION_REVOKED',
    });
    const audit = await fixture.connection.db
      .select()
      .from(hostelAuditLog)
      .where(eq(hostelAuditLog.targetId, scope.assignmentId));
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actorUserId: scope.ownerId,
      branchId: scope.branchA,
      action: 'manager.' + action,
    });
    const notices = await fixture.connection.db
      .select()
      .from(notificationOutbox)
      .where(
        and(
          eq(notificationOutbox.recipientUserId, scope.managerId),
          eq(notificationOutbox.channel, 'in_app'),
        ),
      );
    expect(notices).toHaveLength(1);
    expect(
      (await request(path(scope, action), owner, action === 'suspend' ? { reason: 'Repeat' } : {}))
        .statusCode,
    ).toBe(200);
    expect(
      await fixture.connection.db
        .select()
        .from(hostelAuditLog)
        .where(eq(hostelAuditLog.targetId, scope.assignmentId)),
    ).toHaveLength(1);
  },
);
it('SEC-001: foreign branch is 403 and a foreign assignment inside an owned branch is 404', async () => {
  const scope = await scopeFixture(),
    foreign = await scopeFixture();
  const owner = await token(scope.ownerId),
    manager = await token(scope.managerId);
  expect((await request(path(foreign, 'suspend'), owner, { reason: 'Forbidden' })).statusCode).toBe(
    403,
  );
  expect(
    (
      await request(
        'manage/branches/' + scope.branchA + '/managers/' + foreign.assignmentId + '/suspend',
        owner,
        { reason: 'Foreign child' },
      )
    ).statusCode,
  ).toBe(404);
  expect(
    (await request(path(scope, 'suspend'), manager, { reason: 'Self escalation' })).statusCode,
  ).toBe(403);
  expect(
    (
      await request(
        'manage/branches/' + scope.branchA + '/managers/' + randomUUID() + '/suspend',
        owner,
        { reason: 'Missing' },
      )
    ).statusCode,
  ).toBe(404);
});
it('MGR-004: reinstatement grants new requests but never resurrects revoked sessions; firing remains irreversible', async () => {
  const scope = await scopeFixture(),
    owner = await token(scope.ownerId),
    old = await token(scope.managerId);
  expect((await request(path(scope, 'suspend'), owner, { reason: 'Suspended' })).statusCode).toBe(
    200,
  );
  expect((await request(path(scope, 'reinstate'), owner, {})).statusCode).toBe(200);
  expect((await request('manage/branches/' + scope.branchA, old)).statusCode).toBe(401);
  const fresh = await token(scope.managerId);
  expect((await request('manage/branches/' + scope.branchA, fresh)).statusCode).toBe(200);
  expect((await request(path(scope, 'deactivate'), owner, {})).statusCode).toBe(200);
  expect((await request(path(scope, 'reinstate'), owner, {})).statusCode).toBe(409);
  expect((await request('manage/branches/' + scope.branchA, fresh)).statusCode).toBe(401);
});
it.each(['suspend', 'reinstate', 'deactivate'] as const)(
  'ACC-006: real audit failure rolls back %s, every session and notification',
  async (action) => {
    const scope = await scopeFixture(),
      owner = await token(scope.ownerId),
      manager = await token(scope.managerId);
    const before = action === 'reinstate' ? 'suspended' : 'active';
    if (before === 'suspended')
      await fixture.connection.db
        .update(managerAssignments)
        .set({ status: before, suspendedAt: now })
        .where(eq(managerAssignments.id, scope.assignmentId));
    await fixture.connection.db.execute(
      sql`create function fail_staff_audit() returns trigger language plpgsql as $$ begin raise exception 'fixture audit failure'; end $$`,
    );
    await fixture.connection.db.execute(
      sql`create trigger fail_staff_audit before insert on hostel_audit_log for each row execute function fail_staff_audit()`,
    );
    try {
      expect(
        (
          await request(
            path(scope, action),
            owner,
            action === 'suspend' ? { reason: 'Rollback' } : {},
          )
        ).statusCode,
      ).toBe(500);
      const [assignment] = await fixture.connection.db
        .select()
        .from(managerAssignments)
        .where(eq(managerAssignments.id, scope.assignmentId));
      expect(assignment?.status).toBe(before);
      expect((await request('protected-probe', manager)).statusCode).toBe(200);
      expect(
        await fixture.connection.db
          .select()
          .from(notificationOutbox)
          .where(eq(notificationOutbox.recipientUserId, scope.managerId)),
      ).toEqual([]);
      expect(
        await fixture.connection.db
          .select()
          .from(sessions)
          .where(
            and(
              eq(sessions.userId, scope.managerId),
              eq(sessions.revokedReason, 'manager_' + action),
            ),
          ),
      ).toEqual([]);
      expect(
        await fixture.connection.db
          .select()
          .from(hostelAuditLog)
          .where(eq(hostelAuditLog.targetId, scope.assignmentId)),
      ).toEqual([]);
    } finally {
      await fixture.connection.db.execute(sql`drop trigger fail_staff_audit on hostel_audit_log`);
      await fixture.connection.db.execute(sql`drop function fail_staff_audit()`);
    }
  },
);
it('ACC-006/NTF-002: real outbox failure also rolls back a staff transition and its audit', async () => {
  const scope = await scopeFixture(),
    owner = await token(scope.ownerId),
    manager = await token(scope.managerId);
  await fixture.connection.db.execute(
    sql`create function fail_staff_outbox() returns trigger language plpgsql as $$ begin raise exception 'fixture outbox failure'; end $$`,
  );
  await fixture.connection.db.execute(
    sql`create trigger fail_staff_outbox before insert on notification_outbox for each row execute function fail_staff_outbox()`,
  );
  try {
    expect((await request(path(scope, 'deactivate'), owner, {})).statusCode).toBe(500);
    const [assignment] = await fixture.connection.db
      .select()
      .from(managerAssignments)
      .where(eq(managerAssignments.id, scope.assignmentId));
    expect(assignment?.status).toBe('active');
    expect((await request('manage/branches/' + scope.branchA, manager)).statusCode).toBe(200);
    expect(
      await fixture.connection.db
        .select()
        .from(hostelAuditLog)
        .where(eq(hostelAuditLog.targetId, scope.assignmentId)),
    ).toEqual([]);
  } finally {
    await fixture.connection.db.execute(sql`drop trigger fail_staff_outbox on notification_outbox`);
    await fixture.connection.db.execute(sql`drop function fail_staff_outbox()`);
  }
});
it('SEC-001/MGR-004: simultaneous cross-owner manager revocation uses ordered real identity locks without deadlock', async () => {
  const a = await scopeFixture(),
    b = await scopeFixture();
  for (const [scope, ownerId] of [
    [a, b.managerId],
    [b, a.managerId],
  ] as const) {
    const [branch] = await fixture.connection.db
      .select()
      .from(branches)
      .where(eq(branches.id, scope.branchA));
    if (!branch) throw new Error('Branch fixture missing');
    await fixture.connection.db
      .update(organizations)
      .set({ ownerUserId: ownerId })
      .where(eq(organizations.id, branch.organizationId));
  }
  const actorA = await token(a.managerId),
    actorB = await token(b.managerId);
  const responses = await Promise.all([
    request(path(b, 'suspend'), actorA, { reason: 'Concurrent A' }),
    request(path(a, 'suspend'), actorB, { reason: 'Concurrent B' }),
  ]);
  expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 401]);
}, 30000);

it('ONB-001 SEC-001: real geography lists only active city/area choices and direct same-city sub-areas', async () => {
  const scope = await scopeFixture(),
    owner = await token(scope.ownerId),
    manager = await token(scope.managerId);
  const cityId = randomUUID(),
    otherCity = randomUUID(),
    inactiveCity = randomUUID();
  const areaId = randomUUID(),
    otherArea = randomUUID(),
    inactiveArea = randomUUID(),
    subId = randomUUID();
  await fixture.connection.db.insert(cities).values([
    { id: cityId, name: 'Active city', slug: cityId },
    { id: otherCity, name: 'Other city', slug: otherCity },
    { id: inactiveCity, name: 'Inactive city', slug: inactiveCity, isActive: false },
  ]);
  await fixture.connection.db.insert(areas).values([
    { id: areaId, cityId, name: 'Sector', slug: areaId, level: 'sector' },
    { id: otherArea, cityId: otherCity, name: 'Foreign area', slug: otherArea, level: 'area' },
    {
      id: inactiveArea,
      cityId,
      name: 'Inactive area',
      slug: inactiveArea,
      level: 'area',
      isActive: false,
    },
    { id: subId, cityId, parentId: areaId, name: 'Direct child', slug: subId, level: 'sub_area' },
  ]);
  const cityResponse = await request('owner/geography/cities?limit=100', owner);
  expect(cityResponse.statusCode).toBe(200);
  expect(cityResponse.json<{ data: { id: string }[] }>().data.map((row) => row.id)).toContain(
    cityId,
  );
  expect(cityResponse.json<{ data: { id: string }[] }>().data.map((row) => row.id)).not.toContain(
    inactiveCity,
  );
  const path = 'owner/geography/cities/' + cityId + '/areas';
  const list = await request(path, owner);
  expect(list.json()).toEqual({
    data: [{ id: areaId, name: 'Sector', cityId, parentId: null, level: 'sector' }],
    nextCursor: null,
  });
  expect(list.headers['cache-control']).toBe('no-store');
  expect((await request(path + '?parentId=' + areaId, owner)).json()).toEqual({
    data: [{ id: subId, name: 'Direct child', cityId, parentId: areaId, level: 'sub_area' }],
    nextCursor: null,
  });
  for (const parentId of [otherArea, inactiveArea, subId, randomUUID()])
    expect((await request(path + '?parentId=' + parentId, owner)).statusCode).toBe(404);
  expect(
    (await request('owner/geography/cities/' + inactiveCity + '/areas', owner)).statusCode,
  ).toBe(404);
  expect((await request(path, manager)).statusCode).toBe(403);
  await fixture.connection.db
    .update(users)
    .set({ accountStatus: 'suspended' })
    .where(eq(users.id, scope.ownerId));
  const suspended = await request(path, owner);
  expect(suspended.statusCode).toBe(403);
  expect(suspended.json()).toMatchObject({ code: 'ACCOUNT_SUSPENDED' });
});
