import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  areas,
  brands,
  branches,
  cities,
  organizations,
  adminAccounts,
  adminRoleGrants,
  customerProfiles,
  platformAuditLog,
  users,
} from '@hsm/db';
import { PlatformInsightsService } from '../../src/admin/platform-insights.service.js';
import { AuthCrypto } from '../../src/auth/crypto.js';
import { testKeys } from '../keys.js';
import { authFixture } from './auth-fixture.js';
let f: Awaited<ReturnType<typeof authFixture>>;
let rootHeader: string, normalHeader: string;
const root = randomUUID(),
  normal = randomUUID(),
  now = new Date('2026-10-30T06:00:00.000Z');
beforeAll(async () => {
  f = await authFixture(new AuthCrypto(testKeys()), now, {}, [], (db) => ({
    platformInsights: new PlatformInsightsService(db, () => now),
  }));
  await f.connection.db.insert(users).values([
    { id: root, fullName: 'Root aggregate fixture', createdAt: now },
    { id: normal, fullName: 'Moderator aggregate fixture', createdAt: now },
    ...Array.from({ length: 205 }, (_, n) => ({
      id: randomUUID(),
      fullName: 'Aggregate fixture ' + n,
      createdAt: new Date('2026-09-30T19:00:00.000Z'),
    })),
  ]);
  await f.connection.db.insert(adminAccounts).values([
    { userId: root, isRoot: true, status: 'active' },
    { userId: normal, isRoot: false, status: 'active' },
  ]);
  await f.connection.db
    .insert(adminRoleGrants)
    .values({ adminUserId: normal, role: 'content_moderator', grantedByUserId: root });
  await f.connection.db.insert(customerProfiles).values({ userId: normal });
  await f.connection.db.insert(platformAuditLog).values(
    Array.from({ length: 205 }, (_, n) => ({
      actorUserId: root,
      actorRole: 'root',
      action: n % 2 ? 'fixture.other' : 'fixture.counted',
      targetType: 'user',
      targetId: normal,
      before: { secret: 'must-not-be-disclosed' },
      after: { email: 'private@example.test' },
      createdAt: now,
    })),
  );
  rootHeader = 'Bearer ' + (await f.service.issue(root, 'mobile')).accessToken;
  normalHeader = 'Bearer ' + (await f.service.issue(normal, 'mobile')).accessToken;
});
afterAll(async () => {
  await f?.close();
});
it('RPT-003 SEC-003: real SQL aggregates exceed list caps and distinguish Karachi window from current snapshot', async () => {
  const response = await f.application.inject({
    url: '/v1/admin/overview?from=2026-10-01&to=2026-10-01',
    headers: { authorization: rootHeader },
  });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toMatchObject({
    snapshot: { users: 207, customers: 1, owners: 0, activeBranches: 0 },
    window: {
      registeredUsers: 205,
      bookingRequests: 0,
      respondedRequests: 0,
      averageResponseHours: null,
    },
    coverage: {
      listingViews: 'not_collected',
      searches: 'not_collected',
      commercialRetention: 'deferred',
    },
  });
  const empty = await f.application.inject({
    url: '/v1/admin/overview?from=2026-09-01&to=2026-09-30',
    headers: { authorization: rootHeader },
  });
  expect(empty.statusCode).toBe(200);
  expect(empty.json().window.registeredUsers).toBe(0);
});
it('AUD-001: real stable timestamp ties paginate every matching row without duplicates or raw private JSON', async () => {
  const ids: string[] = [];
  let cursor: string | undefined;
  do {
    const response = await f.application.inject({
      url:
        '/v1/admin/audit-log?action=fixture.counted&limit=20' +
        (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''),
      headers: { authorization: rootHeader },
    });
    expect(response.statusCode).toBe(200);
    const page = response.json();
    ids.push(...page.data.map((row: { id: string }) => row.id));
    cursor = page.nextCursor ?? undefined;
    expect(response.body).not.toContain('must-not-be-disclosed');
    expect(response.body).not.toContain('private@example.test');
  } while (cursor);
  expect(ids).toHaveLength(103);
  expect(new Set(ids).size).toBe(103);
  for (let n = 1; n < ids.length; n++)
    expect(BigInt(required(ids[n - 1]))).toBeGreaterThan(BigInt(required(ids[n])));
});
it('SEC-001 AUD-001: real Normal moderator cannot read Root metrics, audit or export', async () => {
  for (const path of [
    '/v1/admin/overview?from=2026-10-01&to=2026-10-30',
    '/v1/admin/audit-log',
    '/v1/admin/audit-log/export',
  ]) {
    expect(
      (await f.application.inject({ url: path, headers: { authorization: normalHeader } }))
        .statusCode,
    ).toBe(403);
  }
});
it('AUD-001 RPT-001: actual metadata CSV export is audited without exposing private payloads', async () => {
  const response = await f.application.inject({
    url: '/v1/admin/audit-log/export?action=fixture.counted',
    headers: { authorization: rootHeader },
  });
  expect(response.statusCode).toBe(200);
  expect(response.headers['content-type']).toContain('text/csv');
  expect(response.headers['x-hsm-report-truncated']).toBe('false');
  expect(response.body.split('\r\n')).toHaveLength(105);
  expect(response.body).not.toContain('must-not-be-disclosed');
  const events = await f.connection.db
    .select()
    .from(platformAuditLog)
    .where(eq(platformAuditLog.action, 'audit.exported'));
  expect(events).toHaveLength(1);
  expect(events[0]?.after).toMatchObject({ rows: 103, truncated: false });
});

it('RPT-003: published totals use marketplace visibility including active city and unarchived brand', async () => {
  const db = f.connection.db,
    org = randomUUID(),
    liveBrand = randomUUID(),
    oldBrand = randomUUID(),
    liveCity = randomUUID(),
    oldCity = randomUUID(),
    liveArea = randomUUID(),
    oldArea = randomUUID();
  await db
    .insert(organizations)
    .values({ id: org, ownerUserId: root, name: 'Disposable metrics organization' });
  await db.insert(brands).values([
    { id: liveBrand, organizationId: org, name: 'Live brand' },
    { id: oldBrand, organizationId: org, name: 'Archived brand', archivedAt: now },
  ]);
  await db.insert(cities).values([
    { id: liveCity, name: 'Live metrics city', slug: liveCity },
    { id: oldCity, name: 'Inactive metrics city', slug: oldCity, isActive: false },
  ]);
  await db.insert(areas).values([
    { id: liveArea, cityId: liveCity, level: 'area', name: 'Live metrics area', slug: liveArea },
    { id: oldArea, cityId: oldCity, level: 'area', name: 'Old metrics area', slug: oldArea },
  ]);
  await db.insert(branches).values(
    [
      [liveBrand, liveCity],
      [liveBrand, oldCity],
      [oldBrand, liveCity],
    ].map(([brandId, cityId]) => ({
      organizationId: org,
      brandId: brandId ?? liveBrand,
      cityId: cityId ?? liveCity,
      name: 'Disposable metric branch',
      category: 'boys' as const,
      addressLine: 'Disposable public address',
      location: 'SRID=4326;POINT(73 33.7)',
      areaId: cityId === oldCity ? oldArea : liveArea,
      slug: randomUUID(),
      verificationStatus: 'approved' as const,
    })),
  );
  const response = await f.application.inject({
    url: '/v1/admin/overview?from=2026-10-01&to=2026-10-01',
    headers: { authorization: rootHeader },
  });
  expect(response.statusCode).toBe(200);
  expect(response.json().snapshot.publishedListings).toBe(1);
  expect(response.json().snapshot.activeBranches).toBe(2);
});

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Missing test fixture value');
  return value;
}
