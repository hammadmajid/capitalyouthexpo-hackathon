# Phase 1 cross-cutting services

## Transactional audit

AUD-001/004, SEC-003 and ACC-006: AuditWriter accepts a Drizzle transaction,
not a standalone database connection. Hostel, platform and sensitive-access
records use the supplied transaction. Errors propagate; callers must never
catch an audit failure and commit a privileged mutation. Callers must project explicit allowed fields into audit snapshots, excluding credentials and full identity data. Existing append-only
constraints remain in place. Real tests prove commit together, audit failure rollback,
and mutation/audit rollback after a later business failure.

CI PASS: 03eb73e, run 37756053588; 58 real integrations (38 API, 17 database,
three worker), zero skipped. LOCAL PASS: 336 API tests and unchanged coverage gates.
Containers NOT RUN LOCALLY.

## Idempotency foundation (CI verified)

PAY-008: the interceptor is opt-in. Existing authentication routes are not opted in.
A declared mutating handler requires a UUID Idempotency-Key. The actor and endpoint
bind its cache entry; the fingerprint includes the declared scope, actual route
parameters, validated query and logical request body. Object key order is normalized;
array order and value changes remain significant. Nest/Fastify query objects are
validated and cloned before fingerprinting.

The repository locks the active identity, checks its live session, and opens the
business transaction. The interceptor repeats live authorization through repositories
bound to that transaction before looking up a response. A replay cannot bypass revoked
scope. A matching request returns its original validated status/body without executing
the handler. A changed endpoint, branch or payload returns 409 IDEMPOTENCY_KEY_REUSED.
The cache expires at 24 hours; an expired unreferenced entry may be replaced.

Opted-in handlers must use requireTransaction() in their mutation repositories.
Business mutation, audit and cache insert then share one transaction. Responses are
parsed against an explicit DTO schema; credential fields and signed download URLs
are forbidden in stored response snapshots. Failed operations are not cached.
Do not opt credential or temporary-URL endpoints into this mechanism.

Seven real HTTP/concurrency tests cover one concurrent mutation/audit, request and
scope conflicts, actor isolation, expiration, business/audit rollback and revoked
manager/session replay. They run through the existing Turbo integration task and
are NOT RUN LOCALLY. CI PASS: 6504295, run 37759803393, all four jobs; 65 real integrations, zero skipped.

Private storage, audited sensitive disclosure, and generic notification foundation
are still in progress. Existing encrypted email outbox, SMTP adapter, templates,
BullMQ worker and lease/retry infrastructure are reused. No later hostel workflow
or business schedule is introduced by these foundations.

## Private-storage adapter checkpoint

SEC-003: packages/files adds private quarantine uploads, bounded reads, actual MIME
and size validation, server SHA-256, immutable verified snapshots, short attachment
URLs and a fail-closed ClamAV streaming adapter (ADR 0009). Client metadata excludes
server-generated receipt/export purposes. No API route or worker file workflow is
claimed by this adapter checkpoint.

Local unit and contract checks cover malformed metadata/content, size limits,
private ACL/signature options, provider errors and scanner protocol failures.
Four new mandatory Testcontainers checks cover real private S3 uploads, snapshot
immutability and actual ClamAV clean/infected verdicts. They use the unchanged
Turbo integration command and are NOT RUN LOCALLY. New checkpoint CI is pending.
Upload completion, current-lease worker publication, audited downloads and generic
notification integration remain unfinished Task 9 work.

## Persisted private scan processing (Task 9 continuation)

SEC-003 / NTF-002: internal outbox jobs reuse existing worker dispatch, persisted
leases and bounded retries. Scan processing validates the exact bytes and actual
antivirus verdict before writing a private attempt snapshot. File metadata and
outbox acknowledgement share a row-locked transaction; expiry is rechecked with a
fresh clock after lock acquisition (ADR 0010). Stale workers remove only their own
unpublished attempt. Terminal duplicate delivery never deletes the verified blob.

Five new mandatory real PostgreSQL/PostGIS/S3/ClamAV tests cover immutable clean
publication, infection rejection, lease replacement/expiry, row-lock contention and
acknowledgement rollback. These are NOT RUN LOCALLY; new checkpoint CI is pending.
Previous private adapter/MIME checkpoint CI PASS: e1ebb34, run 37768680279.
API file routes, audited downloads and production provider wiring remain pending.

Persisted scan CI PASS: e2db4f2, run 37776121541, all four jobs; 74 real tests,
zero skipped. The lock-wait test executed against actual PostgreSQL. A subsequent
size-error correction distinguishes confirmed oversize content from a provider
outage so scans persist rejection. Existing real bounded-read assertions remain
unchanged. LOCAL PASS: 52 file units and 28 worker units; correction CI pending.

## Private file HTTP and production-provider continuation

SEC-001/003: uploader-only upload, status, complete and download routes use strict contracts, existing authenticated transport and cookie CSRF protections. Identity-first transactions recheck account/session state and scope file row locks. Completion validates actual bytes between two live transactions and persists one deduplicated scan job. Confirmed invalid content commits rejection; missing/unavailable provider content remains pending with safe 503. Clean immutable snapshots require server SHA-256 and transactional sensitive audit before receiving a 60-second URL (ADR 0011).

Production API and worker instantiate the existing S3/ClamAV adapters. Six new mandatory compiled-process tests cover scan/download, concurrent completion, immutable bytes, uploader isolation, size/MIME/infection rejection, audit rollback and immediate suspension/logout denial. These use real PostgreSQL/PostGIS, Redis, SMTP, S3 and ClamAV; NOT RUN LOCALLY. LOCAL PASS: all 31 Turbo tasks, 554 tests; API 100% lines / 99.49% branches,
file service 100% lines/branches/functions. Audit, formatting and migration drift pass.
CI PASS: fc88ba4, run 37800616733, all four jobs; 80 real integrations,
zero skipped. All six new compiled-process file tests passed. Task 9 remains in
progress for the generic notification foundation.

Size-correction CI PASS: e039833, run 37777438691, all four jobs successful. The integration command is now `pnpm turbo run test:integration --concurrency=1` in CI and compatible developer environments; every existing test remains mandatory.

## In-app notification foundation continuation (verification pending)

NTF-002/003: @hsm/notifications adds a transaction-only producer, fixed security
notices, strict ID/event jobs and atomic in-app publication (ADR 0012). The existing
BullMQ dispatcher, leases, retries and dead letters are reused. Publication rechecks
recipient/payload and refreshes expiry after row locking; notification insert and
acknowledgement commit together. Email verification and password reset/change enqueue
notices in their existing identity transactions. Notice content contains no identity
or credentials, and has no arbitrary/dead resource links. Transactional notices are
not subject to promotional preferences. No later domain schedules are added.

Shared-package LOCAL PASS: nine focused Turbo tasks, 36 tests, 100% business code
line/branch/function coverage. Full LOCAL PASS: 35 Turbo tasks, 599 tests; API 100% lines / 99.49% branches,
worker and notification business code 100% lines/branches/functions.
Frozen install, formatting, production audit and migration generation drift pass.
Five new mandatory PostgreSQL Testcontainers tests and added compiled API/worker
in-app assertions are NOT RUN LOCALLY. CI PASS: 3a72d4c, run 37806675279,
all four jobs; 85 real integrations, zero skipped. All five new notification
transactions and compiled account/worker in-app assertions passed. Task 9 COMPLETE. Existing
email/file/auth integration assertions remain. Inbox HTTP/client screens are later
work and are not claimed by this producer/delivery foundation.
