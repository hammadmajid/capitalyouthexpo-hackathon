# HSM laptop migration — recovery candidate

Prepared 2026-10-23. Baseline: b1fd89c4a08c4ea86628dd41519712f71458e837.
Recovered working tree: E:\HSM-Recovery-20261023-01\repository.

## Recovery gate

Do not retire the original laptop or delete backups. Source inventory, stable full
backup verification, frozen installation, tests and builds must pass before
migration is safe. The recovered changes have not been approved or pushed.
GitHub currently contains the committed baseline, not all recovered work.

## Windows prerequisites

Install Git for Windows with access to the private ammad981/hsm repository.
Install Node.js 24.21.0 and enable Corepack with pnpm@10.18.3.
Workspace globs are apps/* and packages/*; retain pnpm-workspace.yaml, all
patches and pnpm-lock.yaml. Never regenerate the lockfile to hide a failure.
Hooks require gitleaks on PATH; do not bypass them.

For infrastructure/integration use a compatible Docker API runtime with Compose
v2. Ubuntu CI remains authoritative for container gates. Native Android requires
JDK 17, Android SDK platform/API 36 and build-tools 36.0.0 (from CI), platform-tools,
and configured JAVA_HOME/ANDROID_HOME. Verify adb devices. Native integration
uses Maestro CLI 2.11.0 in CI. Expo Go does not prove native map-picker support.

## Transfer

Review the recovery inventories first. Until a reviewed normal commit/push,
securely copy the healthy recovered repository including its .git, all source
and recovered untracked files to a NEW directory on the new laptop. Reinstall
node_modules. Never copy the original corrupted .git. Preserve the separate
salvage.git, reports, stash archives and original backups privately.

After an approved push, a fresh clone is an alternative only after verifying
that the branch contains the actual approved recovery commit:

    git clone --branch feature/phase-1a-foundation https://github.com/ammad981/hsm.git E:\hsm-git
    Set-Location E:\hsm-git
    git rev-parse HEAD
    git fsck --full

## Install

From the healthy transferred project root:

    Set-Location E:\hsm-git
    node --version
    corepack enable
    corepack prepare pnpm@10.18.3 --activate
    pnpm --version
    pnpm install --frozen-lockfile

Expected Node: 24.21.0. Expected pnpm: 10.18.3. Do not use the system
Node 22.23.2 / pnpm 11.25.0 observed during recovery.

## Environment and secrets

For a NEW development setup, copy examples only if destinations do not exist:

    if (!(Test-Path .env)) { Copy-Item .env.example .env }
    if (!(Test-Path .env.worker)) { Copy-Item .env.worker.example .env.worker }

Configure privately. Never upload .env, dumps, credentials or private uploads.
EXPO_PUBLIC_* and NEXT_PUBLIC_* values enter client bundles and cannot hold
secrets. A device needs an API origin it can reach, without /v1; device localhost
means that device. Deployed builds require HTTPS.

Securely retain existing encryption/hash/envelope keys when restoring data:
CNIC_ENCRYPTION_KEY, CNIC_HASH_KEY and EMAIL_ENVELOPE_KEY may be needed to read
existing records. Rotate only with an application-aware plan. Match restored
database/S3 credentials; JWT key rotation can invalidate sessions.

Variable names from .env.example (values intentionally omitted):

NODE_ENV, PORT, DATABASE_URL, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD, REDIS_URL, CORS_ORIGINS, JWT_SECRET, CNIC_HASH_KEY, CNIC_ENCRYPTION_KEY, SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD, SMTP_FROM, CLAMAV_HOST, CLAMAV_PORT, S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_PRIVATE_BUCKET, ROOT_ADMIN_EMAIL, ROOT_ADMIN_PASSWORD, SENTRY_DSN, API_ORIGIN, WEB_ORIGIN, EXPO_PUBLIC_API_URL, EXPO_PUBLIC_APP_ENV, APP_ENV, API_PORT, API_HOST, TRUST_PROXY, BODY_LIMIT_BYTES, GLOBAL_RATE_LIMIT, LOG_LEVEL, AUTH_IP_RATE_LIMIT, AUTH_IDENTIFIER_RATE_LIMIT, NEXT_PUBLIC_SENTRY_DSN, EXPO_PUBLIC_SENTRY_DSN, WEB_UPLOAD_ORIGIN, MARKETPLACE_TEXT_RADIUS_METERS, VISITS_ENABLED

Variable names from .env.worker.example (values intentionally omitted):

NODE_ENV, APP_ENV, DATABASE_URL, REDIS_URL, EMAIL_ENVELOPE_KEY, SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_REQUIRE_TLS, SMTP_USER, SMTP_PASSWORD, SMTP_FROM, LOG_LEVEL, S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_PRIVATE_BUCKET, CLAMAV_HOST, CLAMAV_PORT

## Infrastructure

Compose images: postgis/postgis:17-3.5, redis:7.4-alpine, clamav/clamav:1.5.4,
axllent/mailpit:v1.27, versity/versitygw:v1.8.0, amazon/aws-cli:2.31.16.
Project name: hsm. Published ports bind to loopback. ClamAV needs at least 3 GiB
RAM per infra/README.md.

    docker compose --env-file .env -f infra/docker-compose.yml config --quiet
    docker compose --env-file .env -f infra/docker-compose.yml up -d
    docker compose --env-file .env -f infra/docker-compose.yml ps --all

Mailpit: http://localhost:8025. Development S3 API: http://localhost:9000.
The API needs private S3; worker also needs ClamAV and its environment file.

## Existing data: separate transfer required

The source folder does not contain Docker volumes or externally hosted data.
Identify the actual Docker context, mounts and volume names; declared volumes
are postgres-data, redis-data, storage-data and clamav-signatures, normally
prefixed by hsm.

Export PostgreSQL with PostgreSQL 17-compatible pg_dump, preserve roles/grants as
needed, and test restore into a separate PostGIS 17/3.5 database. Coordinate a
final write freeze. Never overwrite the only database or run down -v.

Preserve private S3 objects and metadata with the database; local S3 data lives in
storage-data. For external S3 use an authenticated provider-supported export.
Never make the bucket public. Preserve Redis persistence when queues/session
state must survive; coordinate workers with the final snapshots to avoid replay.
ClamAV signatures can be rebuilt. Mailpit is development mail.

Transfer database dumps, environment files, encryption keys, private uploads and
TLS keys via encrypted storage outside Git. Verify restored access before
deleting old data. No external database/volume backup was performed by this
repository recovery.

For a NEW EMPTY development database only:

    pnpm turbo run db:migrate --filter=@hsm/db
    pnpm turbo run db:seed --filter=@hsm/db

For a restored database, inspect migration history and recovered pending
migrations first; run db:migrate only after review and a verified database
backup. Review seeds before any existing/production database use. Schema
generation is pnpm turbo run db:generate --filter=@hsm/db, not laptop setup.

## Validate

    pnpm turbo run lint typecheck test build --concurrency=1
    pnpm turbo run test:integration --concurrency=1
    pnpm turbo run test:components --filter=@hsm/mobile --concurrency=1
    pnpm turbo run test:e2e --filter=@hsm/web --concurrency=1

Integration/E2E require documented containers/browser/device prerequisites.
NOT RUN is not PASS. Never point test fixtures at the only production data.

## Start development

Build first: API and worker dev scripts watch dist/main.js and do not compile
TypeScript themselves. Rebuild after source edits.

    pnpm turbo run build --concurrency=1
    pnpm turbo run dev --filter=@hsm/api --filter=@hsm/worker --filter=@hsm/web

In another terminal:

    pnpm turbo run dev --filter=@hsm/mobile

Native generation:

    pnpm turbo run android:prepare --filter=@hsm/mobile

Then, from apps/mobile/android (verified Windows command in docs/ci-verification.md):

    .\gradlew.bat :app:assembleRelease -PreactNativeArchitectures=arm64-v8a --init-script ../scripts/android-short-paths.gradle --max-workers=1 --build-cache --no-daemon

This needs configured SDK/JDK and complete dependencies. Native acceptance uses:

    pnpm turbo run test:native --filter=@hsm/mobile --concurrency=1

It requires a running device/emulator, bundled APK, Maestro and containers.
A Metro export does not prove an installed APK or native acceptance.

## Final acceptance

Verify the stable full SHA-256 backup report; review all uncertain/corrupt and
untracked inventories and stash conflicts; complete frozen install and required
tests/builds; test database/storage restore; approve recovered changes; commit
and push normally; compare the remote hash; test a fresh transfer/clone on the
new laptop. Keep the original laptop and all backups until these gates pass.

Sources: .nvmrc, package.json, pnpm-workspace.yaml, workspace package.json files,
.env.example, .env.worker.example, turbo.json, infra/README.md,
infra/docker-compose.yml, apps/mobile/README.md, .github/workflows/ci.yml,
docs/ci-verification.md and packages/db/src/{migrate,seed-cli}.ts.
