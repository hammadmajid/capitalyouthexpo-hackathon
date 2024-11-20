import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { eq, sql } from 'drizzle-orm';
import { createDatabase, type Database } from '../src/index.js';
import { seedDatabase } from '../src/seed.js';
import { adminAccounts, cities, users } from '../src/schema/index.js';

let container: StartedTestContainer | undefined;
let connection: ReturnType<typeof createDatabase> | undefined;
const environment = {
  ROOT_ADMIN_EMAIL: 'seed-failure@example.invalid',
  ROOT_ADMIN_PASSWORD: randomBytes(24).toString('hex'),
};

function database() {
  if (!connection) throw new Error('Integration database unavailable');
  return connection.db;
}

beforeAll(async () => {
  const password = randomBytes(24).toString('hex');
  container = await new GenericContainer('postgis/postgis:17-3.5')
    .withEnvironment({
      POSTGRES_DB: 'seed_test',
      POSTGRES_USER: 'seed_test',
      POSTGRES_PASSWORD: password,
    })
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
    .start();
  connection = createDatabase(
    `postgres://seed_test:${password}@${container.getHost()}:${container.getMappedPort(5432)}/seed_test`,
  );
  await migrate(database(), {
    migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url)),
  });
});

afterAll(async () => {
  await connection?.close();
  await container?.stop();
});

it('ADM-002 / ACC-006: a suppressed administrator insert aborts reference data and all authority grants', async () => {
  await expect(
    database().transaction(async (transaction) => {
      await transaction.execute(sql`create function seed_test_suppress_user() returns trigger
      language plpgsql as $$ begin return null; end; $$`);
      await transaction.execute(sql`create trigger seed_test_suppress_user before insert on users
      for each row execute function seed_test_suppress_user()`);
      await seedDatabase(transaction as unknown as Database, environment);
    }),
  ).rejects.toThrow('Root bootstrap failed');
  expect(await database().select().from(users)).toHaveLength(0);
  expect(await database().select().from(adminAccounts)).toHaveLength(0);
  expect(await database().select().from(cities)).toHaveLength(0);
});

it.each(['islamabad', 'rawalpindi'])(
  'ADM-002 / ACC-006: a missing %s reference aborts bootstrap without partial rows',
  async (slug) => {
    await expect(
      database().transaction(async (transaction) => {
        await transaction.execute(sql`create function seed_test_suppress_city() returns trigger
        language plpgsql as $$ begin
          if new.slug = TG_ARGV[0] then return null; end if;
          return new;
        end; $$`);
        if (slug === 'islamabad')
          await transaction.execute(sql`create trigger seed_test_suppress_city before insert on cities
          for each row execute function seed_test_suppress_city('islamabad')`);
        else
          await transaction.execute(sql`create trigger seed_test_suppress_city before insert on cities
          for each row execute function seed_test_suppress_city('rawalpindi')`);
        await seedDatabase(transaction as unknown as Database, environment);
      }),
    ).rejects.toThrow('Reference city seed failed');
    expect(await database().select().from(cities)).toHaveLength(0);
    expect(await database().select().from(users)).toHaveLength(0);
    expect(await database().select().from(adminAccounts)).toHaveLength(0);
  },
);

it('ADM-002: bootstrap refuses to elevate an existing unrelated identity on an unprovisioned platform', async () => {
  const [existing] = await database()
    .insert(users)
    .values({ fullName: 'Existing identity', email: environment.ROOT_ADMIN_EMAIL })
    .returning();
  await expect(seedDatabase(database(), environment)).rejects.toThrow(
    'Root bootstrap is restricted to a new identity on an unprovisioned platform',
  );
  expect(await database().select().from(adminAccounts)).toHaveLength(0);
  expect(
    await database().select().from(users).where(eq(users.email, environment.ROOT_ADMIN_EMAIL)),
  ).toEqual([existing]);
  expect(await database().select().from(cities)).toHaveLength(0);
});
