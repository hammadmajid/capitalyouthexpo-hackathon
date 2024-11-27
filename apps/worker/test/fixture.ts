import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { createDatabase } from '@hsm/db';
export async function workerFixture() {
  const containers: StartedTestContainer[] = [];
  let database: ReturnType<typeof createDatabase> | undefined;
  try {
    const password = randomBytes(24).toString('hex');
    const postgres = await new GenericContainer('postgis/postgis:17-3.5')
      .withEnvironment({
        POSTGRES_DB: 'worker_test',
        POSTGRES_USER: 'worker_test',
        POSTGRES_PASSWORD: password,
      })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
      .start();
    containers.push(postgres);
    database = createDatabase(
      'postgres://worker_test:' +
        password +
        '@' +
        postgres.getHost() +
        ':' +
        postgres.getMappedPort(5432) +
        '/worker_test',
    );
    await migrate(database.db, {
      migrationsFolder: fileURLToPath(new URL('../../../packages/db/migrations', import.meta.url)),
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
    return {
      database,
      redisUrl: 'redis://' + redis.getHost() + ':' + redis.getMappedPort(6379),
      smtpHost: mailpit.getHost(),
      smtpPort: mailpit.getMappedPort(1025),
      mailpitUrl: 'http://' + mailpit.getHost() + ':' + mailpit.getMappedPort(8025),
      async restoreDisposableBackup() {
        // AUD-015: only this isolated container and its synthetic test database.
        for (const command of [
          [
            'pg_dump',
            '-U',
            'worker_test',
            '-d',
            'worker_test',
            '-Fc',
            '-f',
            '/tmp/hsm-fixture.dump',
          ],
          ['createdb', '-U', 'worker_test', 'worker_restored'],
          [
            'pg_restore',
            '-U',
            'worker_test',
            '-d',
            'worker_restored',
            '--exit-on-error',
            '/tmp/hsm-fixture.dump',
          ],
        ]) {
          const result = await postgres.exec(command);
          if (result.exitCode !== 0) throw new Error('Disposable backup restore failed');
        }
        return createDatabase(
          'postgres://worker_test:' +
            password +
            '@' +
            postgres.getHost() +
            ':' +
            postgres.getMappedPort(5432) +
            '/worker_restored',
        );
      },
      async close() {
        await database?.close();
        for (const container of containers.reverse()) await container.stop();
      },
    };
  } catch (error) {
    await database?.close();
    for (const container of containers.reverse()) await container.stop();
    throw error;
  }
}
