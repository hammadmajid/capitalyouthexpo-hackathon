# ADR 0052: Owner-controlled immutable charge catalogue configuration

- Status: implementation in progress; local and real acceptance pending
- Date: 2026-10-19
- Refs: CHG-009/010/014, SRS v2.9, FIN-004, RENT-003, AUD-004, ACC-004, ADR0044

## Decision

Activate configuration over the existing resident_charge_catalog model and its
immutable-history guards. Owners create a distinct immutable entry with controlled
code, description, unit label and positive integer-paisa unit price. A changed
price requires a new record/code and explicit agreement amendment; no edit endpoint
rewrites a referenced price or an existing agreement. Archive retains the record
and the existing guard denies new custom postings against archived entries.
Existing posted charges, invoices and receipts remain retained.

Read access requires owning Owner or an active assigned Manager with finance_view.
Only the owning Owner may create/archive; Manager grants cannot elevate this.
Every lookup is branch scoped, child guesses are opaque404, and writes revalidate
live authority before idempotency replay. Use existing transactional idempotency,
actor/hierarchy locks, integer money helpers and mandatory hostel audit. Failure of
audit rolls back catalogue mutation and idempotency response. There is no generic
ledger write, free-form arbitrary fee, payment approval or money transfer here.

Collections use bounded UUID keyset pagination with exact continuation and explicit
archive visibility. Responses are private/no-store and contain no resident identity,
private document, payment proof or credential. SDK generation follows the actual
OpenAPI document; clients are not an authorization boundary.

## Migration and acceptance

SRS v2.9/CHG-014 records the explicit resource authorization before activation.
No physical migration or historical rewrite is necessary: the current schema already
has scoped identity, unique branch/code and immutable/retain guards. Preserve all
migration history. Contract, unit, HTTP authorization/idempotency and real PG/Redis
concurrency/audit-rollback cases are required. Record actual results in STATUS.md;
this ADR does not claim a working endpoint, final phase completion or CI PASS.

Local contract checkpoint: complete683 tests/45 suites, all coverage100%, static5/5. Seven real HTTP/PG/Redis cases are authored, NOT RUN LOCALLY. API/SDK static, generated-client and full regression checks remain pending.

Normal dependency-aware API/SDK static resume passes31/31, including OpenAPI and client generation plus SDK strict checks/build. The initial helper import failure was corrected; the intermediate retry was interrupted by an OS restart, not passed. Current unit/HTTP and real acceptance remain pending.

Command-boundary follow-on: focused RED11failed/35passed reproduced invalid authoritative mutation responses being reported as client400 errors. Inputs/key are now parsed before execution; execution-time schema failures become INTERNAL500 without a cached success. Fixed five-suite assertions pass78/5, while the selected command fails unchanged whole-package coverage. A stored-replay corruption case is added; full current API regression/static verification remains required. Web Owner/read-only Manager controls and ten UI cases are authored; first six focused assertions pass but whole-package coverage fails because other producers are excluded. These are diagnostic results, not final acceptance.

2026-10-20: normal API/SDK/Web/mobile static gate passes40/40, including the response correction and Web controls, production Web build and Android export. Full API/Web/mobile Vitest regression is running serially; no result yet. Native Jest and real infrastructure acceptance remain required.

Complete Web700/87 passes all configured coverage gates (L/S/F100%, B99.2%), including all ten catalogue cases; complete mobile Vitest228/20 also passes. Full current API is running. Real PG/Redis and exact-source CI remain unverified.

Complete current API1640/163 passes configured coverage (L/S92.75%, F86.14%, B96.95%), including all79 catalogue cases and linked-Stay scope fixes. Combined serial API/Web/mobile Vitest gate passes3/3 in47m13s. Native full Jest, real integration and CI are still required; Phase3 is not complete. A separate existing SDK billing-settings response-binding defect is under regression work and is not part of this catalogue acceptance claim.

2026-10-20 native catalogue checkpoint: complete mobile unit248/21 and native247/44 pass their configured gates; normal dependency-aware cross-client static40/40 includes Android Hermes export8.6MB. This verifies the native catalogue controls, not an APK/device, real PostgreSQL/Redis or CI. Subsequent native billing-policy/shared-form work is a separate unverified extension.
