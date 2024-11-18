# Development Rules (mandatory)

These rules apply to **every developer and every AI agent**, on every change. A PR that breaks a rule is not merged.
If a rule must be broken, record why in the PR and get explicit approval. A permanent exception needs an ADR.

---

## Current execution scope (2026-10-28)

AUD-001–015 remediation precedes the coordinated Phase11 acceptance campaign.
Use focused verification while implementing, then freeze source and run the
mandatory full gates sequentially. Historical milestone evidence is retained;
it does not certify changed source. See [roadmap](05-roadmap.md) and
[audit inventory](audit-remaining-work-20261028.md). No Phase12 or deployment.

## 1. Tooling

| Rule                           | Detail                                                                                                                                                                                                            |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Package manager: pnpm only** | Pinned through the `packageManager` field in the root `package.json` and enabled with Corepack. Never run `npm install` or `yarn`. Only `pnpm-lock.yaml` may exist; CI fails on `package-lock.json` / `yarn.lock` |
| **Monorepo: Turborepo**        | Every task runs through `turbo` (`pnpm turbo run build lint typecheck test`). Tasks declare `dependsOn`, `inputs` and `outputs` in `turbo.json` so caching is correct                                             |
| **ORM: Drizzle only**          | Schema and migrations live in `packages/db`. No other ORM or query builder. See §3                                                                                                                                |
| Node                           | Active LTS, pinned in `.nvmrc` and `engines`                                                                                                                                                                      |
| TypeScript                     | `strict: true`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `exactOptionalPropertyTypes`. Shared configs in `packages/config`                                                                               |
| Lint / format                  | ESLint (typescript-eslint strict + security plugins) + Prettier. Lint errors fail CI                                                                                                                              |
| Git hooks                      | Husky + lint-staged: format + lint on staged files; commitlint on messages                                                                                                                                        |
| Dependencies                   | Add with `pnpm add --filter <pkg>`. Shared versions go through the pnpm `catalog:`. Check licence and maintenance before adding a new dependency                                                                  |

---

## 2. Code standards

### File & function size

- **Target ≤ 300 lines per file. Hard limit 500 lines.** Enforced by ESLint `max-lines` (warn 300, error 500, blank lines and comments excluded).
- Exempt: generated files (OpenAPI client, Drizzle migrations), seed data, test fixtures.
- Functions should stay under ~50 lines (`max-lines-per-function` warn 60), with cyclomatic complexity ≤ 10.
- When a file grows, **split by responsibility**, not by line count: e.g. `booking.service.ts` → `booking-request.service.ts` + `booking-expiry.service.ts`.

### Structure

- **Apps never import from other apps.** Shared code goes in `packages/*`. Enforced with an ESLint boundaries rule.
- **Backend (NestJS)**, one module per domain (see `docs/02-architecture.md`):
  - `*.controller.ts`: HTTP only. Validate input, call the service, map output. **No business logic, no DB access.**
  - `*.service.ts`: business rules and transactions.
  - `*.repository.ts`: all Drizzle queries for the domain. Services never build queries inline.
  - `*.dto.ts` / Zod schemas from `packages/contracts`. Never return DB rows directly; map to response DTOs.
  - `*.policy.ts`: authorisation rules for the domain.
- **Web (Next.js)**: feature folders (`app/(management)/bed-board/...`). Server state through TanStack Query. Components stay small, with logic in hooks.
- **Mobile (Expo)**: feature folders under `src/features/*`. Screens compose components. Tokens are kept in `expo-secure-store`, never AsyncStorage.

### TypeScript & style

- **No `any`** (`@typescript-eslint/no-explicit-any: error`). Use `unknown` + narrowing. No `@ts-ignore`; `@ts-expect-error` only with a reason.
- Validate every external input with **Zod**: HTTP bodies, query params, env vars, webhook/queue payloads, file imports.
- Env vars are parsed once at startup by a Zod schema. The app refuses to start on invalid config.
- Money: `bigint` paisa for domain arithmetic and persistence, through the shared `Money` helpers in `packages/contracts`. JSON uses validated safe integer paisa through explicit transport helpers (API contract §1, ADR 0003). **Never floating-point money arithmetic.**
- Dates: store UTC (`timestamptz`), display in `Asia/Karachi` through the shared date helpers.
- Naming: `camelCase` variables/functions, `PascalCase` types/classes/components, `kebab-case` files, `SCREAMING_SNAKE` constants. Names describe intent; no abbreviations like `bk`, `res2`.
- Errors: throw typed domain errors (`SeatUnavailableError`). A global filter maps them to HTTP responses. Never leak stack traces or SQL to clients.
- Logging: Pino only, structured, with a request ID. **No `console.log`** (lint error). **Never log** passwords, OTPs, tokens, CNIC, full phone numbers or payment proofs.
- Comments explain _why_, not _what_. Every business rule in code references its SRS ID: `// BKG-004: price locked at request time`.
- No dead code, no commented-out code, no TODO without a ticket reference.

### Git workflow: commit & push every change (mandatory)

- **Every change, however small, is committed and pushed to GitHub immediately.** This applies to developers, Claude, Codex and any other agent. Uncommitted or unpushed work is not allowed to sit locally. End every work session with `git status` clean and the branch pushed.
- One logical change per commit (small, atomic). Don't batch unrelated changes.
- **Conventional Commits** with the SRS ID where relevant: `feat(bookings): enforce max 3 active requests (BKG-001)`, `docs(schema): add credit_ledger`.
- Branches:
  - **Phase 0 (planning, docs only):** docs commits may go straight to `main`.
  - **From Phase 1 (code), which is now active:** work on `feat/<ticket>-short-name`, `fix/…`, `chore/…`, `docs/…`. Push the branch after every commit and keep a PR open into `main`.
- `main` is protected once code starts: CI green + 1 review, no direct pushes, **no force-push**.
- Pre-commit hooks (lint, format, gitleaks) must pass. **Never `--no-verify`.**
- **Never commit** secrets, `.env*` (except `.env.example`), credentials, build output, `node_modules`, or OS junk (`.DS_Store`, `._*`).
- If a push fails (conflict, hook), fix it and push again before doing anything else. Never leave the remote behind local.
- AI agents add their co-author trailer to commits.
- Keep PRs small (aim < 400 changed lines, excluding generated files).

---

## 3. Database rules (Drizzle + PostgreSQL)

- The schema follows `docs/06-database-schema.md`. Any change to it updates that doc **in the same PR**.
- Migrations: `drizzle-kit generate` only, committed and reviewed. **Never edit a migration that has run anywhere shared.** Never use `drizzle-kit push` against staging or production.
- Migrations must be backward compatible (expand → migrate → contract) so deploys don't break running code.
- All queries go through Drizzle. Raw SQL only via Drizzle's `sql` tagged template (parameterised). **String-concatenated SQL is forbidden.**
- Multi-record operations (check-in, checkout, transfer, payment approval, booking confirm) run in `db.transaction()` and lock rows (`.for('update')`) where seats or invoices change.
- Every query on branch-owned data filters by an **authorised** `branch_id` (taken from the guard context, not the client).
- Money columns use `bigint({ mode: 'bigint' })`.
- No hard deletes on referenced records: set `archived_at`.
- Add an index for every FK and for every new query pattern on a large table. Check with `EXPLAIN` for search and board queries.

---

## 4. Security rules (all mandatory)

### Authentication & sessions

- Passwords: **argon2id**, min length 8, checked against a breached/common password list. Never stored or logged in plaintext.
- Email OTP: hashed, 10-minute expiry, max 5 attempts, 60 s resend cooldown (ADR 0002).
- Manager temp password: single-use, 24 h, hashed, rate-limited, never shown again (AUTH-M-003).
- Access JWT ~10 min; refresh tokens rotated and stored hashed in `sessions`. Reuse of an old refresh token revokes the whole session family.
- Revoke sessions on password reset, manager suspend/fire and account suspension.
- Web: tokens in `HttpOnly; Secure; SameSite=Lax` cookies + CSRF protection. Mobile: tokens in `expo-secure-store`.

### Authorisation (SEC-001, ACC-002, ACC-003)

- **Default deny.** Every endpoint declares its required role/scope. An endpoint with no declaration fails a startup check.
- **Branch scope guard** on every management endpoint: resolve the resource's `branch_id` server-side, then check owner ownership or an active manager assignment. Never trust IDs from the client.
- Object-level checks on every read and write (no IDOR). Customers access only their own bookings, stays, invoices, proofs and chats.
- Hidden UI is never authorisation. Assume every endpoint is called directly.
- Public/marketplace endpoints use dedicated DTOs that **cannot** contain occupant identity or rent state (BR-05).
- Sensitive fields (CNIC, permanent address, guardian data, documents, payment proofs) are only returned to authorised roles, masked by default (CHG-004), and their access is logged in `sensitive_access_log`.

### Input, output & web

- Zod validation on all inputs. Reject unknown fields (`.strict()`).
- Parameterised queries only (Drizzle). No dynamic SQL identifiers from user input.
- Output encoding: React escapes by default. **`dangerouslySetInnerHTML` is forbidden** unless sanitised with DOMPurify and reviewed.
- Security headers via Helmet: CSP, HSTS, X-Content-Type-Options, frame-ancestors none, Referrer-Policy.
- CORS: explicit allow-list of origins per environment. Never `*` with credentials.
- **Rate limiting** (Redis-backed) on login, OTP, password reset, temp-password activation, proof upload, chat, reports and support. Plus a global per-IP limit.
- Request body size limits; pagination is required on every list endpoint (max page size enforced).

### Files

- Check MIME by magic bytes (not the extension), plus a size limit and an extension allow-list. Rename to random keys and strip EXIF from public photos.
- Sensitive files go in the **private bucket** only, served by short-lived signed URLs after an auth check.
- Chat/complaint attachments are not delivered until the scan status is `clean`. Executables are always blocked.

### Secrets & infrastructure

- Secrets come only from environment variables, never committed. `.env.example` lists the keys with no values. CI runs **gitleaks**.
- The mobile app contains **no secrets** (anything in the bundle is public).
- DB and Redis are not exposed publicly. The app DB user has least privilege (no DDL; insert/select only on audit tables).
- TLS everywhere (Caddy). Encrypted, off-site backups with a tested restore.

### Dependency & code scanning (in CI)

- `pnpm audit --prod` (fail on high/critical), Renovate/Dependabot for updates.
- CodeQL / Semgrep static analysis.
- `eslint-plugin-security` and `eslint-plugin-no-secrets`.
- Container image scan (Trivy) before deploy.

### Audit

- Every privileged action writes `hostel_audit_log` / `platform_audit_log` **in the same transaction** (ACC-006). A test asserts this for every privileged endpoint.

---

## 5. Testing rules (all mandatory)

> Tests cannot prove "zero bugs". What we guarantee: every rule in the SRS has a test, and nothing merges or deploys unless all tests pass.

| Level                    | Tool                                                          | What                                                                                                                                                          | Where                         |
| ------------------------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| **Unit**                 | Vitest                                                        | Pure logic: money math, rent/late-fee calculation, state machines, Rent Board status, validators, policies                                                    | Next to the code: `*.spec.ts` |
| **Integration**          | Vitest + **Testcontainers** (real Postgres + PostGIS + Redis) | Services + repositories against a real DB: transactions, constraints, row locks, migrations                                                                   | `apps/api/test/integration`   |
| **API / contract**       | Supertest + OpenAPI schema validation                         | Every endpoint: success, validation errors, 401, 403, 404; responses match the OpenAPI spec                                                                   | `apps/api/test/api`           |
| **Authorisation matrix** | Vitest, table-driven                                          | Every endpoint × every role (guest, customer, resident, owner, manager of another branch, each admin role) checked against `docs/01-roles-and-permissions.md` | `apps/api/test/security`      |
| **Concurrency**          | Integration, parallel requests                                | Two check-ins/bookings on one seat → exactly one succeeds (ACC-001); double approve → one receipt (PAY-008)                                                   | `apps/api/test/concurrency`   |
| **Web E2E**              | Playwright                                                    | Critical flows: owner setup → manager appointment → booking approval → check-in → proof approval → receipt; Bed Board; Rent Board                             | `apps/web/e2e`                |
| **Mobile E2E**           | Maestro                                                       | Signup + email OTP, search, seat view, request booking, Pay Rent proof upload, complaint, checkout                                                            | `apps/mobile/e2e`             |
| **Component**            | Vitest + Testing Library (web), RNTL (mobile)                 | Components with logic, forms, status badges                                                                                                                   | Next to components            |
| **Accessibility**        | axe (Playwright)                                              | Main web flows: labels, keyboard, contrast, status not by colour only                                                                                         | `apps/web/e2e`                |
| **Security**             | OWASP ZAP baseline (staging), gitleaks, audit, CodeQL         | Common web vulnerabilities, secrets, vulnerable dependencies                                                                                                  | CI + nightly                  |
| **Performance**          | k6                                                            | Marketplace search, Bed Board, Rent Board, proof approval queue under launch load                                                                             | Before release                |
| **Migration**            | CI job                                                        | Migrations apply on an empty DB and on a copy of the previous schema                                                                                          | CI                            |
| **Backup restore**       | Scripted drill                                                | Restore the latest backup into a scratch DB and run smoke tests                                                                                               | Before go-live, then monthly  |

### Testing rules

- **Coverage gates (CI fails below):** domain/business logic (`apps/api/src/**/domain`, services, policies, `packages/contracts`) **≥ 90% lines / 85% branches**; overall ≥ 80%.
- **Every bug fix starts with a failing test** that reproduces the bug.
- **Every SRS rule a change implements has a test** that names the ID: `it('BKG-001: rejects a 4th active booking request')`.
- The acceptance gates **ACC-001…ACC-006 have dedicated test suites** that always run in CI and block release.
- Never mock the database in integration tests (Testcontainers). Mock only external providers (SMTP, push, storage) through their adapters.
- The complete containerized stack must be successfully verified in a compatible container environment. This may be a developer machine or the project's CI environment. Docker Desktop specifically is not required. Local absence of a runtime never permits weakening, removing, skipping or falsely passing integration tests.
- Report **LOCAL PASS**, **CI PASS** and **NOT RUN LOCALLY** separately. CI PASS requires a successful actual GitHub Actions run; configuration or local static validation is insufficient.
- Tests are deterministic: no real time (fake clocks), no real network, no shared state between tests, seeded factories for data.
- Flaky tests are fixed or quarantined within 24 h with a ticket; they are never ignored.

---

## 6. CI pipeline (every PR)

`install (pnpm, frozen lockfile)` → `turbo lint` → `turbo typecheck` → `turbo test` (unit + integration + API + security + concurrency) → `coverage gate` → `build` → `migration check` → `gitleaks + pnpm audit + CodeQL` → E2E (Playwright) on the main branch / release.
**Any red step blocks the merge.**

The implemented foundation workflow separates `quality` (frozen install, lint, typecheck,
unit/contracts tests, coverage, build, migration drift, audit) from `container-integration`
(Ubuntu, real Testcontainers PostgreSQL 17/PostGIS, Redis and Compose smoke checks).
Both local container-capable environments and CI run `pnpm turbo run test:integration`.
Security scanning jobs remain required. New API/database, authorization and transactional
suites must be attached to that integration task as implemented; absent suites cannot
satisfy Phase 1 exit gates. See `docs/ci-verification.md` for current coverage and gaps.

---

## 7. Definition of Done (every ticket)

- [ ] Meets the SRS requirement(s) and cites their IDs
- [ ] Authorisation + branch scope checked and tested (positive and negative)
- [ ] Input validated, errors typed, nothing sensitive logged
- [ ] Unit + integration/API tests written and passing; coverage gate met
- [ ] Audit log written for privileged actions
- [ ] No file over 500 lines; lint and typecheck clean
- [ ] DB changes: migration generated + `docs/06-database-schema.md` updated
- [ ] API changes: OpenAPI updated, client regenerated
- [ ] `docs/STATUS.md` updated
- [ ] **Committed (Conventional Commit) and pushed to GitHub**; working tree clean
