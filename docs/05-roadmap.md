# Active execution roadmap (2026-10-28)

Current work is the user-directed AUD-001–015 remediation, followed by Phase 11
Final System Testing & Acceptance. Phases 9 and10 have local implementation
checkpoints from2026-10-27; their historical checks are not final-source acceptance.
Follow [live status](STATUS.md), [audit checklist](audit-remediation-20261027.md)
and [remaining dependency order](audit-remaining-work-20261028.md). Approved later
financial/lifecycle/services decisions are CHG-015/016 in [SRS changes](srs/CHANGES.md).

Finish implementable gaps with focused verification; freeze the intended source
and run one coordinated sequential acceptance campaign. Do not repeat full-package
regressions per finding. Preserve all historical plans and test evidence below.
No Phase12 or deployment is authorized. HostedCI/physical-device/operations evidence
must be recorded as verified, blocked or pending; AUD-003 restart persistence remains
an explicitly accepted exception. Existing deferrals are not silently promoted.

## Superseded active roadmap revision (2026-10-24)

The user-approved [Phase 3 execution directive](phase3-marketplace-execution.md)
supersedes the active numbering below: complete marketplace/setup, booking through
confirmation, visits, chat, waiting lists and their notifications. Critical real
Docker integration is required in Phase 3. Actual admission/check-in is Phase 4.
Preserve historical requirements/source and do not invent remaining allocations
of the 12-phase roadmap. Normal milestone commits and pushes are authorized.

## Superseded active roadmap revision (2026-10-22)

The user-approved [revised Phase1 execution prompt](revised-phase1-execution.md)
supersedes the historical active phase ordering below. Current scope: foundation,
authentication, setup, marketplace, booking through confirmation, visits, chat,
waiting list and their notifications. Check-in/Stay creation is revised Phase2;
container acceptance Phase10; final system acceptance Phase11. Preserve every
historical requirement. Do not infer unspecified remaining 12-phase allocations.
See [implementation checklist](revised-phase1-progress.md).

# 05: Roadmap

A high-level phase plan. Each phase will be broken into tickets later (tagged with SRS requirement IDs). Order follows dependencies: management data must exist before the marketplace can show real availability.

## Phase 0: Planning & documentation ✅ baseline done (remaining items continue in parallel)

- [x] SRS understood, overview written
- [x] Tech stack decided (ADR 0001)
- [x] Docs structure, AGENTS.md, STATUS.md
- [ ] Open questions answered (`04-open-questions.md`)
- [~] Database schema / ERD (`06-database-schema.md`): draft v1, awaiting review
- [~] API contract (`07-api-contract.md` + `api/`): draft v1, awaiting review
- [~] Screen inventory (`08-screens.md` + `screens/`): draft v1; wireframes pending
- [~] Design system (`09-design-system.md`): draft v1 from the user's concept
- [ ] Test plan (`10-test-plan.md`)
- [ ] Deployment detail (`11-deployment.md`)
- [ ] Ticket breakdown for Phases 1–9

## Phase 1: Foundations (historical implementation scope; acceptance remains open)

Approved revision (2026-10-10): [SRS v2.1 supplement](srs/SRS-v2.1-phase-one-supplement.md), CHG-006 and ADR 0020 reopen product acceptance in Tasks 7, 11 and 12. Minimum owner/hostel/main-branch/invitation foundations are now expressly in Phase 1; other Phase 2 work remains deferred. Final splash and two onboarding screens deferred to pre-launch UI polish.

Follow `docs/development-rules.md` for every item. Suggested order: each numbered item is one or more PRs.

1. **Monorepo scaffold:**
   - pnpm workspaces (Corepack-pinned) and Turborepo (`turbo.json`).
   - `.nvmrc`, `.editorconfig`, `.env.example`.
   - `packages/config`: tsconfig strict, ESLint with `max-lines` 300/500, no-`any`, boundaries, security plugins; Prettier.
   - Husky + lint-staged + commitlint.
2. **Local infra:**
   - `infra/docker-compose.yml` with Postgres 17 + PostGIS and Redis.
   - Mailpit for local email (Hostinger SMTP only in staging/prod).
   - An S3-compatible local storage container or a dev R2 bucket.
3. **CI (GitHub Actions):**
   - install (frozen lockfile) → lint → typecheck → test → build.
   - gitleaks, `pnpm audit`, and a migration check.
   - Separate non-container quality checks from real Testcontainers integration on an Ubuntu runner (ADR 0004). No automatic skips or database mocks.
4. **`packages/contracts`:** Zod schemas, shared enums, `Money` (bigint paisa) and date helpers, error codes.
5. **`packages/db`:** Drizzle setup, extensions (postgis, citext, pg_trgm, pgcrypto) and the Phase 1 tables from `06-database-schema.md`:
   - users, customer_profiles, email_otps, sessions, push_tokens
   - organizations, brands, branches, branch_settings, manager_assignments
   - admin_accounts, admin_role_grants
   - files, notifications, notification_outbox, idempotency_keys
   - hostel_audit_log, platform_audit_log, sensitive_access_log

   Then migrations + a seed (cities, a few areas/universities, one root admin from env).

6. **`apps/api` (NestJS + Fastify):**
   - Env validation (Zod), Pino with request ID, problem+json error filter.
   - Helmet/CORS, Redis rate limiter.
   - OpenAPI at `/v1/docs`, health endpoint.
7. **Auth module** (API 01):
   - Register, email OTP, login, refresh rotation with reuse detection, logout/logout-all.
   - Forgot/reset/change password, manager activation, `/me`.
   - CNIC hash + encryption + last4.
8. **Authorisation:**
   - `AuthGuard`, `OwnerGuard`, `BranchScopeGuard`, `AdminGuard` + roles, `StayGuard` stub.
   - A startup check that fails if any route lacks a scope declaration (default deny).
9. **Cross-cutting services:**
   - Audit log writer (same transaction) and the idempotency interceptor.
   - File upload (presign → complete → validate).
   - Notification outbox + `apps/worker` (BullMQ) with the email adapter (Nodemailer/SMTP) and `packages/emails` (React Email: OTP, password reset, manager welcome).
10. **Minimal owner/staff APIs** to prove isolation: current capabilities, owned organization/authorized branch listing and lookup, manager assignment activation/suspend/deactivate (API 05 staff section). CHG-006 supersedes the earlier exclusion: minimum owner profile, hostel/brand, main-branch draft/setup, owner self-management or manager invitation, and verification submission are included in revised Phase 1. Unrelated property operations remain deferred.
11. **`apps/web` skeleton (Next.js):**
    - Tokens from `packages/design-tokens` (09 design system), shadcn/ui setup.
    - Login (W-01), manager activation (W-02), password reset (W-03).
    - Management layout with sidebar + branch switcher (W-06).
12. **`apps/mobile` skeleton (Expo):**
    - Expo Router, NativeWind with shared tokens, secure token storage.
    - Restore session → authenticated experience or Login; email-first registration → OTP → permanent password → experience/profile completion. Shared login, recovery and capability switching retain secure session behavior. Final splash and two onboarding screens deferred to pre-launch UI polish.
13. **Observability:** Sentry wiring (api/web/mobile), structured logs.

**Phase 1 exit criteria (all automated in CI):**

- A manager of branch A gets `403` on every `/manage/branches/{B}` route and `404` on B's child IDs (ACC-002 groundwork).
- Firing or suspending a manager revokes sessions immediately; the next API call fails (MGR-004).
- Refresh-token reuse revokes the session family.
- Audit rows are written in the same transaction as privileged actions.
- Coverage gates met. The complete containerized stack must be successfully verified in a compatible container environment. This may be a developer machine or the project's CI environment. Docker-compatible/container-runtime verification is required; Docker Desktop specifically is not required. Infrastructure-only smoke tests do not satisfy the complete application-stack gate.

## Active execution revision (approved2026-10-17; Phase3 started2026-10-18)

P2-S1..S7 local gates pass. Phase2 is **FEATURE FROZEN / FINAL ACCEPTANCE DEFERRED**.
Current Phase3 follows the user's master prompt and CHG-009/SRS v2.4: resident/stay,
actual occupancy/assignment history, billing/ledger, manual payments/receipts/deposits,
transfer/extension/checkout, My Stay, staff operations, reports and outbox.

- P3-0 architecture audit: complete; reuse existing identity, locks, audit, idempotency,
  outbox, money/dates and inventory claims. No implemented stay/finance tables existed at that audit baseline.
- **P3-1 IN PROGRESS:** resident/stay/history/assignment/policy/agreement and source-linked finance foundations authored through additive migration0028. Shared contracts584/41 LOCAL PASS with100% configured coverage; real SQL execution, replay and constraint acceptance remain unverified. Historical migration files are preserved.
- **P3-2..P3-11 IN PROGRESS:** protected billing-policy and private staff/Customer Stay read APIs, generated SDK helpers and lazy web/mobile Stay views are implemented. Internal agreed-rent/disclosed-fee components share scoped charge/debit/invoice persistence and pass99 DB unit tests (31 new fee cases, all68 prior cases retained), with100% scoped writer/context coverage and8/8 static tasks. Shared fee, database-date and original-agreement grace contracts pass 647 tests/44 suites, retaining pure calendar behavior; invoice/grace DB projection brings the complete DB unit suite to 159/7 at 100% all dimensions across six scoped modules, with static 8/8. Real invoice/grace scenarios remain NOT RUN LOCALLY. These do not enable admission or financial mutation routes. Exact package checks and the active client regression are recorded in STATUS.md.
- **Guarded billing source follow-on (2026-10-20):** metadata/proof/origin foundations extend through additive0034, with explicit user approval for guarded source implementation only. Shared human/system posting validates exclusive attribution and immutable exact origins. Normal DB static8/8 and complete219/9 units pass (100% across seven configured modules); Drizzle has no schema drift. All69 real billing-foundation cases/five suites, clean replay and exact-source CI remain NOT RUN LOCALLY / NOT VERIFIED. No admission/financial route or billing producer is enabled. See STATUS.md and ADR0048 for actual evidence and required worker retry/registry work.
- **Earlier runtime continuation (2026-10-20; superseded by current checkpoint below):** internal atomic billing/retries/initial schedules, private invoice/receipt reads and original-payment-funded apply/deduct/refund source are authored. Complete DB492/21 local units pass with100% configured coverage, including34 Owner-reversal cases. Subsequent guarded notice persistence/calculation is authored and unverified. Receipt contracts740/47, SDK530/37 and static31/31 pass;88 focused read assertions pass but the selected command fails unchanged global coverage. Guarded payment HTTP source composes live dual grants, exact own-proof authorization, authorized idempotency and transactional notices; production main registration remains disabled. Payment static26/26 and notifications75/4 pass; all57 focused payment assertions pass but their selected command fails unchanged whole-package coverage. Full API regression is running; notice/updated-event gates remain pending. Real component/concurrency/rollback/HTTP tests are authored and NOT RUN LOCALLY; exact-source CI NOT VERIFIED. These components do not complete admission, payment-proof approval, lifecycle or full financial UI workflows. See STATUS.md, ADR0054..0060 and API19/API07/API04.
- **Current runtime checkpoint (2026-10-21):** complete DB LOCAL PASS646/26 and static8/8 include admission target/relationship/availability/current agreement validation; all configured DB coverage100%. Contracts757/48, notification76/4 and worker39/6 gates pass for notice source. Full API1,855/176 passes the private reads and guarded payment checkpoint. Admission helpers remain internal;38 new admission PostgreSQL cases and the earlier real integration suites are NOT RUN LOCALLY. Subsequent guarded atomic manual admission and recipient-free source-bound worker delivery pass local static23/23, DB692/29 and notifications149/7 at100% configured coverage, and worker39/6 at100% lines/99.15% branches (ADR0064). Thirteen new manual transaction and six fanout real cases are NOT RUN LOCALLY; full HTTP/session/Manager/idempotency/client and real acceptance remain required. Subsequent initial-period regression and shared public command validation pass complete DB710/30 and contracts794/49 at100% configured coverage, with normal static8/8. Guarded manual-admission HTTP/session/grants/authorized idempotency and ten actual PostgreSQL/Redis HTTP cases are installed (ADR0065); API local verification is running. The production entry point does not register this mutation before actual container gates. Real manual transaction cases now total16; all real cases remain NOT RUN LOCALLY. Phase3 remains IN PROGRESS; exact-source CI NOT VERIFIED.
- **Admission HTTP and review follow-on (2026-10-21; supersedes earlier running API notes):** complete API LOCAL PASS1,921/180 (L/S93.17%,F86.75%,B97.15%), SDK547/38 (L/S99.96%,F100%,B97.61%) and normal static/generation31/31. New explicit-date SDK selectors and staff resident/review/submission components are installed with tests, pending their final local gates. The access-restoration regression reproduced1 failed/13 passed; the unsent-review reset is applied and its uncertain-command preservation case is authored, not yet verified. Forced artifact recovery rebuild13/13 passes after local NUL corruption; no UI pass is inferred. Named target/terms wiring, native admission, booking handoff, other Phase3 workflows and actual container/CI acceptance remain required. Production admission remains unregistered.
- **Next required runtime:** atomic booking/manual admission with claim/history/audit/outbox and required initial financial records, persisted schedules, payments/receipts/deposit/corrections, transfers/extensions/checkout, complete My Stay/staff operations, server dashboards/reports and notifications. These remain required; current reads and persistence components do not complete these workflows.
- P3-12 combined P2/P3 infrastructure acceptance: deferred, NOT RUN LOCALLY.

Preserve old roadmap history below. No online money movement, payroll, attendance,
visitor/complaint/ERP expansion or physical-phone acceptance blocker. See STATUS.md
for exact successful commands and pending work; no phase100% or current CI PASS.

## Revised Phase 2: marketplace, inventory and booking (approved 2026-10-14)

CHG-007 / SRS v2.2 supplement supersedes the split below for current implementation.
P2-A audit; P2-B schema/migrations/contracts; P2-C policy/pricing/inventory;
P2-D scoped management; P2-E public discovery/client Home/map/details;
P2-F availability/holds; P2-G KYC/booking; P2-H customer/hostel booking management;
P2-I real security/integration/concurrency; P2-J coverage/docs/acceptance.
Owner-configurable CNIC is the latest approved choice. See phase-2-implementation.md.
Phase 1 acceptance remains open; no completed-phase claim. No payments/resident
lifecycle/complaints/production/store release. Older phase breakdown is retained
as planning history; included marketplace/booking foundations now belong to Phase 2.

## Phase 2: Hostel setup & verification (web)

Owner onboarding, brand/branch, building/floor/room/seat, pricing (effective-dated), photos, amenities, rules, cancellation policy, branch payment methods, room duplication, CSV import, manager appointment (24h temp password), geography master data, platform verification workflow.

## Phase 3: Marketplace (mobile)

Expo app shell, guest browsing, search (area/university/distance via PostGIS), filters, sort and organic ranking, hostel detail, seat view with photos, favourites, compare, parent share page (web SSR).

## Phase 4: Booking

Booking requests (max 3), approval/rejection, price snapshot, reservations + auto expiry, payment-before-confirmation proof, visits, in-app chat (Socket.IO), waiting list, Bed Board (web), concurrency tests.
**Exit:** ACC-001 passes.

## Phase 5: Resident lifecycle

Check-in (atomic), Upcoming → Active Hostel, walk-in residents with identity linking, transfers, resident record and documents, agreements.

## Phase 6: Rent & finance

**Before starting:** decide rent proration (Q3).
Invoice engine (scheduled), Pay Rent flow, proof upload, approval split-view queue, receipts (PDF), Rent Board, reminders, security deposits, late fees, discounts, advance balances, collection summary.
**Exit:** ACC-004 passes.

## Phase 7: Resident services & closure

Mess/menu, transport, complaints with reopen, checkout + deposit settlement + final statement, verified reviews + replies.

## Phase 8: Dashboards, reports, platform admin

Owner + Manager dashboards and action queues, reports + CSV/PDF export, admin hierarchy (root cap), moderation, support tickets, announcements.
(Subscriptions removed from MVP: CHG-003.)

## Phase 9: Hardening & launch

Security review, penetration test of the authorisation matrix, performance targets, backup **restore drill**, accessibility pass, Play Store release (iOS after), staging → production cutover.
**Exit:** ACC-001..004 and ACC-006 pass (ACC-005 deferred with subscriptions); no critical defects open.

## Post-MVP (not scheduled)

**Branch subscriptions & billing** (SUB-*, BRN-003..006, Billing Admin, ACC-005; CHG-003), SMS/WhatsApp OTP + mobile verification (CHG-002), iOS store release (if not in Phase 9), auto-verified rent payments (PAY-010), Urdu UI, subordinate staff roles, Root MFA, more cities.
