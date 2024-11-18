# Phase 1 verification environments

## Login layout APK verification (2026-10-13)

LOCAL PASS: mobile lint/typecheck, 198 unit cases, 82 native component cases in
18 suites, Android bundle export, and incremental arm64 APK packaging (29m 22s;
584 tasks reused). APK signature, all 26 arm64 libraries including Hermes/MapLibre,
16 KB ZIP/ELF alignment, no GPS permissions and new login bytecode content passed.
The updated test build was installed on the authorized Pixel 6 Pro and its public
login layout visually checked. No credentials were entered. This is layout and
packaging verification, not installed-device/API acceptance. Real containers are
NOT RUN LOCALLY. The new source needs exact-revision CI.

Artifact: `.tools/hsm-login-layout-pixel-arm64-20261013.apk` (61,231,029 bytes),
SHA-256 `45839e03f012801f7326215f647a69cb54b9ce19dc86582f015721a2ce587416`.
Local review capture: `.tools/hsm-login-layout-pixel-20261013.png`.

## Latest inspected CI revision (2026-10-13)

[Run 38413314348](https://github.com/ammad981/hsm/actions/runs/38413314348) at
790ad83149ddec630e9e10b6f6579b30038877a2 executed real jobs and completed with
six CI PASS jobs: quality, real infrastructure, actual application containers,
exact-revision aggregate coverage, Gitleaks and Semgrep. Account availability did
not block this run. This supersedes the historical zero-step account failures below.

The full run FAILED. Browser/API reported three failures across five cases:
Customer/Owner post-profile navigation and Manager acceptance. Native/API reached
the installed-app step but its emulator boot timed out. Neither failure was waived;
no deadline, assertion or coverage threshold was changed. Successful container and
aggregate jobs do not establish the missing browser/native acceptance. The subsequent
login layout edit still requires its own exact-revision CI verification.

## Verified Windows APK result (2026-10-13)

LOCAL PASS: incremental arm64 `assembleRelease` with the documented Windows init
script; final retry succeeded in 19m 32s, reusing 548 tasks and executing 60.
A shutdown interrupted the first long attempt. The subsequent resume found one
corrupted MapLibre release-lint cache entry; Gradle quarantined it automatically,
and the next retry ran the real lint task successfully. No checks were disabled,
no broad cache cleanup was performed and the saved bundle/dex/classes were reused.

The 61,227,081-byte test APK has SHA-256
`0b23258b9f130f7535c8e20417f1887c4f11d1ce02c839e8bea54c7ef724d7cc`.
Android signature verification, all 26 arm64 ELF libraries (including Hermes and
MapLibre), ZIP/ELF 16 KB alignment and absence of GPS permissions passed. The
ignored delivery artifact is `.tools/hsm-phase1-pixel-arm64-20261013.apk`.
Its test API endpoint is localhost; successful packaging does not establish
installed-device/API behavior. No physical phone control was resumed.

Earlier APK-pending records below are retained as history and superseded by this
packaging result. Real container, browser/API and installed-native/API checks are
NOT RUN LOCALLY. Exact-final-revision CI and combined coverage remain unverified.

## Latest exact-revision CI evidence (2026-10-13)

At 12b39a8e9da0aada36654a2a3a36b7430a6f5f83,
[run 38299539689](https://github.com/ammad981/hsm/actions/runs/38299539689)
failed before execution in seven jobs (zero steps); the aggregate dependency job
was skipped. Checked quality, infrastructure and native annotations identify
failed account payments or spending-limit availability. This is not a test failure
or CI PASS. Account availability remains outside Phase 1 product implementation.
All eight required workflow jobs and real integration assertions remain configured.

## Current verification architecture and evidence (2026-10-12)

The complete containerized stack must be successfully verified in a compatible
container environment. This may be a developer machine or the project's CI
environment. Docker-compatible/container-runtime verification is required;
Docker Desktop specifically is not required.

The Ubuntu workflow is capable of running the infrastructure-dependent Phase 1
checks. Its availability is an external prerequisite: the last inspected run before this batch push,
38241966479 at b4908cfa867bcd47c9a0674343b391daf44c0513 started zero steps
in all seven jobs because of account payment/spending availability. The last complete seven-job CI PASS remains
554c507655c269ec8d551de095613241ee2b86a8, run 38134513233. The current implementation
batch has no exact-commit CI PASS. See STATUS.md for current local evidence.
Billing availability is outside Phase 1 product scope.

Merge-protection verification is another external repository prerequisite. The
current connection has push/triage access but no administration permission. The
legacy protection endpoint returns 404 and the applied branch-rules endpoint
returns an empty list. This does not establish that legacy protection is absent;
its enforcement cannot be verified or configured with this connection. A repository
administrator must confirm required main-branch checks, including the new
`aggregate-coverage` job, and the documented PR/review policy. Workflow failures
still prevent Phase 1 acceptance; no claim of verified merge protection is made.

| Job                      | Container dependency and blocking checks                                                                                                                                                                                                            |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `quality`                | None: frozen pnpm install, Turbo lint/typecheck/unit/contracts/component tests/builds, coverage thresholds, generated client/migration drift, formatting and security audit.                                                                        |
| `container-integration`  | Real Testcontainers/Compose infrastructure: PostgreSQL 17/PostGIS, Redis, extensions, migrations, clean replay, seed, constraints, API authorization, refresh/OTP/session transactions, audit rollback, files/outbox/worker and concurrency suites. |
| `application-containers` | Builds the actual API/worker/production web image and verifies real HTTP, worker, storage and CSRF behavior.                                                                                                                                        |
| `browser-integration`    | Chromium drives production web against actual API/worker and Testcontainers services, including Owner setup/invitation recovery and same-identity email association.                                                                                |
| `native-integration`     | Android emulator and bundled APK, Maestro, actual API/worker and Testcontainers services. Original seven scenarios and Manager email association are retained; a ninth exercises Owner map pin, draft persistence, resume and submission.           |
| `aggregate-coverage`     | No container runtime in this job; requires successful quality and real-container coverage producers from the exact revision, source/report hash validation and an unrounded 80% whole-runtime line floor.                                           |
| `secrets`                | Gitleaks; no project container runtime required.                                                                                                                                                                                                    |
| `static-analysis`        | Docker runs the pinned Semgrep scanner.                                                                                                                                                                                                             |

Thus four infrastructure/application jobs require containers, plus the static
analysis scanner job. All existing Testcontainers suites remain mandatory. The
Windows machine can run frozen install, lint, typecheck, unit/contract/component
tests, application builds and development without Docker. APK compilation also
requires Java/Android tooling. No local container-dependent result is claimed.

PostgreSQL/PostGIS uses `postgis/postgis:17-3.5`; Redis uses `redis:7.4-alpine`.
The shared real fixtures initialize extensions and apply the committed Drizzle
migration chain (0000–0006). The database infrastructure suite creates a clean isolated Compose database,
replays migrations and checks extensions/catalog behavior; migration suites
exercise database constraints and repeated migration application.
Seed suites verify required geography/root-admin records, repeatability and
transactional rollback; root-admin input is supplied through environment variables.
The new application changes require no migration or seed bypass.

Compatible developer environments and CI use the same Turbo commands:
`pnpm turbo run test:integration --concurrency=1`,
`pnpm turbo run test:containers --filter=@hsm/api --concurrency=1`,
`pnpm turbo run test:e2e --filter=@hsm/web --concurrency=1`, and
`pnpm turbo run test:native --filter=@hsm/mobile --concurrency=1`.
The new email association database cases cover persisted attempts, collision,
concurrent unique binding, revoked authorization and atomic audit rollback.
All real acceptance checks are NOT RUN LOCALLY for this batch.

The environment is sufficient in design for infrastructure-dependent gates;
Phase 1 is not complete until the exact final commit actually passes it. The current batch implements visual map selection (resolved Q8), aggregate
coverage producers/wiring and revised native Owner setup acceptance. Their final
verification remains pending. Scoped unit coverage
is not evidence of the whole-application aggregate threshold. Security exceptions
remain limited to the two existing verified backports and their original expiry.

## Current local whole-source diagnostic

LOCAL PASS: supplemental unit/component suites and report inventory validation.
All 270 product runtime files are represented: 13,918 of 15,717 reported source
lines are covered, or 88.55379525354711%. No runtime source is missing or represented
by an empty record, and excluded files have no executable coverage lines. The
unchanged original scoped business gates passed separately.

This is a quality-only local diagnostic, not a combined aggregate gate PASS.
Revision-bound quality CLI orchestration passed at
`a2bf89709a9b69d340c11a170806c57190dbf3ef`, with a fresh report manifest and all
76 native component cases passing. The initial interrupted attempt is not PASS.
Real infrastructure evidence and exact-final-revision CI acceptance remain pending.
The final verification commit changes documentation only; CI must collect fresh
evidence for that revision. The run after the single batch push is recorded in
[PR #1](https://github.com/ammad981/hsm/pull/1). No container/native API result follows from these data.

## Historical current evidence (2026-10-09; superseded)

CI PASS: [run 37892899441](https://github.com/ammad981/hsm/actions/runs/37892899441)
at 768baae15ce7461f55291b3c2723221636d4812c: all five jobs passed.
Real integrations: 97 tests (API 63, database 17, files 9, notifications 5,
worker 3), zero skipped. Real production browser/API: three scenarios passed,
zero skipped. LOCAL PASS: 52 Turbo tasks and 755 unit/contracts/web tests.
Container and browser assertions are NOT RUN LOCALLY.

Task 12 now adds a required Ubuntu Android job: SDK/Gradle builds a bundled APK,
Maestro drives the installed app against actual Testcontainers API/worker services,
and PostgreSQL assertions verify persisted mobile sessions and revocation. The
native job is configured but has not been verified. No mobile CI PASS is claimed.
`quality` also requires native component tests through `test:components`.

Container jobs: real infrastructure, browser/API, native/API, and Semgrep's scanner.
Quality, unit/contracts, native component tests, TypeScript, Metro export, web/API
builds and application development remain runnable without Docker. Android APK
builds and device tests additionally require compatible Java/Android tooling.

PostgreSQL/PostGIS comes from real `postgis/postgis:17-3.5` Testcontainers and
Compose services; Redis from `redis:7.4-alpine`. The existing database suites
verify extensions, the full committed Drizzle chain, isolated clean replay,
constraints and idempotent/transactional seed behavior. All historical integration
assertions remain mandatory. No existing test is replaced by a mock.

Compatible local environments and CI use the same commands:
`pnpm turbo run test:integration --concurrency=1`,
`pnpm turbo run test:e2e --filter=@hsm/web --concurrency=1`, and
`pnpm turbo run test:native --filter=@hsm/mobile --concurrency=1`.

Remaining Phase 1 gates: mobile local/CI checks, observability and the complete
implemented containerized client/API/worker stack. Infrastructure verification is
sufficient for the existing infrastructure gates; it does not yet establish full
Phase 1 completion. Docker Desktop is not a requirement.

## Whole-application coverage commands

Original scoped business tests and thresholds remain blocking. Additional Vitest/Jest
configs collect every product `src` runtime module; they are supplemental evidence,
not replacement acceptance gates. Source discovery and the final floor fail closed
on missing runtime files, empty runtime records, invalid paths or mismatched evidence.
Explicit exclusions are recorded for tests, test infrastructure, declarations,
non-JavaScript assets and code with no executable TypeScript emission.

- Quality producer, without Docker: `pnpm turbo run coverage:produce --filter=@hsm/config -- quality`.
- Infrastructure producer, with compatible containers: `pnpm turbo run coverage:produce --filter=@hsm/config -- infrastructure`.
- Combined gate, after both reports: `pnpm turbo run coverage:aggregate --filter=@hsm/config`.

Producer commands are identical locally and in CI. Commit product/configuration changes
before collecting revision-bound evidence. The infrastructure producer first runs the
unchanged `pnpm turbo run test:integration --concurrency=1`, including its original seed
coverage gate, then reruns those real suites for supplemental whole-source coverage.
Its CI job budget is increased to cover this added work; individual test deadlines are
unchanged. Cached or previous revision reports cannot satisfy the aggregate job.
Quality/infrastructure artifacts are uploaded separately and downloaded into a fresh
checkout for canonical unique-line merging. Production child processes are not credited
with coverage they did not report; their runtime modules remain in the denominator.

The new aggregate job and Android no-location-permission APK check are configured,
not yet CI PASS. CI availability remains the outstanding external prerequisite.
The Ubuntu/container/emulator architecture is sufficient to run all infrastructure
Phase 1 gates; configuration alone does not satisfy their successful execution.

## Historical verification records (superseded by current evidence)

Date: 2026-10-07. Decisions: ADR 0004/0005. Working checkout: E:\hsm-git; existing PR #1. Run 37609177330 passed quality, static-analysis and secrets but failed integration setup. **CI PASS: [run 37618685334](https://github.com/ammad981/hsm/actions/runs/37618685334), commit a69aebd8c829a989d49fd7ea794e71b5465f2e6c. All four jobs succeeded; 14/14 integration tests executed and passed.** Earlier ZIP-checkout limitations are superseded. See foundation-ci-repair.md.

The complete containerized stack must be successfully verified in a compatible container
environment. This may be a developer machine or the project's CI environment. Docker
Desktop specifically is not required. The runtime must support the Docker API used by
Testcontainers and Compose v2 for the Compose smoke suite.

## Commands and jobs

| Environment / job                            | Command or scope                                                                 | Containers required?                            |
| -------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------- |
| Windows / `quality`                          | `pnpm install --frozen-lockfile` then `pnpm turbo run lint typecheck test build` | No                                              |
| Windows / `quality`                          | `pnpm turbo run db:generate`, formatting, production audit                       | No; generation does not connect to a database   |
| Compatible machine / `container-integration` | `pnpm turbo run test:integration --concurrency=1`                                | Yes; identical command in CI                    |
| `secrets`                                    | gitleaks scan with full Git history available                                    | No; native scanner binary                       |
| `static-analysis`                            | Semgrep via `docker run`                                                         | Yes; scanner container, no application services |

`container-integration` runs on `ubuntu-24.04`, explicitly requires `docker info` and
`docker compose version`, and fails if setup or tests fail. It never conditionally skips
for runtime absence, disables Ryuk, caches integration success or substitutes mocks.
JUnit and coverage artifacts are uploaded even on failure. PRs, main pushes and manual
workflow dispatch trigger the workflow. Required status checks must be enabled on GitHub.

`quality` retains unit/contracts coverage, builds, migration generation drift, frozen
installation and production vulnerability auditing. Security jobs retain gitleaks and
Semgrep. Gitleaks PR comments are disabled; the job has read-only repository/PR access.
GitHub permissions, image pulls and remote scanner execution were verified by run 37618685334.

## Existing Testcontainers suite: unchanged

All 10 tests in `packages/db/test/migrations.spec.ts` run through the integration task:

1. Required extensions and idempotent migration reapplication.
2. AUTH-C-004: case-insensitive identity uniqueness.
3. BR-04: concurrent manager appointments; suspended versus deactivated assignments.
4. SEC-001: cross-organization brand/branch foreign-key denial.
5. ADR 0002: OTP attempt limit.
6. ACC-006: privileged database mutation and audit roll back together.
7. AUD-001/004: audit update/delete denial.
8. ADM-002: idempotent root bootstrap and refusal of a different bootstrap identity.
9. ADM-001: final active root removal denied.
10. ADM-001: fourth active root denied.

This suite starts its own fresh `postgis/postgis:17-3.5` container with random database credentials,
applies all Drizzle migrations, and tears down its connection/container. No CI service
database replaces this Testcontainers database.

## Added infrastructure suite

`packages/db/test/infrastructure.spec.ts` starts the actual `infra/docker-compose.yml`
through Testcontainers with a unique project, fresh volumes, random database credentials, development-only S3 credentials and
ephemeral loopback ports. Its four tests verify:

- Clean replay: create a separate empty database with no application tables or pre-enabled
  extensions; apply all three migrations; assert PostgreSQL 17 and postgis/citext/pg_trgm/
  pgcrypto; reapply and assert the journal still has exactly three entries.
- Seed (ADM-002, ACC-006): reject invalid input and an unrelated existing identity; assert
  rollback leaves no roots/geography/audit rows; bootstrap geography and a root; verify the
  argon2id hash against the generated password; seed again and assert identical user, one
  active root, two cities, three areas, one place and one bootstrap audit.
- Real `redis:7.4-alpine`: PING, server version and concurrent atomic increments.
- Mailpit inbox readiness, signed bucket/object S3 operations and anonymous bucket/object HTTP 403 denial.

Compose provides PostgreSQL/PostGIS, Redis, Mailpit and Versity S3 Gateway with the pinned image
tags and startup behavior. PostgreSQL/Redis health checks, HTTP wait strategies and an
explicit successful-exit check of the storage-init job gate readiness. Test teardown
removes only its own generated Compose project/volumes.
No developer database or application secrets are used.

The seed's business logic has an integration coverage gate of 90% lines/statements/
functions and 85% branches; contracts retain their existing coverage gate. Schema
declarations and CLI bootstrap wrappers are not represented as domain coverage. API,
overall application and acceptance coverage remain unestablished while those apps are absent.

## Historical infrastructure checkpoint (superseded by continuation below)

- **LOCAL PASS:** see STATUS for the latest completed source/unit verification. Container
  test code can be linted and typechecked locally; this does not execute its assertions.
- **NOT RUN LOCALLY:** the revised real Testcontainers/Compose suite, migrations against
  a real database, seed, Redis and container smoke checks. The earlier attempt failed
  because no runtime was available; it was not a pass.
- **CI PASS:** run 37618685334 at a69aebd: quality, real infrastructure integration, static-analysis and secrets. All 14 integration tests passed. Seed coverage: 100% lines/statements/functions and 86.66% branches, above unchanged gates. Contracts coverage: 100%.

API/database integration, route isolation (ACC-002), immediate manager revocation,
refresh reuse, API transactional audit, runtime security and full application startup
cannot yet be verified: Tasks 6–13 remain unimplemented. The workspace-wide integration
task will discover application `test:integration` scripts when added; each API/database,
authorization and relevant transaction suite must be wired there with real services and
coverage gates. A green database suite alone cannot satisfy those missing gates.

The Ubuntu environment is suitable for the infrastructure-dependent gates. The current
configuration covers the implemented database/infrastructure subset, but **does not yet
satisfy all Phase 1 gates**: the API/application
acceptance suites and complete stack are still missing. Phase 2 is not approved by this change.

## Authentication and email continuation (2026-10-08)

The historical missing-API statements above are superseded. Task 6 and the persisted
Task 7 authentication checkpoints are implemented. Latest observed CI PASS:
[37674310269](https://github.com/ammad981/hsm/actions/runs/37674310269), commit 3aa522f;
quality, real infrastructure integration, secrets and static analysis succeeded.
Task 7 remains open until the new worker/application-process checks succeed.

Existing Testcontainers suites remain mandatory: database migrations/constraints,
clean replay/seed/private storage/Redis, API infrastructure, sessions and OTP,
identity/password changes, manager activation/concurrency and auth quotas. They
run in Ubuntu CI with real PostgreSQL 17/PostGIS and Redis containers. No test is
removed, mocked or conditionally skipped because Windows lacks Docker.

The additive lease migration extends the replay expectation from three to four
journal entries, preserving migrations 0000–0002. Replay still starts from an empty
database without pre-enabled application extensions, verifies all extensions and
PostgreSQL 17, then reapplies and requires the same migration journal. Seed checks
still assert rollback, geography, password hashing, root identity and idempotence.

New pending checks use the same pnpm turbo run test:integration command:

- apps/worker/test/outbox.spec.ts: concurrent row-lock claims, lease recovery,
  stale-owner acknowledgement denial, five-attempt dead letters, lease constraints,
  and real Redis/BullMQ-to-SMTP-to-Mailpit delivery.
- apps/api/test/stack/auth-delivery.spec.ts: starts the compiled production API and
  worker as separate processes against real PostGIS, Redis and Mailpit; verifies
  registration/email OTP, access, password recovery and immediate session rejection.
  The worker environment receives only its derived email key, excluding CNIC keys.

LOCAL PASS applies only to completed checks recorded in STATUS. The new container
assertions are NOT RUN LOCALLY; source validation is not execution evidence.
Their CI result is pending. Unit/config/template/provider tests remain runnable
without containers, as do install, lint, typecheck, builds and application development
against configured reachable services.

Container jobs are Real infrastructure integration (application services) and
static-analysis (Semgrep scanner). quality and secrets need no container runtime.
The Ubuntu runner is sufficient for compatible-runtime verification, but the current
implemented stack does not yet satisfy every Phase 1 gate: Tasks 8–13, web/mobile,
transactional authorization/audit and final complete-stack acceptance remain open.
Hostinger production delivery and DNS deliverability require deployment credentials
and domain configuration; Mailpit verifies the adapter without claiming production
mailbox delivery. Phase 2 remains outside this work.

## Private storage and antivirus provider verification (2026-10-08)

packages/files/test uses actual Versity v1.8.0 and ClamAV 1.5.4 Testcontainers.
The four mandatory tests verify signed private quarantine uploads, anonymous access
denial, bounded actual reads, immutable verified snapshots despite quarantine overwrite,
and real clean/infected antivirus verdicts. The standard benign antivirus test signature
is constructed in memory. No fake provider substitutes for these integration semantics.
The common command remains pnpm turbo run test:integration.

Run 37765903438 at 7e24230 passed all 69 real integrations (45 API, 17 database,
three worker, four files), with zero skipped, plus secrets and static analysis.
The overall run FAILED because of a scanner unit-fixture timeout in quality.
This is successful integration-job evidence, not an overall CI PASS. The corrective
checkpoint must pass all four jobs before dependent implementation continues.
All container checks remain NOT RUN LOCALLY on this Windows machine.

## Web foundation verification (2026-10-09, in progress)

The historical pending Task 7–10 statements above are superseded by STATUS.
Last observed complete CI PASS: run 37829849133 at b69d15a; all four jobs passed
and all 97 real integrations executed with zero skipped (API 63, database 17,
files 9, notifications 5, worker 3). That evidence covers the committed shared
foundation, not the new web source below.

The new Real browser and API integration job requires containers and Chromium.
It runs pnpm turbo run test:e2e --filter=@hsm/web --concurrency=1, the same command
available on a container-capable developer machine. The shared Testcontainers
fixture provides PostgreSQL 17/PostGIS, Redis, Mailpit, private Versity storage
and ClamAV, replays all committed migrations, and starts the compiled API/worker.
Playwright starts the standalone production Next.js application. Existing API
Testcontainers suites remain mandatory through their original fixture entry point.

Browser assertions cover registration and delivered OTP, HttpOnly cookie sessions,
CSRF denial, actual refresh lineage across two tabs, logout, recovery, password
change, logout-all, manager activation, branch isolation, suspension/deactivation
rejection, CSP, responsive layout and axe accessibility. These are pending actual
CI execution. No browser or container PASS is established by this configuration.
Generated reports are ignored by Git; auth traces, screenshots and videos are off.

Container jobs: real infrastructure integration, real browser/API integration and
Semgrep static analysis. Non-container jobs: quality and secrets. Local Windows
can install, lint, typecheck, run unit/contracts/component tests, build and develop
applications against reachable configured services. Container assertions are
NOT RUN LOCALLY. The complete application-container stack and mobile/observability
verification remain open for Tasks 12–13. A compatible Ubuntu container runtime is
sufficient; Docker Desktop is not required. Phase 2 remains excluded.

## Mobile checkpoint and temporary backport verification (2026-10-09)

Current source adds a Real Android and API integration job requiring a compatible
container runtime plus Android SDK/emulator. The same Turbo test:native command
runs on a suitable developer machine. The job uses the shared real PostgreSQL
17/PostGIS, Redis, Mailpit, Versity and ClamAV Testcontainers fixture; it does not
replace the existing 97 infrastructure tests or three browser scenarios. Emulator
flows verify actual OTP delivery, persisted mobile sessions, restart, logout/revocation, manager activation and scoped grants. CI has not run this source.

The additional security task runs the real registry audit after exploit and
patch/installed-source integrity tests. Only two exact temporary backport findings
are accepted, expiring 2026-11-08 UTC; all other high/critical findings block.
Raw audit and explicit decision reports are retained. See ADR 0017 and the mobile
dependency audit record. Local security checks passed with these explicit
exceptions, not an unqualified clean audit. Local Windows still cannot verify
containers or installed-device integration. Task 13 complete-stack acceptance
remains required before declaring Phase 1 complete.

## Local APK compilation result (2026-10-13)

Android project generation and Hermes export are LOCAL PASS. Arm64 APK compilation
reached app configuration but the exact NDK 27.1.12297006 download stalled at zero
bytes. The build thread was waiting on the official Google download connection;
the task-owned daemon was stopped, and the attempt exited 1. This result is
NOT VERIFIED, not an APK/device PASS. No test deadline or acceptance assertion was
changed. CI still builds the actual APK and tests it on an emulator against real
API/worker/container infrastructure. Physical Pixel control remains stopped.

## Local Android toolchain recovery (2026-10-13)

The standalone SDK-manager retry also stalled before archive data. The official
Google archive was recovered using bounded HTTPS ranges, then assembled and checked
against Google's repository catalog: 781,495,902 bytes, SHA-1
3bb7efc850cd0af7707854b7e0d5c3b6a7153703. Only after verification was NDK
27.1.12297006 installed, with matching source.properties and the expected compiler.
This toolchain installation is LOCAL PASS; it does not establish APK or native/API
acceptance. The subsequent APK attempt was interrupted by a Windows restart
(System Kernel-Power event 41 at 02:11 with bug check 0x3B). Earlier restart
evidence includes 0x7A. The cause remains unconfirmed; basic physical-drive status
reports Healthy/OK but does not establish the cause. A lighter retry uses one
worker and 1,536 MB Java/Node heaps, with unchanged source, security gates, native
scenario assertions and test deadlines. No APK or installed-device PASS is claimed.

## Windows CMake staging paths

A real local Worklets build failed with Ninja manifest regeneration and long-path
warnings under pnpm's native dependency directory. Use the checked-in init script
for a Windows APK build, after `pnpm turbo run android:prepare --filter=@hsm/mobile`:

```powershell
# From apps/mobile/android; JAVA_HOME and Android SDK tooling must be configured.
.\gradlew.bat :app:assembleRelease -PreactNativeArchitectures=arm64-v8a `
  --init-script ../scripts/android-short-paths.gradle `
  --max-workers=1 --build-cache --no-daemon
```

The script uses Android's public
[buildStagingDirectory DSL](https://developer.android.com/reference/tools/gradle-api/8.9/com/android/build/api/dsl/Cmake)
to keep generated paths under the ignored repository `.tools/android-cxx` directory.
It validates the expected workspace layout and canonical module destination. It
changes generated-file locations, not compilation inputs, ABIs or acceptance gates;
non-Windows execution is a no-op. The failed Worklets task passed on the retry, but
full APK/native/API acceptance is still pending. Memory-limited Windows checks can
use one worker and a smaller Java/Node heap; test deadlines remain unchanged.
