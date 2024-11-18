# Development/test infrastructure (Phase 1 Task 2)

A compatible Docker API runtime with Compose v2 runs these services. Node 24 LTS and
Corepack run application tooling. GitHub Actions Ubuntu is authoritative for container
verification; Windows source work needs no local runtime or Docker Desktop.

Copy `.env.example` to `.env` and generate a local POSTGRES_PASSWORD. Configure
DATABASE_URL with URL-encoded PostgreSQL credentials. S3 settings are provider-neutral:
S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY and S3_PRIVATE_BUCKET.

Development S3 uses Apache-licensed Versity Gateway v1.8.0 with a persistent POSIX volume.
The example S3 credentials are deterministic development fixtures, never production keys.
Set different local credentials if desired; storage and initialization share those settings.
There is no vendor account, auth token, paid feature or public bucket requirement (ADR 0005).

From the repository root:

```sh
docker compose --env-file .env -f infra/docker-compose.yml config --quiet
docker compose --env-file .env -f infra/docker-compose.yml up -d
docker compose --env-file .env -f infra/docker-compose.yml ps --all
pnpm install --frozen-lockfile
pnpm turbo run db:migrate db:seed
```

Mailpit inbox: http://localhost:8025. S3 API: http://localhost:9000 (no storage console).
The AWS CLI initialization job waits for authenticated S3 readiness, creates the bucket
idempotently, sets its ACL to private and verifies it exists. Its nonzero exit is a failure.
All published ports bind only to loopback. This Compose stack is for development/testing.

PostGIS, citext, pg_trgm and pgcrypto initialize on a fresh database volume. Migrations
also create extensions on a clean database without Compose bootstrap. The corrected
unpublished baseline creates all 19 enum types before tables. Application startup is pending.

`pnpm turbo run test:integration --concurrency=1` is identical on compatible developer machines and CI.
It preserves all 14 DB/infrastructure tests. Test projects use fresh volumes, random database
credentials, deterministic development S3 credentials and ephemeral loopback ports.
Signed bucket/object operations and anonymous bucket/object denial are asserted.
Test teardown removes only its own generated volumes; developer defaults stay unchanged.

Stop with `docker compose --env-file .env -f infra/docker-compose.yml down`.
Use `down -v` only when intentionally erasing developer volumes. See
`docs/ci-verification.md` for LOCAL PASS / CI PASS / NOT RUN LOCALLY evidence.

Private file processing uses ClamAV 1.5.4 at CLAMAV_HOST/CLAMAV_PORT (development localhost:3310). Its TCP port binds only to loopback and must stay private in deployment. Compose keeps signature updates enabled and persists signatures. Allow at least 3 GiB scanner memory. The API requires configured private S3; the worker additionally requires ClamAV. Compiled-process fixtures use bundled antivirus signatures for deterministic real scans.

## Existing local environments

Use `./infra/dev.ps1 -Action Start` from the repository root. The launcher validates
configuration, checks applied migration hashes, applies pending migrations, builds
shared client dependencies once and starts the application supervisors. `-SkipBuild`
requires those dependencies to be built already. Direct `-Action Run -App web`
(or another app) still builds that app's prerequisites.

Startup does not seed or reset accounts. `ROOT_ADMIN_EMAIL` and
`ROOT_ADMIN_PASSWORD` are required by the separate `db:seed` task, not by runtime
startup; if either is supplied to startup validation, both must be valid. Preserve
the existing Root identity and password hash when recovering an initialized database.
Back up ignored environment files before edits and the database before migrations.
Recover existing security keys first; replacement needs explicit approval because
it invalidates tokens and can make protected historical data unreadable. Never run
credential provisioning automatically as a recovery step. Mailpit captures local
email only; receiving a local OTP does not prove delivery to an external mailbox.

## Stable mode for phone testing

`./infra/dev.ps1 -Action Start -Applications api,worker,mobile -SkipBuild -Stable` runs the API
without `--watch`, so builds and tests no longer restart it and a connected phone keeps working.
After a backend change, restart only the API: `./infra/dev.ps1 -Action Restart -Applications api -Stable`.
