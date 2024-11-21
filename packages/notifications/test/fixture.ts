import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { createDatabase } from '@hsm/db';
export async function notificationFixture() {
  let container: StartedTestContainer | undefined;
  let database: ReturnType<typeof createDatabase> | undefined;
  const close = async () => {
    await database?.close();
    await container?.stop();
  };
  try {
    const password = randomBytes(24).toString('hex');
    container = await new GenericContainer('postgis/postgis:17-3.5')
      .withEnvironment({
        POSTGRES_DB: 'notifications_test',
        POSTGRES_USER: 'notifications_test',
        POSTGRES_PASSWORD: password,
      })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
      .start();
    database = createDatabase(
      'postgres://notifications_test:' +
        password +
        '@' +
        container.getHost() +
        ':' +
        container.getMappedPort(5432) +
        '/notifications_test',
    );
    await migrate(database.db, {
      migrationsFolder: fileURLToPath(new URL('../../db/migrations', import.meta.url)),
    });
    return { database, close };
  } catch (error) {
    await close();
    throw error;
  }
}
