import { storageStack } from './storage-fixture.js';
import { randomBytes } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { createDatabase } from '@hsm/db';
import { envelopeKey } from '@hsm/security/envelope';
import { setTimeout as delay } from 'node:timers/promises';
async function availablePort() {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test port missing');
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}
async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
    }, 5000);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
    child.kill('SIGTERM');
  });
}
export async function authStack(
  webOrigin = 'http://localhost:3000',
  apiOverrides: Record<string, string> = {},
) {
  const containers: StartedTestContainer[] = [];
  const children: ChildProcess[] = [];
  let database: ReturnType<typeof createDatabase> | undefined;
  let storage: Awaited<ReturnType<typeof storageStack>> | undefined;
  const close = async () => {
    for (const child of children.reverse()) await stop(child);
    storage?.close();
    await database?.close();
    for (const container of containers.reverse()) await container.stop();
  };
  try {
    const password = randomBytes(24).toString('hex');
    const postgres = await new GenericContainer('postgis/postgis:17-3.5')
      .withEnvironment({
        POSTGRES_DB: 'stack_test',
        POSTGRES_USER: 'stack_test',
        POSTGRES_PASSWORD: password,
      })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
      .start();
    containers.push(postgres);
    const databaseUrl =
      'postgres://stack_test:' +
      password +
      '@' +
      postgres.getHost() +
      ':' +
      postgres.getMappedPort(5432) +
      '/stack_test';
    database = createDatabase(databaseUrl);
    await migrate(database.db, {
      migrationsFolder: fileURLToPath(new URL('../../db/migrations', import.meta.url)),
    });
    const redis = await new GenericContainer('redis:7.4-alpine')
      .withExposedPorts(6379)
      .withWaitStrategy(Wait.forLogMessage('Ready to accept connections'))
      .start();
    containers.push(redis);
    const mailpit = await new GenericContainer('axllent/mailpit:v1.27')
      .withExposedPorts(1025, 8025)
      .withWaitStrategy(Wait.forHttp('/api/v1/info', 8025))
      .start();
    containers.push(mailpit);
    storage = await storageStack(containers, webOrigin);
    const port = await availablePort();
    const master = randomBytes(32);
    const env = {
      ...process.env,
      ...storage.env,
      NODE_ENV: 'test',
      APP_ENV: 'test',
      DATABASE_URL: databaseUrl,
      REDIS_URL: 'redis://' + redis.getHost() + ':' + redis.getMappedPort(6379),
      API_HOST: '127.0.0.1',
      API_PORT: String(port),
      CORS_ORIGINS: webOrigin,
      JWT_SECRET: randomBytes(48).toString('hex'),
      CNIC_HASH_KEY: randomBytes(32).toString('hex'),
      CNIC_ENCRYPTION_KEY: master.toString('hex'),
      EMAIL_ENVELOPE_KEY: envelopeKey(master, 'email').toString('hex'),
      SMTP_HOST: mailpit.getHost(),
      SMTP_PORT: String(mailpit.getMappedPort(1025)),
      SMTP_FROM: 'no-reply@example.test',
      SMTP_SECURE: 'false',
      SMTP_REQUIRE_TLS: 'false',
      SMTP_USER: '',
      SMTP_PASSWORD: '',
      LOG_LEVEL: 'silent',
      ...apiOverrides,
    };
    const workerEnv = {
      ...storage.env,
      NODE_ENV: env.NODE_ENV,
      APP_ENV: env.APP_ENV,
      DATABASE_URL: env.DATABASE_URL,
      REDIS_URL: env.REDIS_URL,
      EMAIL_ENVELOPE_KEY: env.EMAIL_ENVELOPE_KEY,
      SMTP_HOST: env.SMTP_HOST,
      SMTP_PORT: env.SMTP_PORT,
      SMTP_FROM: env.SMTP_FROM,
      SMTP_SECURE: env.SMTP_SECURE,
      SMTP_REQUIRE_TLS: env.SMTP_REQUIRE_TLS,
      SMTP_USER: '',
      SMTP_PASSWORD: '',
      LOG_LEVEL: 'silent',
    };
    const launch = (entry: string, isWorker = false) => {
      const child = spawn(process.execPath, [fileURLToPath(new URL(entry, import.meta.url))], {
        env: isWorker ? workerEnv : env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      children.push(child);
      // Keep process diagnostics in memory only; never emit env, addresses or OTP payloads.
      child.stdout?.on('data', () => undefined);
      child.stderr?.on('data', () => undefined);
      return child;
    };
    // Worker readiness is verified by delivered messages; silent logging is intentional.
    const worker = launch('../../../apps/worker/dist/main.js', true);
    const api = launch('../../../apps/api/dist/main.js');
    const apiUrl = 'http://127.0.0.1:' + port + '/v1';
    // Process boot budget on the 8 GB acceptance laptop; readiness still requires a healthy API.
    const deadline = Date.now() + 60000;
    let ready = false;
    while (Date.now() < deadline) {
      if (api.exitCode !== null || worker.exitCode !== null)
        throw new Error('Application process exited before readiness');
      try {
        ready =
          (await fetch(apiUrl + '/health/ready', { signal: AbortSignal.timeout(2000) })).status ===
          200;
      } catch {
        ready = false;
      }
      if (ready) break;
      await delay(200);
    }
    if (!ready) throw new Error('Application readiness deadline exceeded');
    return {
      database,
      storage,
      apiUrl,
      mailpitUrl: 'http://' + mailpit.getHost() + ':' + mailpit.getMappedPort(8025),
      close,
      processes: () => ({ api: api.exitCode, worker: worker.exitCode }),
    };
  } catch (error) {
    await close();
    throw error;
  }
}

export { managementFixture } from './management-fixture.js';
export { publishInventoryPhotos } from './inventory-photos.js';
export { containerizedStack } from './container-fixture.js';

export { objectStorageStack, storageStack } from './storage-fixture.js';
