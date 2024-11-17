# HSM development readiness

2026-10-23–24, Asia/Karachi. Workspace: `D:\hsm`.
Branch: `codex/recovery-20261023`. This report covers development stabilization,
not release acceptance or authorization to implement later-phase features.

## Final stabilization follow-up (in progress, 2026-10-24)

This section supersedes the earlier checkpoint where results differ. Starting
HEAD is verified as 00a5478, clean and four commits ahead of origin. Fetch and
redacted full-history scanning pass (163 commits); no push is authorized yet.

Isolated reproduction records seven failed DB assertions and three failed worker
assertions. The worker race is intermittent: the first lease assertion passed on
this replay while two immediate due-time assertions failed. Repairs are:

- Drizzle-generated additive migration 0040 excludes generated claim range values
  from the BEFORE-trigger JSON comparison, while preserving base-term immutability,
  irreversible release, exclusion constraints and deferred source coupling.
- The same migration attaches the existing statement-level immutable-history
  trigger to waiting-list vacancy events and fanout pages. No route is enabled.
- The billing audit-failure trigger fixture closes its dollar quote correctly.
- Worker fixtures persist application-clock nextAttemptAt explicitly, so immediate
  claim assertions do not compare against database-generated clock/precision.
  A new real future-attempt test proves early claims still fail closed.
- The stopped-billing agreement fixture supplies its exact selected policy,
  amounts and complete snapshot rather than an invalid empty object.

Targeted DB verification passes 50/50 across five complete files, including the
new generated-range/base-term/release regression and all seed defensive branches.
Seed coverage remains 100% in every dimension. The complete worker integration
suite passes 6/6 across both files, including restart, real Redis/BullMQ/SMTP,
exclusive leases, stale acknowledgement, five-attempt exhaustion and retained
retry history. These commands finish 9/9 Turbo tasks with exit 0.

Complete DB/API integration and final quality/native validation remain pending;
no whole-system acceptance is claimed from these targeted results. Migration 0040
has only run in disposable test databases so far; populated development data and
all historical SQL bytes remain untouched. NDK transfer resumes valid prior parts.

## Completed source repairs

| Failure                       | Root cause and repair                                                                                                                                                                                                                                                  |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DB TS2345                     | Vitest interprets array test rows as argument tuples. Wrap empty/false query rows in `{ rows }` so the fixture receives the complete row matrix.                                                                                                                       |
| Web visit TS2322              | The throwing deferred callback inferred `() => never`. Explicit `() => void` permits assignment of the actual Promise resolver callback.                                                                                                                               |
| Native visit TS2322           | The same deferred-callback inference, repaired identically.                                                                                                                                                                                                            |
| Intermittent Home link lookup | The broad run missed a link during asynchronous query rendering; the unchanged focused retry passed. Wait for the cheap rendered-text query, then assert the actual link role and exact branch href. Original price, server-call and photo-fallback assertions remain. |
| Web production build          | Previously failed on the Web visit test-type error above. Complete build rerun recorded below.                                                                                                                                                                         |

No production behavior, authorization, financial state, TypeScript strictness,
test deadline, coverage threshold or assertion was removed. The Home assertion
now also verifies the exact destination, rather than only finding a named link.

Modified test files:

- `packages/db/unit/inventory-public-policy.spec.ts`
- `apps/web/src/components/visits.spec.tsx`
- `apps/mobile/src/components/visits.component.spec.tsx`
- `apps/web/src/components/marketplace-home.spec.tsx`
- `apps/mobile/src/components/marketplace/use-marketplace.component.spec.tsx`
- `apps/mobile/src/components/account-stays.component.spec.tsx`

The complete native component run exposed two additional fixture defects. A
pagination test asserted before React Query delivered its observer update; it
now waits for the actual merged hook results, retaining cursor and data checks.
The isolated account/Stay test omitted the Visits mock while mocking sibling
workspaces, unexpectedly mounting a query consumer without its provider. It now
mocks that sibling consistently; dedicated Visits tests still run unchanged.

`packages/db/test/seed-failures.spec.ts` adds real PostgreSQL cases for root-insert
suppression, suppression of each required reference city, and refusal to elevate
an existing unrelated identity. Each injected database trigger is confined to a
transaction in a disposable Testcontainers database. Failed bootstrap must leave
no partial reference rows or authority grants. These tests address meaningful
defensive branches rather than lowering the original 85% integration floor.

## Verification evidence

Pinned tooling: Node 24.22.1, Corepack pnpm 10.18.3. Turborepo runs package tasks.
Memory-intensive quality/build and container integration runs are serialized.
Development supervisors were stopped during production compilation; the existing
infrastructure volumes were preserved and reused.

The first serial run was interrupted without a final exit file; it is not an
overall PASS. The resumed gate records its own complete log and exit status.
An approval-review usage-limit failure temporarily blocked further commands;
work resumed after that limit reset, without bypassing approval review.

| Check                                        | Verified result                                                                                |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Baseline DB type error                       | Reproduced before repair; exit 2                                                               |
| Complete affected DB/Web/Mobile typechecks   | PASS, 3/3 tasks                                                                                |
| Complete API units                           | PASS, 2,090 tests / 194 files                                                                  |
| DB units                                     | PASS, 738 tests / 34 files                                                                     |
| SDK units                                    | PASS, 724 tests / 49 files                                                                     |
| Notifications, files, worker units           | PASS, 174 / 52 / 41 assertions respectively                                                    |
| Complete Web units                           | PASS, 898 tests / 103 files                                                                    |
| Complete mobile units/components             | PASS, 249 unit tests; 299 component tests / 50 suites                                          |
| Final complete serial quality/component gate | PASS, 61/61 tasks; 56 cached, exit 0                                                           |
| Full container integration gate              | NOT PASS: DB/worker failures; API run interrupted before final summary                         |
| Focused migration/seed integration           | PASS, 14/14 tests; seed lines/statements/functions/branches 100%; original thresholds retained |
| Fresh migration checksums/timestamps         | PASS, 40/40 exact matches, zero pending; 72 tables and existing identity retained              |
| Whole-repository Prettier check              | FAIL, 1,893 existing formatting issues                                                         |
| Changed-file formatting                      | PASS; PowerShell parser and JavaScript syntax checks also pass                                 |

The formatting check is read-only. Unrelated recovered source and historical SQL
are not mass-reformatted. Full raw evidence is ignored under `.tools/`:
`stabilization-types-{red,green}.log`, `stabilization-quality.log`,
`stabilization-format-all.log`, and subsequent integration/native logs.
An `.exit.txt` file records each completed command's actual exit code.

No CI PASS is claimed. A selected suite's passing assertions do not constitute a
passing package if its retained coverage threshold fails.

### Additional integration findings

The complete DB suite finishes with **308 passed / 13 failed**, across 42 files
(34 passed / 8 failed). The newly added seed-failure file passes all four cases.
The full failing run does not emit coverage, so the complete migration/seed
coverage verification is recorded separately rather than inferred from counts.

- Ten inventory-release/handoff/occupancy cases raise PostgreSQL 23514,
  `Inventory terms are immutable`, in `hsm_inventory_immutable_terms()`.
  The before-update JSON comparison in migration 0009 requires focused analysis
  of generated columns; this is not a reason to disable the guard or rewrite
  historical SQL. Cancellation, expiry, Stay handoff and checkout acceptance
  remain blocked even if HTTP readiness succeeds.
- `resident-billing-delivery.spec.ts:126` has an unterminated dollar-quoted
  trigger fixture (`$$` opens but `$` closes); its mandatory-audit test cannot
  reach the intended failure injection.
- Two `waitlist.spec.ts` rejection assertions receive resolved empty results,
  at lines 112 and 190. Actual stored state and intended mutation semantics need
  review before classifying or changing the protection. Waiting-list draft work
  is not enabled by this setup.

These newly discovered integration defects are retained as failed acceptance
evidence, not hidden by skipped tests, altered expectations, relaxed thresholds,
database resets or additional historical migration edits. Any database repair
should use an approved additive migration with real regression tests and the
old-dataset reconciliation procedure.

Files integration passes 9/9 assertions across three suites; notifications
integration passes 11/11 across two suites. Worker integration finishes 1 passed /
4 failed across two suites: billing setup raises `Agreement snapshot and selected
facts mismatch`; three outbox lease/retry cases obtain no due claim/attempt.
These require separate fixture/domain-clock investigation and are not repaired by
weakening lease or agreement validation. API integration ended without a final
summary or exit file after 13 completed suites. Five failures were observed:
media-grant revocation, three inventory lifecycle cases, and Owner one-use booking
review. Passing auth/session/manager/branch-scope cases are evidence for those
cases only, not a complete API integration PASS. The interrupted process was not
left running; final focused coverage and development runtime checks are separate.

The final serial gate covers 6,131 unit assertions plus 299 native component
assertions, all package lint/typecheck tasks, server/Web builds and Android JS
export. Its exact command is:

```powershell
corepack pnpm turbo run lint typecheck test build test:components --concurrency=1 --continue=always
```

## Android development workflow

The user selected a physical Android phone. No emulator image is installed.
Windows reports an active hypervisor but Windows Hypervisor Platform is disabled;
no Windows feature, firmware setting or reboot is changed automatically.

Expo's existing `android:prepare --no-install` task succeeds, 13/13 tasks. It
generates only ignored native output. The actual React Native dependency pins:

- Java 17, Android compile/target API 36, build-tools 36.0.0.
- NDK 27.1.12297006; CMake 3.22.1 for native dependencies.
- Generated Gradle wrapper 9.3.1, Android Gradle plugin 8.12.0.
- MapLibre native support, New Architecture and Hermes remain enabled.

JDK 17.0.20.1+1 is installed under ignored `.tools/android` from the official
Temurin archive with its published SHA-256 verified. Existing Java 8 is preserved.
Android command-line tools 19.0, ADB/platform-tools 37.0.1 and pinned Maestro
2.11.0 are installed and their executable versions verified. Official archive
checksums were checked, including the Maestro SHA-256 pinned by existing CI.
Google sdkmanager aborted its first SDK download; a retry stalled and was stopped.
Published-checksum Google archives then installed Platform 36 revision 2 and
build-tools 36.0.0; SDK Manager's installed inventory confirms both and ADB.
The official CMake archive is verified and its executable reports 3.22.1, but
SDK Manager has not registered it as an installed package. NDK 27.1.12297006 is
not installed: the archive transfer and bounded resume both stalled. Incomplete
archives were never extracted or executed. A final official SDK Manager attempt
reported manifest IO errors and remained waiting; it was stopped after five
minutes. No TLS/security setting or antivirus protection was bypassed.

Once the network permits Google package downloads, finish supported package
installation and verify the listed versions before invoking the debug build:

```powershell
. .\infra\android-env.ps1
sdkmanager.bat "--sdk_root=$env:ANDROID_HOME" 'cmake;3.22.1' 'ndk;27.1.12297006'
sdkmanager.bat --list_installed
```

`infra/android-env.ps1` activates workspace-local Java, SDK, Gradle cache and
Maestro paths. Its `-Persist` option configures user environment variables and
preserves existing PATH entries. Dot-source it in a fresh PowerShell so local
JDK 17 precedes a machine-wide Java 8 executable. Do not globally remove Java 8.

`apps/mobile/scripts/android-debug.mjs`, its package script and Turbo task provide
a serial ARM64 debug build with one Gradle worker and a 1,536 MB Java heap. This
is a physical-phone developer APK task, separate from the multi-ABI CI release
acceptance workflow. The wrapper is generated by the existing Expo task.
Syntax/lint and rejection of an inactive toolchain are verified. Gradle dependency
resolution and actual compilation are not verified while the NDK prerequisite
remains missing; native acceptance and Maestro flows have not run.

```powershell
Set-Location D:\hsm
. .\infra\android-env.ps1
corepack pnpm turbo run android:debug --filter=@hsm/mobile --concurrency=1
```

APK status: **not yet built**. A Metro response, native project generation or JS
export is not APK verification. Gradle build, APK signature/ABI checks, installation
and actual native acceptance results must be recorded separately.

For a phone: enable Developer options and USB debugging; connect a data-capable
USB cable; unlock the phone and accept its RSA debugging prompt. Then verify
`adb devices -l`. `unauthorized` requires approval on the phone; no device requires
checking cable/USB mode and the manufacturer's official Windows USB driver.

The connected Pixel 6 Pro was authorized through ADB after the user accepted the
RSA prompt. It reports Android API 37 and ARM64 support. USB reverse mappings for
4000 and 8081 were verified. At the final recheck the phone is disconnected;
reconnect it and repeat the checks/reverses. This is not APK acceptance.

Once exactly one authorized device is present:

```powershell
adb reverse tcp:4000 tcp:4000
adb reverse tcp:8081 tcp:8081
adb install -r apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n pk.hsm.app/.MainActivity
```

Keep the existing localhost API URL with these USB reverses. Repeat reverses
after reconnection. Multiple devices require explicit `adb -s <serial>` selection.
Expo Go is not a supported substitute for HSM's MapLibre native build.

## Migration compatibility and preservation

The new database uses the user-approved parentheses corrections from d56b4b8.
They change five expressions in historical migrations 0009/0022/0027/0030,
without changing journal order, timestamps, guard semantics or financial policy.
No additional historical SQL edits are part of this stabilization task.

The old laptop's database and storage have not been accessed. Its applied hashes,
actual function definitions, data and encryption keys remain unverified. Do not
copy the new laptop's credentials onto the old dataset or overwrite migration
metadata. See [the reconciliation plan](docs/migration-reconciliation-20261023.md)
for backup, exact-artifact comparison, isolated restore rehearsal and approval
before any old-database mutation. Current verification fails closed on a mismatch.

## GitHub synchronization

Read-only `git fetch origin` succeeds; repository connectivity fsck exits 0.
Before stabilization commits, HEAD is d56b4b8 and origin's recovery branch is
75bb501, so the existing environment commit is local-only. No push, merge,
rebase, amend or force push has occurred.

Keep the recovery branch and old-laptop checkout intact. Compare unique commits
and uncommitted work on both laptops before integrating. Preserve an old-laptop
backup/Git bundle and private dataset artifacts first. After review and explicit
user authorization, use a normal push of the recovery branch and a PR into
protected main. If the old laptop has unique work, integrate through a separate
review branch and PR; never overwrite its working tree or reset it to this laptop.

After the agreed revised Phase 1 checkpoint, use `codex/phase2-<ticket>` feature
branches from the reviewed base. Each PR retains SRS requirement IDs. Neither
environment readiness nor this synchronization plan authorizes later product work.

Local stabilization commits (hooks enabled):

- `0896bd9`: ACC-002/VISIT-001 fixture repairs and ADM-002 seed guard cases.
- `98c540a`: physical-device Android environment and serial debug workflow.
- The final documentation checkpoint adds this report and the reconciliation plan.

The full redacted Git-history scan passes across 162 commits after the two source
commits, with no leaks. Their staged hook scans also pass. Final documentation
hook scan and final Git status are checked at handoff; no push is authorized.
`.env`, `.env.worker`, `.tools`, generated native projects, build outputs and
diagnostic artifacts must remain ignored. No credentials belong in this report.

## Final readiness and next actions

Final restart through `infra/dev.ps1 -Action Start -SkipBuild` succeeds after a
normal Docker Desktop restart. Initial Engine queries hung and Compose briefly
returned HTTP 502 during that restart; a clean retry succeeded without resetting
data. Windows dependency watchers caused several cold-start restarts before
stabilizing; early HTTP probes failed, then the final probes all passed.

Verified 2026-10-24 around 01:49 Asia/Karachi:

- PostgreSQL 17/PostGIS, Redis, ClamAV, Mailpit and private S3 are healthy.
- Redis PING, SMTP delivery, Mailpit inbox, API-to-worker encrypted email envelope,
  ClamAV TCP PING and authenticated private S3 put/get/delete probes pass.
  Anonymous bucket access is denied; only the probe's own new object is removed.
- API liveness/readiness/docs, website and Metro respond HTTP 200.
- Root administrator login, authenticated profile and logout return HTTP 200;
  no token, credential or private response is written to this report.
- BullMQ reports a registered worker and a recent completed dispatch job.
- Database verification confirms 40 applied migrations, zero pending, exact
  checksums/timestamps, 72 tables and the existing single seeded identity.

Local URLs:

| Application         | URL                                                         |
| ------------------- | ----------------------------------------------------------- |
| Website             | http://localhost:3000                                       |
| API readiness       | http://localhost:4000/v1/health/ready                       |
| API documentation   | http://localhost:4000/v1/docs                               |
| Metro               | http://localhost:8081                                       |
| Mailpit             | http://localhost:8025                                       |
| Private S3 endpoint | http://localhost:9000 (authenticated, not a public console) |

**Development verdict:** API, website, database and worker are operational for
local development, not release-accepted. Mobile JavaScript development is ready;
native Android APK/testing is **not ready**, pending NDK installation, CMake
registration, Gradle dependency resolution/build and reconnected-device acceptance.
The full integration gate and repository-wide formatting remain non-green.

Start/inspect/stop the complete environment:

```powershell
Set-Location D:\hsm
.\infra\dev.ps1 -Action Start
.\infra\dev.ps1 -Action Status
.\infra\dev.ps1 -Action Stop
```

`Stop` stops the managed application trees and Compose services, retaining all
development volumes. Do not use `docker compose down -v`, volume pruning, database
resets or migration-journal edits. A new terminal can activate Android tools with
`. .\infra\android-env.ps1`; USB reverses must be repeated after reconnection.

Remaining revised Phase 1 dependencies are tracked in
`docs/revised-phase1-progress.md`: unresolved feature/verification work and the
real acceptance gates remain authoritative. Historical Phase 3 source is retained;
disabled features such as visits are not enabled by this stabilization work.
Phase 2 development requires the agreed Phase 1 scope/acceptance checkpoint,
not merely a successful local startup.

Official installation references:

- [Temurin archive installation and checksum verification](https://adoptium.net/installation/archives)
- [Android SDK package manager](https://developer.android.com/tools/sdkmanager)
- [Maestro Windows installation and Java requirement](https://docs.maestro.dev/maestro-cli/how-to-install-maestro-cli)
