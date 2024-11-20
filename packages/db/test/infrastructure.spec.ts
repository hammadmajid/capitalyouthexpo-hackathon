import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { verify } from 'argon2';
import { eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { z } from 'zod';
import {
  DockerComposeEnvironment,
  Wait,
  type StartedDockerComposeEnvironment,
} from 'testcontainers';
import { createDatabase } from '../src/index.js';
import { seedDatabase } from '../src/seed.js';
import { storageCredentials, verifyPrivateStorage } from './storage.fixture.js';
import {
  adminAccounts,
  areas,
  cities,
  places,
  platformAuditLog,
  users,
} from '../src/schema/index.js';

let environment: StartedDockerComposeEnvironment | undefined;
let connection: ReturnType<typeof createDatabase> | undefined;
const password = randomBytes(24).toString('hex');
const projectName = `hsm-ci-${randomBytes(8).toString('hex')}`;
const execute = promisify(execFile);
const seedInput = {
  ROOT_ADMIN_EMAIL: 'ci-root@example.invalid',
  ROOT_ADMIN_PASSWORD: randomBytes(24).toString('hex'),
};
const migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url));
const expectedMigrations = readMigrationFiles({ migrationsFolder }).map((migration) => ({
  hash: migration.hash,
  createdAt: String(migration.folderMillis),
}));
function appliedMigrationHistory(db: ReturnType<typeof createDatabase>['db']) {
  return db.execute<{ hash: string; createdAt: string }>(
    sql`select hash, created_at::text as "createdAt" from drizzle.__drizzle_migrations order by created_at, id`,
  );
}
function database() {
  if (!connection) throw new Error('Infrastructure database was not initialized');
  return connection.db;
}
function stack() {
  if (!environment) throw new Error('Compose stack was not initialized');
  return environment;
}
function connect(name: string) {
  const postgres = stack().getContainer('postgres-1');
  return createDatabase(
    `postgres://hsm_ci:${password}@${postgres.getHost()}:${postgres.getMappedPort(5432)}/${name}`,
  );
}

beforeAll(async () => {
  environment = await new DockerComposeEnvironment(
    fileURLToPath(new URL('../../../infra', import.meta.url)),
    'docker-compose.yml',
  )
    .withProjectName(projectName)
    .withEnvironment({
      POSTGRES_DB: 'hsm_ci',
      POSTGRES_USER: 'hsm_ci',
      POSTGRES_PASSWORD: password,
      S3_ACCESS_KEY_ID: storageCredentials.accessKeyId,
      S3_SECRET_ACCESS_KEY: storageCredentials.secretAccessKey,
      S3_PRIVATE_BUCKET: 'hsm-ci-private',
      POSTGRES_PORT: '0',
      REDIS_PORT: '0',
      SMTP_PORT: '0',
      MAILPIT_PORT: '0',
      STORAGE_PORT: '0',
      CLAMAV_PORT: '0',
      CLAMAV_NO_FRESHCLAMD: 'true',
    })
    .withWaitStrategy('postgres-1', Wait.forHealthCheck())
    .withWaitStrategy('redis-1', Wait.forHealthCheck())
    .withWaitStrategy('clamav-1', Wait.forHealthCheck())
    .withWaitStrategy('mailpit-1', Wait.forHttp('/', 8025))
    .withWaitStrategy('storage-1', Wait.forListeningPorts())
    .withStartupTimeout(180000)
    .up();
  connection = connect('hsm_ci');
  await migrate(database(), { migrationsFolder });
}, 300000);

afterAll(async () => {
  await connection?.close();
  await environment?.down({ removeVolumes: true });
});

it('Phase 1: replays every migration on a clean Compose database and reruns idempotently', async () => {
  const created = await stack()
    .getContainer('postgres-1')
    .exec(['createdb', '-U', 'hsm_ci', 'hsm_replay']);
  expect(created.exitCode).toBe(0);
  const replay = connect('hsm_replay');
  try {
    const before = await replay.db.execute<{ count: number }>(
      sql`select count(*)::int as count from information_schema.tables where table_schema = 'public' and table_name = 'users'`,
    );
    expect(before[0]?.count).toBe(0);
    const initialExtensions = await replay.db.execute<{ extname: string }>(
      sql`select extname from pg_extension where extname in ('postgis', 'citext', 'pg_trgm', 'pgcrypto')`,
    );
    expect(initialExtensions).toHaveLength(0);
    await migrate(replay.db, { migrationsFolder });
    const applied = await appliedMigrationHistory(replay.db);
    expect(applied).toEqual(expectedMigrations);
    await migrate(replay.db, { migrationsFolder });
    expect(await appliedMigrationHistory(replay.db)).toEqual(applied);
    const version = await replay.db.execute<{ version: string }>(
      sql`select current_setting('server_version') as version`,
    );
    expect(version[0]?.version).toMatch(/^17\./);
    const extensions = await replay.db.execute<{ extname: string }>(
      sql`select extname from pg_extension`,
    );
    expect(extensions.map((row) => row.extname)).toEqual(
      expect.arrayContaining(['postgis', 'citext', 'pg_trgm', 'pgcrypto']),
    );
  } finally {
    await replay.close();
  }
});

it('ADM-002/ACC-006: seed refuses unsafe bootstrap, rolls back, hashes credentials and repeats exactly', async () => {
  await expect(seedDatabase(database(), {})).rejects.toThrow();
  await database()
    .insert(users)
    .values({ fullName: 'Existing identity', email: 'existing@example.invalid' });
  await expect(
    seedDatabase(database(), { ...seedInput, ROOT_ADMIN_EMAIL: 'existing@example.invalid' }),
  ).rejects.toThrow('Root bootstrap is restricted');
  expect(await database().select().from(adminAccounts)).toHaveLength(0);
  expect(await database().select().from(cities)).toHaveLength(0);
  expect(await database().select().from(platformAuditLog)).toHaveLength(0);
  await seedDatabase(database(), seedInput);
  const [root] = await database()
    .select()
    .from(users)
    .where(eq(users.email, seedInput.ROOT_ADMIN_EMAIL));
  if (!root?.passwordHash) throw new Error('Seed root password hash is missing');
  expect(root.passwordHash).toMatch(/^\$argon2id\$/);
  expect(await verify(root.passwordHash, seedInput.ROOT_ADMIN_PASSWORD)).toBe(true);
  await seedDatabase(database(), seedInput);
  expect(await database().select().from(users).where(eq(users.id, root.id))).toEqual([root]);
  expect(await database().select().from(adminAccounts)).toMatchObject([
    { userId: root.id, isRoot: true, status: 'active' },
  ]);
  expect(await database().select().from(cities)).toHaveLength(2);
  expect(await database().select().from(areas)).toHaveLength(3);
  expect(await database().select().from(places)).toHaveLength(1);
  expect(await database().select().from(platformAuditLog)).toMatchObject([
    { action: 'admin.bootstrap', targetId: root.id },
  ]);
});

it('Phase 1: real Redis 7.4 accepts commands and performs atomic increments', async () => {
  const redis = stack().getContainer('redis-1');
  const ping = await redis.exec(['redis-cli', '--raw', 'PING']);
  expect(ping.exitCode).toBe(0);
  expect(ping.output.trim()).toBe('PONG');
  const version = await redis.exec(['redis-cli', '--raw', 'INFO', 'server']);
  expect(version.output).toMatch(/redis_version:7\.4\./);
  const results = await Promise.all([
    redis.exec(['redis-cli', '--raw', 'INCR', 'ci:counter']),
    redis.exec(['redis-cli', '--raw', 'INCR', 'ci:counter']),
  ]);
  expect(results.map((result) => result.exitCode)).toEqual([0, 0]);
  expect(results.map((result) => result.output.trim()).sort()).toEqual(['1', '2']);
});

it('Phase 1: Mailpit serves its inbox and the initialized storage bucket denies anonymous access', async () => {
  // Compose discovery lists running containers; inspect the one-shot job even if it already exited.
  await expect
    .poll(
      async () => {
        const { stdout: id } = await execute(
          'docker',
          [
            'ps',
            '--all',
            '--filter',
            `label=com.docker.compose.project=${projectName}`,
            '--filter',
            'label=com.docker.compose.service=storage-init',
            '--format',
            '{{.ID}}',
          ],
          { timeout: 10000 },
        );
        const { stdout } = await execute(
          'docker',
          ['inspect', '--format', '{{json .State}}', id.trim()],
          { timeout: 10000 },
        );
        const state = z
          .object({ Status: z.string(), ExitCode: z.number() })
          .parse(JSON.parse(stdout));
        if (state.Status === 'exited' && state.ExitCode !== 0) {
          const logs = await execute('docker', ['logs', id.trim()], { timeout: 10000 });
          throw new Error('Storage initialization failed: ' + logs.stdout + logs.stderr);
        }
        return state;
      },
      { timeout: 20000 },
    )
    .toMatchObject({ Status: 'exited', ExitCode: 0 });
  const mailpit = stack().getContainer('mailpit-1');
  const inbox = await fetch(`http://${mailpit.getHost()}:${mailpit.getMappedPort(8025)}/`);
  expect(inbox.status).toBe(200);
  const storage = stack().getContainer('storage-1');
  await verifyPrivateStorage(`http://${storage.getHost()}:${storage.getMappedPort(9000)}`);
});
