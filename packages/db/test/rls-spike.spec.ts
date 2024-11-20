import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
let container: StartedTestContainer | undefined;
let client: ReturnType<typeof postgres> | undefined;
let database: ReturnType<typeof drizzle>;
const branchA = randomUUID();
const branchB = randomUUID();
beforeAll(async () => {
  const password = randomBytes(24).toString('hex');
  container = await new GenericContainer('postgis/postgis:17-3.5')
    .withEnvironment({
      POSTGRES_DB: 'rls_spike',
      POSTGRES_USER: 'rls_owner',
      POSTGRES_PASSWORD: password,
    })
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
    .start();
  client = postgres(
    'postgres://rls_owner:' +
      password +
      '@' +
      container.getHost() +
      ':' +
      container.getMappedPort(5432) +
      '/rls_spike',
    { max: 1, onnotice: () => undefined },
  );
  database = drizzle(client);
  await database.execute(sql`create role hsm_rls_reader nologin nosuperuser nobypassrls`);
  await database.execute(sql`create role hsm_rls_table_owner nologin nosuperuser nobypassrls`);
  await database.execute(sql`create schema rls_spike`);
  await database.execute(sql`grant usage, create on schema rls_spike to hsm_rls_table_owner`);
  await database.execute(sql`create table rls_spike.resources (branch_id uuid primary key)`);
  await database.execute(sql`insert into rls_spike.resources values (${branchA}), (${branchB})`);
  await database.execute(sql`grant usage on schema rls_spike to hsm_rls_reader`);
  await database.execute(sql`grant select on rls_spike.resources to hsm_rls_reader`);
  await database.execute(sql`alter table rls_spike.resources owner to hsm_rls_table_owner`);
  await database.execute(sql`alter table rls_spike.resources enable row level security`);
  await database.execute(
    sql`create policy branch_scope on rls_spike.resources for select to hsm_rls_reader using (branch_id::text = current_setting('hsm.branch_id', true))`,
  );
});
afterAll(async () => {
  await client?.end();
  await container?.stop();
});
it('ACC-002 / Q15: Drizzle transactions restrict a non-bypass role to transaction-local branch context', async () => {
  await database.transaction(async (transaction) => {
    await transaction.execute(sql`set local role hsm_rls_reader`);
    expect(await transaction.execute(sql`select branch_id from rls_spike.resources`)).toHaveLength(
      0,
    );
    await transaction.execute(sql`select set_config('hsm.branch_id', ${branchA}, true)`);
    const rows = await transaction.execute<{ branch_id: string }>(
      sql`select branch_id from rls_spike.resources`,
    );
    expect(rows.map((row) => row.branch_id)).toEqual([branchA]);
    expect(
      await transaction.execute(
        sql`select branch_id from rls_spike.resources where branch_id = ${branchB}`,
      ),
    ).toHaveLength(0);
  });
});
it('ACC-002 / Q15: reused pooled connections lose branch context after commit and rollback', async () => {
  const [before] = await database.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
  await expect(
    database.transaction(async (transaction) => {
      await transaction.execute(sql`set local role hsm_rls_reader`);
      expect(
        await transaction.execute(sql`select branch_id from rls_spike.resources`),
      ).toHaveLength(0);
      await transaction.execute(sql`select set_config('hsm.branch_id', ${branchB}, true)`);
      expect(
        await transaction.execute(sql`select branch_id from rls_spike.resources`),
      ).toHaveLength(1);
      throw new Error('Intentional rollback');
    }),
  ).rejects.toThrow('Intentional rollback');
  await database.transaction(async (transaction) => {
    await transaction.execute(sql`set local role hsm_rls_reader`);
    const [after] = await transaction.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
    expect(after?.pid).toBe(before?.pid);
    expect(await transaction.execute(sql`select branch_id from rls_spike.resources`)).toHaveLength(
      0,
    );
  });
});
it('ACC-002 / Q15: table ownership and superuser connections bypass ordinary RLS policies', async () => {
  await database.transaction(async (transaction) => {
    await transaction.execute(sql`set local role hsm_rls_table_owner`);
    expect(await transaction.execute(sql`select branch_id from rls_spike.resources`)).toHaveLength(
      2,
    );
  });
  const rows = await database.execute(sql`select branch_id from rls_spike.resources`);
  expect(rows).toHaveLength(2);
  const [role] = await database.execute<{ rolsuper: boolean }>(
    sql`select rolsuper from pg_roles where rolname = current_user`,
  );
  expect(role?.rolsuper).toBe(true);
});
