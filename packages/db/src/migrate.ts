import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { z } from 'zod';
import { createDatabase } from './index.js';
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });
const environment = z.object({ DATABASE_URL: z.string().url() }).parse(process.env);
const connection = createDatabase(environment.DATABASE_URL);
try {
  await migrate(connection.db, {
    migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url)),
  });
} finally {
  await connection.close();
}
