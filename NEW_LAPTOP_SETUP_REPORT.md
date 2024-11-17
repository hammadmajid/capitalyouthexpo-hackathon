# HSM new laptop setup report

Date: 2026-10-23, Asia/Karachi. Workspace: `D:\hsm`.
Branch: `codex/recovery-20261023`. Local development only.
Requirements: ACC-001..006, SEC-003, AUTH-C, AUTH-M, ADM-002.

## Configuration completed

- Verified Node 24.22.1, Corepack-pinned pnpm 10.18.3, Docker Engine
  29.9.2 and Compose 5.6.1. The restricted agent shell initially found a
  pnpm 11 fallback; all actual project tasks use `corepack pnpm` instead.
- Started the installed Docker Desktop Linux engine. No graphical action
  was needed during this setup.
- Configured ignored `.env` and `.env.worker`. Only empty secrets were filled.
  PostgreSQL, JWT, CNIC encryption/HMAC, S3 and root-admin passwords use
  cryptographically random local values. Existing nonempty secrets were preserved.
- `DATABASE_URL` matches the local PostgreSQL username, password, database and
  published port. Redis and all private-infrastructure ports bind to loopback.
- Worker database, storage, SMTP and scanner settings match the API settings.
  Its email key is the HKDF email-purpose derivative required by the existing
  API implementation; the worker never receives either CNIC master key.
- Mailpit handles development mail without external SMTP credentials. The
  private S3 bucket uses Versity Gateway, as required by this repository.
- API, worker, storage, seed, web and mobile configuration schemas pass.
  Independent master-key formats and shared worker settings are verified.
- Next.js uses port 3000; `API_PORT` remains 4000. The legacy root `PORT`
  setting was corrected locally so ordinary web startup does not collide with API.
- Optional external telemetry remains disabled. No production account, signing
  credential or provider secret was invented.
- Repaired Next.js development startup: the launcher loads `.env` through
  Node's API before invoking Next, avoiding a forbidden env-file flag in child
  NODE_OPTIONS. Startup previously exited 9; the repaired homepage returns 200.
- Initialized Expo typed-route includes and its generated-file ignore rule.
  Metro runs with development watching enabled rather than CI reload suppression.
- Installed Gitleaks 8.30.1 inside ignored `.tools/bin`, using the official
  release archive and a matching published SHA-256. Git hooks retain their
  required scan and use this workspace copy when no PATH scanner is available.

## Infrastructure and database

| Service                 | Verification                                                       |
| ----------------------- | ------------------------------------------------------------------ |
| PostgreSQL 17 / PostGIS | Healthy; authenticated connection passes                           |
| Redis 7.4               | Healthy; actual PING returns PONG                                  |
| ClamAV 1.5.4            | Healthy; TCP PING returns PONG; signature updates enabled          |
| Mailpit 1.27            | Healthy; SMTP verification, delivery and inbox API pass            |
| Versity Gateway 1.8.0   | Signed bucket/object operations pass                               |
| Storage initialization  | Exits 0; bucket ACL private and browser PUT CORS configured        |
| Private S3 access       | Anonymous bucket listing and existing-object download return 403   |
| Protected worker email  | API encryption, worker decryption/rendering and SMTP delivery pass |

There were no pre-existing Docker containers or volumes before setup. No
developer volume was deleted. PostgreSQL had no application tables or users
before migrations; PostGIS's own reference table was excluded from that check.

All **40 migrations** apply successfully. The final database has 72 application
tables, zero pending migrations, and all recorded migration hashes/timestamps
match the local journal. Required extensions include PostGIS, citext, pg_trgm,
pgcrypto and btree_gist. A second normal migration execution succeeds without
changing the history.

The fresh-database seed succeeds: development geography, amenities and one root
administrator. Root login, authenticated profile read and logout each return
HTTP 200. Retrieve local credentials privately from `.env`; they are not in this
report. Seeding is deliberately not part of everyday startup.

### Approved historical SQL syntax repair

Fresh replay first reproduced SQLSTATE 42601. With explicit user approval,
five CASE expressions in migrations 0009, 0022, 0027 and 0030 were parenthesized
for PL/pgSQL parsing. Financial and inventory guard logic is unchanged. The
failed attempts rolled back; no database was dropped or recreated.

These four historical SQL files now have different checksums. Existing databases
with previously recorded hashes need an explicit reconciliation plan. The local
database helper rejects mismatches; never edit migration metadata to bypass it.
No new product feature, Phase 3 activation or release acceptance is claimed.

## Application verification

| Application     | Result                                                                  |
| --------------- | ----------------------------------------------------------------------- |
| NestJS API      | Running; readiness HTTP 200 confirms PostgreSQL and Redis               |
| BullMQ worker   | Running; startup logs confirm Worker ready                              |
| Next.js website | Running in development; homepage HTTP 200; production build blocked     |
| Expo / mobile   | Android JS export passes; Metro HTTP 200; native Android tooling absent |

Local URLs:

- Website: <http://localhost:3000>
- API liveness: <http://127.0.0.1:4000/v1/health/live>
- API readiness: <http://127.0.0.1:4000/v1/health/ready>
- OpenAPI: <http://127.0.0.1:4000/v1/docs>
- Mailpit inbox: <http://localhost:8025>
- Private S3 API: <http://localhost:9000> (signed access; no storage console)
- Metro status: <http://127.0.0.1:8081/status>

## Tests and builds

Requested checks run through Turborepo with concurrency 2. The first gate stopped
at the existing DB test-type error; a continuation with `--continue=always`
collected the remaining results without removing checks or coverage gates.
The complete gate exits 2: **55/60 tasks pass**, with five failed tasks listed below.

| Check                                   | Result                                                                  |
| --------------------------------------- | ----------------------------------------------------------------------- |
| Server/shared production build          | PASS, initial 10/10 tasks                                               |
| Setup helper lint                       | PASS, zero errors; 13 soft warnings                                     |
| Environment schemas and shared settings | PASS                                                                    |
| Infrastructure smoke checks             | PASS, all six checks                                                    |
| Root login/profile/logout               | PASS, all HTTP 200                                                      |
| Package lint                            | PASS, all packages; web startup-fix lint also passes 10/10 tasks        |
| Package typecheck                       | FAIL: existing DB, web and mobile test-type errors                      |
| Unit suites                             | 6,130 assertions pass, one fails; 13 package gates pass and web fails   |
| Web production build                    | FAIL: existing visit-test TypeScript error                              |
| Android JavaScript export               | PASS, exported to apps/mobile/dist                                      |
| Isolated migration integration suite    | Retry: 10/10 assertions PASS, exit 1 on unchanged branch-coverage floor |

Existing source errors found during environment validation:

- `packages/db/unit/inventory-public-policy.spec.ts:82`: TS2345 test-table
  callback/fixture shape mismatch, also reported at line 83.
- `apps/web/src/components/visits.spec.tsx:227`: TS2322, `void` is not assignable
  to `never`. This also blocks the production web build after compilation.
- `apps/mobile/src/components/visits.component.spec.tsx:185`: the same TS2322
  test callback error.
- Web unit test `marketplace-home.spec.tsx`, "ACC-002: public Home uses approved
  server results and exact prices": cannot find the Fixture hostel link. The
  complete web suite records 897 passing and one failing assertion.

After concurrent checks ended, a focused retry of the unchanged homepage test
file passes all6/6 assertions. It still exits1 on unchanged whole-package
coverage floors because only one file was selected. The complete Web suite was
not rerun and its recorded failure remains part of the full gate result.
Mobile typechecking after Expo generation still reports only the visit-test
callback error above.

Passing unit assertion totals: API 2,090; contracts 940; SDK 724; DB 738;
mobile 249; worker 41; config 174; notifications 174; files 52;
observability 26; UI 19; security 3; emails 3. Web has 897/898 passing.

The isolated migration suite initially hit its existing 60-second container
log-readiness timeout, so none of its ten assertions executed on that attempt.
After broad checks finished, the retry executes all ten successfully, including
reapply, seed idempotency, root limits, audit immutability and manager concurrency.
The selected suite still exits 1: seed branch coverage 83.33%, below the retained
85% floor. This is assertion success, not a complete integration-package PASS.

These unrelated application-test defects are not bypassed or counted as passing.
The complete release, browser/native E2E, authorization/concurrency acceptance,
production deployment and GitHub CI gates are not established by this setup.

## Start, inspect and stop

Open PowerShell in `D:\hsm`. The script selects the pinned pnpm through Corepack,
starts Docker Desktop if needed, checks infrastructure, builds the server
packages, validates configuration/history, applies pending migrations and launches
the four app supervisors in the background.

```powershell
Set-Location D:\hsm
powershell -NoProfile -ExecutionPolicy Bypass -File .\infra\dev.ps1 -Action Start
powershell -NoProfile -ExecutionPolicy Bypass -File .\infra\dev.ps1 -Action Status
powershell -NoProfile -ExecutionPolicy Bypass -File .\infra\dev.ps1 -Action Stop
```

`Stop` terminates only recorded HSM supervisor process trees whose PID and start
time still match, then stops the HSM containers. It preserves volumes and data.
`Start` is idempotent for already-running supervisors. After an already completed
build, `-SkipBuild` avoids the explicit server-build step. Web and Metro still use
their existing development scripts and shared-package dependencies.

Logs and supervisor identity files: `.tools/local-dev/`. Validation evidence:
`.tools/laptop-*.log`, `.tools/laptop-*.json` and corresponding `.exit.txt` files.
These paths are ignored. Do not publish environment files or private diagnostics.

Additional checks:

```powershell
node infra/local-env.mjs
node infra/local-database.mjs
corepack pnpm turbo run lint typecheck test build --concurrency=1 --continue=always
docker compose --env-file .env -f infra/docker-compose.yml ps --all
```

Do not use Compose volume-removal flags, database reset commands or repeated
seeding against an existing dataset. If Docker cannot start automatically, open
Docker Desktop, select Linux containers, wait for Engine running, then retry Start.

## Remaining native and manual requirements

- This laptop currently has Java 8, not the required JDK 17. Install JDK 17 and
  configure JAVA_HOME before native builds.
- Install Android SDK platform/API 36, build-tools 36.0.0, platform-tools and an
  emulator system image, or connect a physical Android device. Configure
  ANDROID_HOME and verify `adb devices`. adb is not currently installed.
- Native acceptance uses Maestro 2.11.0; Maestro is not currently installed.
- The native MapLibre module needs an Android development build. Metro or an
  Android JS export alone does not prove a runnable APK; Expo Go is insufficient.
- The local API remains bound to loopback. After installing adb, USB/emulator
  development can retain the current API URL by running `adb reverse tcp:4000
tcp:4000` and `adb reverse tcp:8081 tcp:8081`. Reapply after device reconnection.
- No production signing keys or paid maps credentials are needed for these local
  services. Release accounts/signing and iOS native builds remain separate work.
- The laptop has about 8 GB RAM. Prefer serial full checks and avoid running
  integration startup during broad tests/builds; the initial isolated test hit its
  existing 60-second readiness timeout under concurrent load.

## Git and scope

Environment files remain ignored and untracked. No push, merge, force push,
production infrastructure change, volume deletion or history rewrite occurred.
The existing revised Phase 1 product scope remains authoritative; this setup does
not implement or approve later-phase features. Setup changes are committed locally
with mandatory hooks; no GitHub push or PR publication is performed.
