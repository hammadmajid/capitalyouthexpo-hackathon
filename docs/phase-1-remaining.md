# Remaining Phase 1 implementation

Historical checkpoints are preserved below. The revised Phase 1 state and current
verification evidence are in [STATUS.md](STATUS.md) and [ci-verification.md](ci-verification.md).
CHG-006 supersedes the original Task 7/11/12 scope and acceptance status.

Authorized 2026-10-07: implement Tasks 6–13 in dependency order on the existing
feature/phase-1a-foundation branch and PR #1. Preserve successful foundation history;
no Phase 2 property workflows and no rewriting migrations 0000–0002.

| Task | Scope                                                                  | Status                              |
| ---- | ---------------------------------------------------------------------- | ----------------------------------- |
| 1–5  | Existing foundation                                                    | CI PASS at 185418c, run 37619303052 |
| 6    | NestJS/Fastify, configuration, health, security, DB/Redis lifecycle    | CI PASS: 37625583142                |
| 7    | Identity, OTP, passwords, sessions and CNIC protection                 | COMPLETE; CI PASS 37681431187       |
| 8    | Capabilities, authorization matrix, branch/object scope; Q15 spike     | COMPLETE; CI PASS 37692147621       |
| 9    | Transactional audit, idempotency, private storage, outbox/email/worker | COMPLETE; CI PASS 37806675279       |
| 10   | Minimal owner/staff APIs and revocation gates                          | COMPLETE; CI PASS 37816224911       |
| 11   | Next.js foundation and authentication shell                            | In progress                         |
| 12   | Expo foundation and SecureStore authentication shell                   | Pending                             |
| 13   | Sentry and redacted observability                                      | Pending                             |

Each checkpoint requires implementation, tests, documentation, local quality checks,
a normal commit/push and an observed successful CI run before dependent work begins.
LOCAL PASS, CI PASS and NOT RUN LOCALLY are separate evidence categories.
Configured tests alone are never passing evidence.

Task 6 tests cover valid/invalid configuration, request IDs, errors, security headers,
CORS, body limits, development documentation/production gating, health and lifecycle.
Real DB/Redis verification runs through the same pnpm turbo run test:integration command
locally with a compatible runtime or in authoritative Ubuntu CI.

Final Phase 1 gates: direct foreign branch 403; foreign child 404; immediate manager
revocation; refresh reuse family revocation; transactionally atomic audit; full implemented
application stack startup; business coverage >=90% lines /85% branches and overall >=80%.
Phase 1 remains INCOMPLETE until every task and gate passes. Stop before Phase 2.

Task 7 partial checkpoint: credential primitives only; no authentication endpoint is implemented yet. CNIC uses versioned AES-256-GCM envelopes with independent HMAC and encryption keys, domain-separated derived encryption keys and random nonces. JWTs restrict HS256, issuer/audience and expire after 600 seconds. Argon2id uses 64 MiB, three iterations and parallelism one; the real crypto test has a 30-second timeout for slower Windows machines. Session lineage resolution is tested but not yet connected to persisted rotation/revocation. All eight new tests pass locally; API total 50, auth primitives 100% line/branch coverage. Runtime key validation and all auth flows remain pending.

## Task 7 HTTP session transport (2026-10-07)

Continued the existing implementation without replacing its primitives. The application
factory now wires refresh, logout and logout-all routes to the persisted session service
when supplied its authentication dependencies. Explicit SELF routes recheck live account
and session state. Web responses keep access/refresh credentials in HttpOnly cookies;
deployed cookies use Secure, SameSite=Lax, Path=/ and the __Host- prefix. Unsafe cookie
requests require a double-submit CSRF token bound to the refresh credential. Mobile
refresh accepts an explicit body token. Mixed sources and client mismatches are rejected;
a mismatch cannot rotate a session. Responses use Cache-Control: no-store.

New unit/HTTP tests exercise transport boundaries, CSRF, cookie flags and live guard
wiring. Two additional real PostgreSQL/Redis Testcontainers HTTP tests exercise family
reuse and cookie logout. Container checks are NOT RUN LOCALLY; CI verification is
pending for this checkpoint. Runtime main wiring, login, registration, OTP, password
flows and remaining Task 7 acceptance remain in progress. Tasks 8–13 remain pending.
The factory wiring is not yet a claim of complete production authentication.
HTTP transport checkpoint LOCAL PASS: API Turbo lint/typecheck/test/build, 77 API tests,
100% line/branch coverage (auth 97.87% functions), formatting and git diff --check.
Existing lint warnings remain non-blocking. Two new real HTTP integrations are NOT RUN
LOCALLY. Latest prior CI PASS remains 37632579153 at 50f9a2b; new CI is pending.

## Task 7 HTTP session CI evidence and OTP persistence

CI PASS: 37635627934 at 8e35405 passed all four jobs, including all 26 real
integrations (12 API and 14 database/infrastructure), zero mandatory skips. This
proves persisted refresh reuse and cookie/CSRF/logout HTTP behavior through real
PostgreSQL 17/PostGIS and Redis. It does not complete Task 7 or Phase 1.

OTP persistence now uses the existing email_otps and notification_outbox tables.
Codes are cryptographically generated, purpose/identity-bound HMACs, valid ten minutes,
limited to five attempts, single-use and subject to a 60-second resend cooldown.
Only an authenticated encrypted envelope carries the code in the outbox. Failed
attempts commit before errors; OTP consumption, password reset and all-device
revocation share one identity-locked transaction. No SMTP call occurs in a transaction.
Unknown/inactive identities and cooldowns return the same request acknowledgement.

LOCAL PASS: 84 API tests, 100% line/branch coverage, unchanged coverage gates.
Three additional real persistence tests cover concurrent one-time consumption,
reset rollback/revocation and outbox-failure rollback; NOT RUN LOCALLY. CI for OTP
changes is pending. OTP HTTP, registration/login, email delivery and production
runtime auth wiring remain in progress; Tasks 8–13 remain pending.

OTP persistence CI PASS: run 37636714320 at ff20ab5 passed all workflow jobs,
including the new real PostgreSQL OTP/transaction tests. No test skip or gate change.
Registration/login HTTP implementation is now in progress. It reuses existing Argon2,
CNIC, JWT and session policies; registration writes identity/profile/OTP/outbox together.
Password verification is rechecked against the locked identity before session insertion.
Shared strict request contracts now include verification client selection (default mobile).
Real HTTP login→rotation→reuse→protected-rejection tests are added for authoritative CI.
Production runtime wiring and remaining Task 7 acceptance are still pending.
Identity HTTP checkpoint LOCAL PASS: all 15 Turbo lint/typecheck/test/build tasks,
139 local tests (95 API, 34 contracts, six lint-policy and four migration units), API
100% lines and 99.72% branches, auth 100% lines and 99.59% branches. Formatting and
production dependency audit pass (no known vulnerabilities). Four new real identity
HTTP tests and the shared real-container fixture remain NOT RUN LOCALLY; CI pending.

## Task 7 runtime and self identity continuation

CI PASS: 37642024169 at b4e7097 verifies registration, email verification, login,
recovery and the complete login→refresh→reuse→next-request rejection flow against
real PostgreSQL/PostGIS and Redis. Tasks 7–13 are not yet complete.

Production startup now constructs the implemented auth services. Environment validation
requires JWT and independent CNIC keys; test fixtures generate test-only keys. The new
SELF /me endpoint projects only identity fields and masked CNIC, with capabilities
resolved from persisted customer profiles, owned organizations, active branch manager
assignments and active admin grants. Both clients use this identity projection; web login
returns identity/capability metadata with protected cookie credentials. No exclusive role
is inferred from client mode. Local checks and new real /me verification are in progress.
Next Task 7 work: password change, manager activation, auth-specific rate limits,
OpenAPI schemas and email delivery verification. Tasks 8–13 remain pending.

Runtime/self checkpoint LOCAL PASS: all 15 Turbo lint/typecheck/test/build tasks;
149 tests (104 API, 35 contracts, six lint-policy and four migration units). API
coverage is 100% lines / 99.73% branches; auth 100% lines / 99.62% branches.
Formatting and whitespace checks pass. The initial Windows instrumented HTTP startup
exceeded five seconds; aligned its deadline with existing 30-second HTTP tests without
removing assertions. Real /me integration remains NOT RUN LOCALLY; new CI pending.

CI PASS: runtime/self checkpoint 56f1703, run 37657986318, all jobs successful.
Password change implementation now uses existing Argon2id and an identity-locked
transaction to update the password and revoke other devices, preserving the current
session. Strict SELF HTTP contract, credential rejection, real device revocation and
real database rollback regression tests added. Local verification is pending; the new
container tests are NOT RUN LOCALLY. Task 7 and Phase 1 remain in progress.

Password change checkpoint LOCAL PASS: all 15 Turbo lint/typecheck/test/build tasks,
155 tests (109 API, 36 contracts, six lint-policy and four migration units). API
coverage 100% lines / 99.74% branches; auth 100% lines / 99.64% branches; gates
unchanged. Formatting and whitespace pass. Two new real PostgreSQL HTTP/rollback
tests remain NOT RUN LOCALLY; CI pending. Next: manager activation and live manager
phone login, auth-specific rate limits, OpenAPI and worker/email integration.

CI PASS: password change checkpoint 568668a, run 37659854769, including real
device revocation and transactional rollback. Manager activation now consumes the
existing hashed invitation, persists five-attempt locking, checks expiry/scope and
atomically sets the permanent password and revokes prior devices. Phone-only login
requires an active assignment read under the identity lock; it does not grant a
non-manager email-verification bypass. Tests and runtime wiring added; local checks
pending and three new real container tests NOT RUN LOCALLY. Task 7 remains open.

Manager checkpoint LOCAL PASS: all 15 Turbo lint/typecheck/test/build tasks, 165
tests (118 API, 37 contracts, six lint-policy and four migration units). API coverage
100% lines / 99.77% branches; auth 100% lines / 99.69% branches; unchanged gates.
Formatting and whitespace pass. Three real manager tests remain NOT RUN LOCALLY;
new CI pending. Next: auth-specific rate limits, complete OpenAPI schemas and real
outbox/worker/Mailpit email verification before closing Task 7.

Authentication rate-limit continuation: Redis-backed per-IP and per-route normalized
identifier budgets now run before auth handlers. HMAC keys exclude raw identifiers
and IPs; canonical route metadata prevents encoded-path quota bypass. Redis errors
fail closed with 503, exceeded budgets return 429/Retry-After, health is unaffected.
Persisted OTP/invitation suites retain independent attempt checks using explicit
fixture quotas; a separate real Redis HTTP test uses restrictive quotas. Verification
is pending. Manager checkpoint 17055be CI run 37662612940 is still in progress.

CI PASS: manager checkpoint 17055be, run 37662612940, all four jobs successful.
Real manager activation, persistent locking and concurrent consumption are verified.

Auth-rate checkpoint LOCAL PASS: all 15 Turbo lint/typecheck/test/build tasks, 172
tests (125 API, 37 contracts, six lint-policy and four migration units). API coverage
100% lines / 99.57% branches; auth 100% lines / 99.42% branches. Formatting and
whitespace pass; coverage gates unchanged. Dedicated real Redis HTTP quota test
is NOT RUN LOCALLY; CI pending. Next: complete OpenAPI contracts and actual
worker/outbox/Mailpit verification required for Task 7 acceptance.

OpenAPI continuation: strict request bodies derive required/default fields from
shared Zod contracts, and document mobile bearer versus web cookie responses,
masked SELF projection and CSRF requirements. Added metadata/HTTP documentation
regressions; local checks pending. Auth-rate checkpoint ec4c054 CI is pending.

CI PASS: auth-rate checkpoint ec4c054, run 37663974355, all four jobs successful.
OpenAPI checkpoint LOCAL PASS: all 15 Turbo tasks, 176 tests (129 API, 37 contracts,
six lint-policy and four migration units), API 100% lines / 99.59% branches, auth
100% lines / 99.45% branches. Fixed an invalid Swagger private type import through
its public export; no dependency or gate change. Generated documentation now includes
strict inputs, defaults, mobile/web responses, SELF security, CSRF and sanitized
problem+json errors. New CI pending. Task 7 remains open for actual encrypted
outbox-to-worker-to-Mailpit delivery verification; Tasks 8–13 are not complete.

## Task 7 email delivery continuation (2026-10-08)

Real worker/outbox/SMTP delivery is implemented with React Email templates, paired
leases, bounded retries, expired-message rejection and purpose-only worker keys
(ADR 0007). Local 27-task quality verification and 212 tests pass; API line coverage
is 100%, worker/templates/envelope line and branch coverage 100%. Frozen install
and production audit pass. Four new container tests are NOT RUN LOCALLY and CI is
pending. They include compiled API and worker processes against PostGIS/Redis/Mailpit.
Existing tests remain required; additive migration 0003 extends clean replay to four
entries. Task 7 remains in progress until actual CI delivery succeeds. Tasks 8–13
and final full-stack acceptance remain open; green checkpoints are not stopping points.

## Task 7 completion and Task 8 start (2026-10-08)

Task 7 COMPLETE at 11b6e0d, CI PASS 37681431187: 43 real integrations, zero skipped; local 213 tests, 135 API, unchanged coverage gates. Task 8 now implements authorization. Q15 explicitly defers production RLS under ADR 0008; isolated real PostgreSQL spike CI and application authorization remain pending. Tasks 9–13 are not complete.
