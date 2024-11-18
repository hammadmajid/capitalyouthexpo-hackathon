# Phase 1A CI repair checkpoint

Date: 2026-10-07. Branch: feature/phase-1a-foundation. Existing PR: #1.
Task 6 API, Phase 1B and Phase 2 are outside this repair. **Current result: CI PASS, run 37618685334 at a69aebd; all four jobs and 14/14 integration tests passed.** Earlier pending/failure entries below are retained history and superseded by this evidence.

## Confirmed failures

Run 37609177330: quality, static-analysis and secrets succeeded; real infrastructure
integration failed. Both setup hooks failed, so none of the 14 integration tests passed.
PostgreSQL rejected otp_purpose_enum; the configured MinIO image could not be pulled.

## Migration repair

Drizzle only inspects exported schema objects. Table columns recorded enum names, but the
schema index omitted the pgEnum exports; snapshot enums were empty and SQL lacked CREATE TYPE.
No shared environment successfully applied this baseline. Regenerated the unpublished
0001 from preserved extension-only 0000 using drizzle-kit through Turbo, then generated the
custom 0002 metadata and retained original guard SQL. Preserved journal order/timestamps.
No 0003 dependency workaround, manual enum SQL patch, amended commit or history rewrite.

All 19 types now precede the first CREATE TABLE:
account_status_enum, admin_role_enum, admin_status_enum, area_level_enum, client_enum,
delivery_status_enum, file_purpose_enum, file_visibility_enum, gender_enum,
hostel_category_enum, late_fee_type_enum, manager_status_enum, notification_channel_enum,
otp_purpose_enum, place_type_enum, plan_status_enum, scan_status_enum, upfront_enum,
verification_status_enum.

Three non-container regression tests first failed against the old export/SQL/snapshots.
They check enum exposure, generated declarations/values/order, and snapshot continuity.
Existing 14 integration tests and anonymous HTTP 403 assertions are retained.

## Storage repair

Versity S3 Gateway v1.8.0 plus AWS CLI automatic private bucket initialization (ADR 0005).
Public release manifests verified HTTP 200; no token or paid emulator dependency required.
Signed S3 bucket/object operations and anonymous object download denial strengthen the
existing storage test. Obsolete MinIO configuration is removed.

## Evidence

- LOCAL PASS: frozen installation, lint, typecheck, all 42 unit/policy tests, build, full-repo Prettier check, production audit (no vulnerabilities), git diff --check, gitleaks history scan (no leaks), and generation drift (no schema changes; migration hashes unchanged). Contracts coverage remains 100%.
- NOT RUN LOCALLY: all container tests; Windows has no required local runtime.
- CI PASS: repair run pending; no success claim.
- Phase 1A is incomplete: Task 6 NestJS/Fastify API is unimplemented and intentionally untouched.

Mobile and Web eventually provide full business-function parity for Customer, Resident,
Owner, Manager and Admin, with one backend/API, database, authorization and business rules.
Only platform-specific UI differs.

## Files changed

- .env.example
- .gitattributes
- .github/workflows/ci.yml
- .prettierignore
- docs/02-architecture.md
- docs/adr/0005-development-s3-provider.md
- docs/adr/README.md
- docs/ci-verification.md
- docs/foundation-ci-repair.md
- docs/STATUS.md
- infra/docker-compose.yml
- infra/README.md
- infra/storage/init.sh
- packages/db/migrations/0001_phase_one_foundations.sql
- packages/db/migrations/meta/0001_snapshot.json
- packages/db/migrations/meta/0002_snapshot.json
- packages/db/package.json
- packages/db/src/schema/index.ts
- packages/db/test/infrastructure.spec.ts
- packages/db/test/storage.fixture.ts
- packages/db/tsconfig.check.json
- packages/db/unit/migrations.spec.ts
- packages/db/vitest.unit.config.ts
- pnpm-lock.yaml
- pnpm-workspace.yaml

## CI iteration: geography generator repair

Run 37613882505 passed quality, static-analysis and secrets, but both integration setup
hooks failed on the quoted identifier "geography(Point,4326)"; zero tests passed.
Drizzle Kit 0.31.11's native type parser omits geography while supporting geometry.
The pnpm-managed patches/drizzle-kit.patch adds geography to that parser; frozen installs
apply it reproducibly. Regenerated the unpublished 0001/0002 metadata from 0000 again.
The SQL change is exactly three geography type expressions; Point/4326 constraints remain.
A fourth migration regression test failed before regeneration and is retained.
CI success remains pending. New file: patches/drizzle-kit.patch.

LOCAL PASS after geography repair: frozen install; Turbo lint/typecheck/test/build with --concurrency=1 (11 tasks, 43 tests, contracts coverage 100%); full Prettier check; production audit; whitespace and generation drift. The earlier parallel attempt timed out in policy setup; the unchanged serial suite passed. Container tests remain NOT RUN LOCALLY.

Run 37618211703 again passed 13/14 integration tests. Initializer diagnostics confirmed
AccessControlListNotSupported: newly created buckets default to BucketOwnerEnforced.
Explicitly configure BucketOwnerPreferred before applying the private bucket ACL,
including repeated initialization of an existing bucket. Signed S3 operations and anonymous
bucket/object HTTP 403 checks remain mandatory. No full CI PASS yet.

## Authoritative successful evidence

[Foundation checks run 37618685334](https://github.com/ammad981/hsm/actions/runs/37618685334),
commit a69aebd8c829a989d49fd7ea794e71b5465f2e6c: quality, container-integration,
static-analysis and secrets all succeeded. All 10 original migration tests plus all four
infrastructure tests executed and passed, with no skips. Testcontainers provided real
postgis/postgis:17-3.5 and Compose services including redis:7.4-alpine, Mailpit and Versity.
Clean replay and idempotent seed/rollback/password/geography/audit assertions passed.
Contracts coverage: 100%; seed coverage: 100% statements/lines/functions, 86.66% branches.
Existing 90/85 seed coverage thresholds were unchanged. API/application coverage remains absent.

LOCAL PASS: frozen install, Turbo lint/typecheck/test/build (43 tests), formatting,
production audit, whitespace, history/staged gitleaks, post-commit generation without drift,
and shell syntax. NOT RUN LOCALLY: all container-dependent checks.
Warnings: four lint warnings (two long test callbacks and two static repository-file reads),
Turbo missing output notices for policy/migration unit tasks, ignored optional dependency
build scripts, existing dependency deprecations, and upstream gitleaks action Node
punycode/url.parse deprecation notices. No obsolete Node20 action runtime warning remains.
No security/coverage gates were disabled or reduced.

Additional file: patches/drizzle-kit.patch. Same branch and PR #1 retained; original
57de545 preserved. Repair commits: 73d7940, 0e7e96d, 6a913ea, a69aebd.
Compatible Ubuntu CI satisfies the implemented infrastructure gates. Phase 1A is **not
complete** because Task 6 API is unimplemented; API/database integration and complete
application startup remain unverified. Stop here; Task 6 was not begun.
