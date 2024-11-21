import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { createDatabase } from '@hsm/db';
import { envelopeKey } from '@hsm/security/envelope';
import { storageStack } from './storage-fixture.js';
async function port() {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test port unavailable');
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}
// Linux host networking lets application containers use the same ephemeral
// infrastructure endpoints as the test driver and private signed upload URLs.
// There is deliberately no host-process fallback.
export async function containerizedStack(image: string) {
  if (!/^hsm-phase1-ci:[a-zA-Z0-9_.-]+$/.test(image))
    throw new Error('Expected a locally built Phase 1 application image');
  const containers: StartedTestContainer[] = [];
  let database: ReturnType<typeof createDatabase> | undefined;
  let storage: Awaited<ReturnType<typeof storageStack>> | undefined;
  const close = async () => {
    for (const container of [...containers].reverse()) await container.stop();
    storage?.close();
    await database?.close();
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
    storage = await storageStack(containers);
    const apiPort = await port(),
      webPort = await port();
    const apiOrigin = 'http://127.0.0.1:' + apiPort;
    const webOrigin = 'http://127.0.0.1:' + webPort;
    const master = randomBytes(32);
    const infrastructure = {
      ...storage.env,
      NODE_ENV: 'test',
      APP_ENV: 'test',
      DATABASE_URL: databaseUrl,
      REDIS_URL: 'redis://' + redis.getHost() + ':' + redis.getMappedPort(6379),
      EMAIL_ENVELOPE_KEY: envelopeKey(master, 'email').toString('hex'),
      SMTP_HOST: mailpit.getHost(),
      SMTP_PORT: String(mailpit.getMappedPort(1025)),
      SMTP_FROM: 'no-reply@example.test',
      SMTP_SECURE: 'false',
      SMTP_REQUIRE_TLS: 'false',
      SMTP_USER: '',
      SMTP_PASSWORD: '',
      LOG_LEVEL: 'silent',
    };
    const start = async (entry: string, env: Record<string, string>, healthUrl?: string) => {
      let candidate = new GenericContainer(image)
        .withNetworkMode('host')
        .withEnvironment(env)
        .withCommand(['node', entry]);
      if (healthUrl)
        candidate = candidate
          .withHealthCheck({
            test: [
              'CMD',
              'node',
              '-e',
              `fetch(${JSON.stringify(healthUrl)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))`,
            ],
            interval: 500,
            timeout: 2000,
            retries: 40,
          })
          .withWaitStrategy(Wait.forHealthCheck())
          .withStartupTimeout(20000);
      const container = await candidate.start();
      containers.push(container);
      return container;
    };
    const worker = await start('apps/worker/dist/main.js', infrastructure);
    const api = await start(
      'apps/api/dist/main.js',
      {
        ...infrastructure,
        API_HOST: '127.0.0.1',
        API_PORT: String(apiPort),
        CORS_ORIGINS: webOrigin,
        JWT_SECRET: randomBytes(48).toString('hex'),
        CNIC_HASH_KEY: randomBytes(32).toString('hex'),
        CNIC_ENCRYPTION_KEY: master.toString('hex'),
      },
      apiOrigin + '/v1/health/ready',
    );
    const web = await start(
      'apps/web/.next/standalone/apps/web/server.js',
      {
        NODE_ENV: 'production',
        APP_ENV: 'test',
        API_ORIGIN: apiOrigin,
        WEB_ORIGIN: webOrigin,
        WEB_UPLOAD_ORIGIN: new URL(storage.env.S3_ENDPOINT).origin,
        HOSTNAME: '127.0.0.1',
        PORT: String(webPort),
      },
      webOrigin,
    );
    return {
      database,
      storage,
      apiUrl: apiOrigin + '/v1',
      webOrigin,
      mailpitUrl: 'http://' + mailpit.getHost() + ':' + mailpit.getMappedPort(8025),
      applications: { api, worker, web },
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
