import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { createDatabase } from './index.js';
import { seedDatabase } from './seed.js';

async function main() {
  config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });
  const environment = z.object({ DATABASE_URL: z.string().url() }).parse(process.env);
  const connection = createDatabase(environment.DATABASE_URL);
  try {
    await seedDatabase(connection.db, process.env);
  } finally {
    await connection.close();
  }
}
// Never print raw driver errors: they can include SQL parameters and credentials.
await main().catch(() => {
  process.exitCode = 1;
});
