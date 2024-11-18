# Database foundation

Phase 1 Task 5: Drizzle schema for the 19 foundation tables and three required geography tables.
No later-phase property, booking, resident or finance tables are implemented.

From the repository root, with Node 24 and Corepack:

```sh
corepack pnpm turbo run db:generate
corepack pnpm turbo run db:migrate
corepack pnpm turbo run db:seed
corepack pnpm turbo run test:integration --filter=@hsm/db
```

Start the local infrastructure first (see `infra/README.md`). Migrations enable required
extensions, create tables, then install audit/root-count protections. Use a migration
credential capable of DDL; a future application role must not have that authority.

Set DATABASE_URL, ROOT_ADMIN_EMAIL and ROOT_ADMIN_PASSWORD in the ignored root `.env`.
The seed never resets an existing administrator password or elevates an unrelated identity.
It is only a first-root bootstrap, not an admin-management API. CLI failures return a nonzero
exit code without printing raw database parameters. Temporary credentials are never seeded.

The integration suite uses Testcontainers with real PostgreSQL 17/PostGIS. No database
mocks or automatic skips are used. Docker absence is a failing prerequisite, not a pass.
GitHub Actions on Ubuntu is the authoritative container verification environment.
Use `pnpm turbo run test:integration` both there and on a compatible developer machine.
Local Windows source/unit work does not require a runtime. Container checks are
**NOT RUN LOCALLY** and **CI PASS** requires an actual successful workflow run.
The existing 10 tests remain intact; the added Compose suite verifies clean migration
replay, seed correctness/rollback, real Redis and storage/email readiness. See
`docs/ci-verification.md` for coverage gates and remaining API/application requirements.

Q15 (RLS) remains open; these schema constraints do not replace API authorization.
