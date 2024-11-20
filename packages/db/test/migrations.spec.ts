import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { eq, sql } from 'drizzle-orm';
import { v7 } from 'uuid';
import { createDatabase } from '../src/index.js';
import { seedDatabase } from '../src/seed.js';
import {
  adminAccounts,
  areas,
  brands,
  branches,
  cities,
  emailOtps,
  hostelAuditLog,
  managerAssignments,
  organizations,
  platformAuditLog,
  users,
} from '../src/schema/index.js';

let container: StartedTestContainer | undefined;
let connection: ReturnType<typeof createDatabase> | undefined;
const migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url));
function database() {
  if (!connection) throw new Error('Integration database was not initialized');
  return connection.db;
}
beforeAll(async () => {
  const password = randomBytes(24).toString('hex');
  container = await new GenericContainer('postgis/postgis:17-3.5')
    .withEnvironment({
      POSTGRES_DB: 'hsm_test',
      POSTGRES_USER: 'hsm_test',
      POSTGRES_PASSWORD: password,
    })
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
    .start();
  connection = createDatabase(
    `postgres://hsm_test:${password}@${container.getHost()}:${container.getMappedPort(5432)}/hsm_test`,
  );
  await migrate(database(), { migrationsFolder });
});
afterAll(async () => {
  await connection?.close();
  await container?.stop();
});

async function person() {
  const [user] = await database()
    .insert(users)
    .values({ fullName: 'Integration Person' })
    .returning();
  if (!user) throw new Error('Fixture user failed');
  return user;
}
async function branchFixture() {
  const owner = await person();
  const [city] = await database()
    .insert(cities)
    .values({ name: 'Test city', slug: v7() })
    .returning();
  if (!city) throw new Error('Fixture city failed');
  const [area] = await database()
    .insert(areas)
    .values({ cityId: city.id, level: 'area', name: 'Test area', slug: v7() })
    .returning();
  const [organization] = await database()
    .insert(organizations)
    .values({ ownerUserId: owner.id, name: 'Test organization' })
    .returning();
  if (!area || !organization) throw new Error('Fixture scope failed');
  const [brand] = await database()
    .insert(brands)
    .values({ organizationId: organization.id, name: 'Test brand' })
    .returning();
  if (!brand) throw new Error('Fixture brand failed');
  const values = {
    organizationId: organization.id,
    brandId: brand.id,
    cityId: city.id,
    areaId: area.id,
    name: 'Test branch',
    category: 'boys' as const,
    addressLine: 'Development fixture',
    location: 'SRID=4326;POINT(73 33)',
  };
  const [branchA, branchB] = await database()
    .insert(branches)
    .values([
      { ...values, slug: v7() },
      { ...values, slug: v7() },
    ])
    .returning();
  if (!branchA || !branchB) throw new Error('Fixture branches failed');
  return { owner, organization, brand, city, area, branchA, branchB };
}

describe('Phase 1 generated migrations: real PostgreSQL 17/PostGIS', () => {
  it('enables all required extensions and can reapply migrations without changes', async () => {
    const extensions = await database().execute<{ extname: string }>(
      sql`select extname from pg_extension`,
    );
    expect(extensions.map((row) => row.extname)).toEqual(
      expect.arrayContaining(['postgis', 'citext', 'pg_trgm', 'pgcrypto']),
    );
    await migrate(database(), { migrationsFolder });
  });
  it('AUTH-C-004: citext identity uniqueness is case insensitive', async () => {
    const email = `${v7()}@example.invalid`;
    await database().insert(users).values({ fullName: 'Identity fixture', email });
    await expect(
      database().insert(users).values({ fullName: 'Duplicate', email: email.toUpperCase() }),
    ).rejects.toThrow();
  });
  it('BR-04: concurrent appointments permit exactly one live branch per manager', async () => {
    const { owner, branchA, branchB } = await branchFixture();
    const manager = await person();
    const results = await Promise.allSettled(
      [branchA, branchB].map((branch) =>
        database().insert(managerAssignments).values({
          userId: manager.id,
          branchId: branch.id,
          appointedByUserId: owner.id,
          status: 'active',
        }),
      ),
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    await database()
      .update(managerAssignments)
      .set({ status: 'suspended' })
      .where(eq(managerAssignments.userId, manager.id));
    await expect(
      database()
        .insert(managerAssignments)
        .values({ userId: manager.id, branchId: branchB.id, appointedByUserId: owner.id }),
    ).rejects.toThrow();
    await database()
      .update(managerAssignments)
      .set({ status: 'deactivated' })
      .where(eq(managerAssignments.userId, manager.id));
    await database()
      .insert(managerAssignments)
      .values({ userId: manager.id, branchId: branchB.id, appointedByUserId: owner.id });
  });
  it('SEC-001: a branch cannot reference a brand from another organization', async () => {
    const first = await branchFixture();
    const second = await branchFixture();
    await expect(
      database().insert(branches).values({
        organizationId: first.organization.id,
        brandId: second.brand.id,
        cityId: first.city.id,
        areaId: first.area.id,
        name: 'Invalid scope',
        slug: v7(),
        category: 'boys',
        addressLine: 'Fixture',
        location: 'SRID=4326;POINT(73 33)',
      }),
    ).rejects.toThrow();
  });
  it('ADR 0002: OTP attempts cannot exceed five', async () => {
    await expect(
      database()
        .insert(emailOtps)
        .values({
          email: 'test@example.invalid',
          purpose: 'signup_verify',
          codeHash: 'hashed-fixture',
          attempts: 6,
          expiresAt: new Date('2030-01-01T00:00:00Z'),
        }),
    ).rejects.toThrow();
  });
  it('ACC-006: privileged mutation and audit roll back together', async () => {
    const { owner, organization, branchA } = await branchFixture();
    const targetId = v7();
    await expect(
      database().transaction(async (transaction) => {
        await transaction
          .update(branches)
          .set({ name: 'Rolled back' })
          .where(eq(branches.id, branchA.id));
        await transaction.insert(hostelAuditLog).values({
          organizationId: organization.id,
          branchId: branchA.id,
          actorUserId: owner.id,
          actorRole: 'owner',
          action: 'branch.rename',
          targetType: 'branch',
          targetId,
        });
        throw new Error('Intentional rollback');
      }),
    ).rejects.toThrow('Intentional rollback');
    const branch = await database().select().from(branches).where(eq(branches.id, branchA.id));
    expect(branch[0]?.name).toBe('Test branch');
    expect(
      await database().select().from(hostelAuditLog).where(eq(hostelAuditLog.targetId, targetId)),
    ).toHaveLength(0);
  });
  it('AUD-001/004: audit tables reject updates and deletes', async () => {
    const [entry] = await database()
      .insert(platformAuditLog)
      .values({ actorRole: 'system', action: 'fixture.audit', targetType: 'user', targetId: v7() })
      .returning();
    if (!entry) throw new Error('Audit fixture failed');
    await expect(
      database()
        .update(platformAuditLog)
        .set({ action: 'tampered' })
        .where(eq(platformAuditLog.id, entry.id)),
    ).rejects.toThrow();
    await expect(
      database().delete(platformAuditLog).where(eq(platformAuditLog.id, entry.id)),
    ).rejects.toThrow();
  });
  it('ADM-002: root seed is idempotent and never elevates an unrelated existing identity', async () => {
    const environment = {
      ROOT_ADMIN_EMAIL: 'bootstrap@example.invalid',
      ROOT_ADMIN_PASSWORD: 'test-only-bootstrap-password',
    };
    await seedDatabase(database(), environment);
    await seedDatabase(database(), environment);
    const roots = await database()
      .select()
      .from(adminAccounts)
      .where(eq(adminAccounts.isRoot, true));
    expect(roots).toHaveLength(1);
    await expect(
      seedDatabase(database(), { ...environment, ROOT_ADMIN_EMAIL: 'another@example.invalid' }),
    ).rejects.toThrow();
  });
  it('ADM-001: database rejects removing the final active root', async () => {
    await seedDatabase(database(), {
      ROOT_ADMIN_EMAIL: 'bootstrap@example.invalid',
      ROOT_ADMIN_PASSWORD: 'test-only-bootstrap-password',
    });
    const roots = await database()
      .select()
      .from(adminAccounts)
      .where(eq(adminAccounts.isRoot, true));
    const root = roots[0];
    if (!root) throw new Error('Root fixture failed');
    await expect(
      database().delete(adminAccounts).where(eq(adminAccounts.userId, root.userId)),
    ).rejects.toThrow();
  });
  it('ADM-001: database rejects a fourth active root', async () => {
    const extra = await Promise.all([person(), person(), person()]);
    const [second, third, fourth] = extra;
    if (!second || !third || !fourth) throw new Error('Root fixtures failed');
    await database()
      .insert(adminAccounts)
      .values([
        { userId: second.id, isRoot: true, status: 'active' },
        { userId: third.id, isRoot: true, status: 'active' },
      ]);
    await expect(
      database()
        .insert(adminAccounts)
        .values({ userId: fourth.id, isRoot: true, status: 'active' }),
    ).rejects.toThrow();
    await database()
      .update(adminAccounts)
      .set({ status: 'deactivated' })
      .where(eq(adminAccounts.userId, second.id));
    await database()
      .update(adminAccounts)
      .set({ status: 'deactivated' })
      .where(eq(adminAccounts.userId, third.id));
  });
});
