import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { eq, sql } from 'drizzle-orm';
import { v7 } from 'uuid';
import { createDatabase } from '../src/index.js';
import { areas, brands, branches, cities, organizations, users } from '../src/schema/index.js';
let container: StartedTestContainer | undefined,
  connection: ReturnType<typeof createDatabase> | undefined;
function database() {
  if (!connection) throw new Error('Draft database unavailable');
  return connection.db;
}
beforeAll(async () => {
  const password = randomBytes(24).toString('hex');
  container = await new GenericContainer('postgis/postgis:17-3.5')
    .withEnvironment({
      POSTGRES_DB: 'drafts',
      POSTGRES_USER: 'drafts',
      POSTGRES_PASSWORD: password,
    })
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
    .start();
  connection = createDatabase(
    `postgres://drafts:${password}@${container.getHost()}:${container.getMappedPort(5432)}/drafts`,
  );
  await migrate(database(), {
    migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url)),
  });
});
afterAll(async () => {
  await connection?.close();
  await container?.stop();
});
async function scope() {
  const ownerId = v7(),
    organizationId = v7(),
    brandId = v7(),
    cityId = v7(),
    areaId = v7();
  await database().insert(users).values({ id: ownerId, fullName: 'Draft fixture owner' });
  await database()
    .insert(organizations)
    .values({ id: organizationId, ownerUserId: ownerId, name: 'Draft fixture organization' });
  await database()
    .insert(brands)
    .values({ id: brandId, organizationId, name: 'Draft fixture hostel' });
  await database().insert(cities).values({ id: cityId, name: 'Draft fixture city', slug: cityId });
  await database()
    .insert(areas)
    .values({ id: areaId, cityId, name: 'Draft fixture area', slug: areaId, level: 'area' });
  return { organizationId, brandId, cityId, areaId };
}
function draft(parent: Awaited<ReturnType<typeof scope>>) {
  return {
    organizationId: parent.organizationId,
    brandId: parent.brandId,
    name: 'Main branch',
    slug: v7(),
    isPrimary: true,
  };
}
function complete(parent: Awaited<ReturnType<typeof scope>>) {
  return {
    ...draft(parent),
    category: 'boys' as const,
    cityId: parent.cityId,
    areaId: parent.areaId,
    addressLine: 'Complete fixture address',
    location: 'SRID=4326;POINT(73.0479 33.6844)',
  };
}
it('OWN-001 CHG-006: real incomplete main-branch drafts persist without fabricated geography or address', async () => {
  const parent = await scope();
  const [row] = await database()
    .insert(branches)
    .values({ ...draft(parent), nearbyLandmark: 'Optional landmark' })
    .returning();
  expect(row).toMatchObject({
    verificationStatus: 'draft',
    isPrimary: true,
    cityId: null,
    areaId: null,
    category: null,
    addressLine: null,
    location: null,
    nearbyLandmark: 'Optional landmark',
  });
  expect(row?.firstApprovedAt).toBeNull();
});
it('OWN-001 SEC: draft saving permits city-only progress but rejects orphan or foreign geographic parents', async () => {
  const parent = await scope(),
    other = await scope();
  await database()
    .insert(branches)
    .values({ ...draft(parent), cityId: parent.cityId });
  for (const patch of [
    { cityId: null, areaId: parent.areaId },
    { subAreaId: parent.areaId },
    { cityId: parent.cityId, areaId: other.areaId },
  ])
    await expect(
      database()
        .insert(branches)
        .values({ ...draft(parent), isPrimary: false, ...patch }),
    ).rejects.toThrow();
});
it('SEC: incomplete branches cannot enter submitted, review, approved or suspended states in the real database', async () => {
  const parent = await scope();
  const [row] = await database().insert(branches).values(draft(parent)).returning();
  if (!row) throw new Error('Missing draft fixture');
  for (const status of ['submitted', 'under_review', 'approved', 'suspended'] as const)
    await expect(
      database()
        .update(branches)
        .set({ verificationStatus: status })
        .where(eq(branches.id, row.id)),
    ).rejects.toThrow();
  const [unchanged] = await database().select().from(branches).where(eq(branches.id, row.id));
  expect(unchanged?.verificationStatus).toBe('draft');
});
it('SEC: each required submission field remains protected against NULL and blank addresses', async () => {
  const parent = await scope();
  const [row] = await database()
    .insert(branches)
    .values({ ...complete(parent), verificationStatus: 'submitted' })
    .returning();
  if (!row) throw new Error('Missing submitted fixture');
  const changes: Partial<typeof branches.$inferInsert>[] = [
    { category: null },
    { cityId: null },
    { areaId: null },
    { addressLine: null },
    { addressLine: '   ' },
    { location: null },
    { name: '   ' },
  ];
  for (const patch of changes)
    await expect(
      database().update(branches).set(patch).where(eq(branches.id, row.id)),
    ).rejects.toThrow();
  expect(
    (await database().select().from(branches).where(eq(branches.id, row.id)))[0]
      ?.verificationStatus,
  ).toBe('submitted');
});
it('OWN-001: changes-requested and rejected branches can save incomplete corrections without implicit approval', async () => {
  for (const status of ['changes_requested', 'rejected'] as const) {
    const parent = await scope();
    const [row] = await database()
      .insert(branches)
      .values({ ...draft(parent), verificationStatus: status })
      .returning();
    expect(row).toMatchObject({
      verificationStatus: status,
      firstApprovedAt: null,
      location: null,
    });
  }
});
it('OWN-001 SEC: only one live main branch exists per hostel while archived primary history is retained', async () => {
  const parent = await scope();
  const [first] = await database().insert(branches).values(draft(parent)).returning();
  if (!first) throw new Error('Missing main fixture');
  await expect(database().insert(branches).values(draft(parent))).rejects.toThrow();
  await database()
    .insert(branches)
    .values({ ...draft(parent), isPrimary: false });
  await database()
    .update(branches)
    .set({ archivedAt: new Date() })
    .where(eq(branches.id, first.id));
  await database().insert(branches).values(draft(parent));
  const rows = await database().select().from(branches).where(eq(branches.brandId, parent.brandId));
  expect(rows).toHaveLength(3);
  expect(rows.filter((row) => row.isPrimary && !row.archivedAt)).toHaveLength(1);
  expect(rows.some((row) => row.id === first.id && row.archivedAt !== null)).toBe(true);
});
it('SEC: incomplete drafting preserves composite organization ownership constraints', async () => {
  const parent = await scope(),
    other = await scope();
  await expect(
    database()
      .insert(branches)
      .values({ ...draft(parent), organizationId: other.organizationId }),
  ).rejects.toThrow();
});
it('OWN-001: complete submitted branch retains authoritative PostGIS coordinates and optional landmark', async () => {
  const parent = await scope();
  const [row] = await database()
    .insert(branches)
    .values({
      ...complete(parent),
      verificationStatus: 'submitted',
      nearbyLandmark: 'Fixture landmark',
    })
    .returning();
  if (!row) throw new Error('Missing geography fixture');
  const [point] = await database().execute<{ longitude: number; latitude: number }>(
    sql`select ST_X(location::geometry) as longitude, ST_Y(location::geometry) as latitude from branches where id = ${row.id}`,
  );
  expect(point?.longitude).toBeCloseTo(73.0479);
  expect(point?.latitude).toBeCloseTo(33.6844);
  expect(row).toMatchObject({
    nearbyLandmark: 'Fixture landmark',
    verificationStatus: 'submitted',
    firstApprovedAt: null,
  });
});
