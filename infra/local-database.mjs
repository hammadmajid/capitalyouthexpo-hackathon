import { readFileSync } from 'node:fs';
import { migrationHashMatches } from '../packages/db/dist/migration-integrity.js';
import { createRequire } from 'node:module';
import { parseEnv } from 'node:util';
import { createDatabase } from '../packages/db/dist/index.js';

const require = createRequire(new URL('../packages/db/package.json', import.meta.url));
const { sql } = require('drizzle-orm');
const root = new URL('../', import.meta.url);
const environment = parseEnv(readFileSync(new URL('.env', root), 'utf8'));
const url = new URL(environment.DATABASE_URL);
if (!['localhost', '127.0.0.1'].includes(url.hostname) || environment.APP_ENV !== 'development')
  throw new Error('Local development database required');
const connection = createDatabase(environment.DATABASE_URL);
try {
  const journal = JSON.parse(
    readFileSync(new URL('../packages/db/migrations/meta/_journal.json', import.meta.url), 'utf8'),
  );
  const extensions = await connection.db.execute(
    sql`select extname from pg_extension order by extname`,
  );
  const tables = await connection.db.execute(
    sql`select count(*)::int as count from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' and table_name <> 'spatial_ref_sys'`,
  );
  const metadata = await connection.db.execute(
    sql`select to_regclass('drizzle.__drizzle_migrations') as relation`,
  );
  let applied = [];
  if (metadata[0].relation)
    applied = await connection.db.execute(
      sql`select hash, created_at from drizzle.__drizzle_migrations order by created_at`,
    );
  for (const [index, migration] of applied.entries()) {
    const entry = journal.entries[index];
    if (!entry) throw new Error('Database migration history is ahead of local source');
    const content = readFileSync(
      new URL('../packages/db/migrations/' + entry.tag + '.sql', import.meta.url),
    );
    if (
      !migrationHashMatches(content, migration.hash) ||
      Number(migration.created_at) !== entry.when
    )
      throw new Error('Migration history mismatch');
  }
  const names = extensions.map((entry) => entry.extname);
  if (!['postgis', 'citext', 'pg_trgm', 'pgcrypto'].every((name) => names.includes(name)))
    throw new Error('Required extensions missing');
  const users = await connection.db.execute(sql`select to_regclass('public.users') as relation`);
  let userCount = 0;
  if (users[0].relation) {
    const rows = await connection.db.execute(sql`select count(*)::int as count from users`);
    userCount = rows[0].count;
  }
  process.stdout.write(
    JSON.stringify({
      extensions: names,
      applicationTables: tables[0].count,
      appliedMigrations: applied.length,
      pendingMigrations: journal.entries.length - applied.length,
      migrationHashesMatch: true,
      migrationHashVerification: 'exact-or-line-endings',
      users: userCount,
      freshBeforeMigrations: tables[0].count === 0 && applied.length === 0,
    }) + '\n',
  );
} catch {
  process.stderr.write('Local database verification failed; no data changed.\n');
  process.exitCode = 1;
} finally {
  await connection.close();
}
