# Revised Phase 2 implementation checkpoint

## P2-A pre-implementation audit (2026-10-14)

Root E:/hsm-git; feature/phase-1a-foundation; HEAD cbd9a66. Preserve the existing
16 modified/nine created login files and unrelated untracked file without accessing
its contents. Nothing staged. Tracked source integrity scan: no zero-byte source/NUL
corruption. Original seven SQL migration hashes recorded in .tools/phase2-audit.json.
No initial migration/client/lockfile/Android drift. Existing PR #1 remains unmerged.

Reuse shared Zod/money/dates/errors, typed generated client, @hsm/ui scoped tokens,
SecureStore/session manager/restore, cookie/CSRF proxy, live capabilities and default-
deny BranchScope. Reuse lockActor, AuditWriter, transaction-bound idempotency,
private files/scanning and BullMQ outbox. Reuse organizations/brands/branches and
places (university/office directory with PostGIS); no parallel hostel/institution
identity. Room/seat/favorite/booking tables are design-only, not implemented yet.

## Minimal staged implementation plan

P2-B: additive room type/room/seat/amenity/policy/media/favorite/hold/booking/claim/
KYC models, scoped composite FKs, snapshots, Drizzle migrations and shared contracts.
P2-C: policy inheritance/bounds, bigint quotes, half-open ranges and inventory
conflicts, database exclusion guard for room/bed overlap, immutable snapshots.
P2-D: BranchScope management repositories/services/controllers, further-restricting
Manager grants, private listing/media and room/bed/policy/block editing.
P2-E: public approved-only DTOs/search/filters/map/university directory, Saved and
real-data Home/details on web/mobile with safe auth return and fixed native tabs.
P2-F/G/H: expiry/outbox workers; actor-bound holds; KYC; atomic quote/booking/approval/
cancellation; My Bookings and scoped management/history.
P2-I/J: real migration/constraint/replay/seed/concurrency/privacy/scope and browser/
native suites; exact-source aggregate coverage and review-ready final report.

No auth/session rewrite, historical migration edit, global recolor, dependency
upgrade, automatic commit/push, final APK/install or production launch. New runtime
is included by existing aggregate discovery; no tests/gates/timeouts weakened.

## Risks and remaining evidence

Phase 1 acceptance remains open (browser/native failures, hosted telemetry and
merge protection). Windows has no Docker; authoritative container acceptance is
CI/compatible runtime only. Approved marketing hero photo still needed; do not
fake it. Platform limits/defaults must be supplied explicitly, not copied from
illustrative examples. Online payments and financial verification stay out of scope.
Latest KYC choice: Owner may make CNIC optional, superseding earlier answer.

## Current result

P2-A complete. P2-B/C/D/F/G/H implementation in progress. Additive Drizzle tables
and generated migrations 0007-0012 cover physical inventory, explicit policy versions,
controlled fees/amenities, publication/favorites, holds, bookings, private evidence,
status history and inventory claims. Custom 0009 adds GiST overlap exclusion,
source/claim consistency, immutable terms, capacity, request cap and hold lineage.
Original 0000-0006 hashes remain unchanged. These PostgreSQL guards are NOT RUN LOCALLY.

Root/Owner/branch/type policy mutation routes validate full inheritance against
explicit operator limits; no production booking defaults are seeded. The latest
contracts add allowed duration units, evidence reuse/review and active-hold limits.
Inventory, quote, hold, booking and lifecycle repositories/routes are wired to live
actor locks, transaction-bound idempotency and audit. Expiry works in a successful
booking transaction and the existing worker dispatch loop; no client timer is trusted.
Public marketplace/search/directory/media projection is being connected. Marketing
hero photo remains pending; no fake listings, photos, counts or payment state added.

Earlier policy/pricing/availability contract checkpoint passed six Turbo tasks and
100% coverage; newer contracts and runtime are pending renewed exact-source checks.
Initial DB schema checkpoint passed lint/typecheck/build and seven preserved unit
cases. A subsequent build detected a stale contract artifact while implementation
continued; a fresh run is required, and no broader PASS is claimed. New real
Testcontainers inventory/concurrency/expiry tests are written but NOT RUN LOCALLY.
UI, generated-client refresh, full integration, scoped/aggregate coverage, browser/
native acceptance and exact-revision CI remain pending. No Phase 2 completion claimed.

### CHG-008 continuation, 2026-10-15

Owner-only pre-confirmation evidence access is approved and versioned (SRS v2.3,
ADR 0028). An audited Owner-only private download route is authored with live
identity, exact branch/customer/file scope, scan/digest checks and expired-request
rejection. Managers retain status-only summaries before confirmation, regardless
of review grant. Unit denial/audit/storage-error tests and a real PostgreSQL/S3
HTTP test are authored. Focused sensitive-policy assertions passed 10/10; its
single-suite command failed aggregate coverage and is not a package-gate pass.
Full backend verification is in progress. Container tests NOT RUN LOCALLY;
no new CI PASS. Fresh evidence submission/review/consumption and client wiring
remain incomplete; this does not mark Phase 2 complete.

### Next evidence lifecycle slice (CHG-008, BKG-001..009, SEC-003)

Reuse booking_documents and the Phase 1 private upload/scan pipeline. Add additive
consumption metadata, preserving existing migrations and immutable historical
review provenance. Implement self-scoped submission/status and Owner-only review
metadata/content/actions; Managers retain booking verification states only before
confirmation. Recheck live authorization on idempotent replay and audit decisions
in the booking transaction. Scope evidence by customer, branch, kind and clean
private file; do not carry rejected or foreign evidence into confirmation.

Fresh review must work when automatic evidence reuse is disabled. Consume fresh
evidence transactionally, including rollback and concurrent-request tests. Keep
file cleanliness distinct from human identity review, avoid requiring unnecessary
reuploads, and preserve explicit re-verification history. Resolve review ordering
fail-closed when timestamps tie. Add real PostgreSQL/HTTP ownership, replay,
rejection, expiry and consumption tests; none can be marked passed from unit doubles.

Current verified checkpoints: 923 API tests, 260 contract tests, 131 SDK tests;
34-task mobile check including 212 unit/107 component tests; web 277 assertions
and production build passed, with the final 34-task web check complete. These
local results do not complete the remaining lifecycle or infrastructure gates.

### Document workflow routes and consumption (2026-10-15)

Submission/own-history and Owner queue/review routes are now authored and wired
with explicit sharing consent, no-store responses, bounded scoped cursors, clean
private file checks and live authorization before replay. New shared DTOs keep
Owner queue metadata free of customer/file identifiers. Fresh approval can be
consumed once when policy reuse is disabled; accepted provenance is copied into
the booking snapshot and the source's conditional consumption/audit joins the
existing booking transaction. Final reviews remain immutable. SDK helpers are
authored; generated-schema refresh and client verification are pending.

LOCAL PASS checkpoint: 17-task initial route compilation/typecheck chain;
latest focused 16 selection/projection assertions. The filtered command failed
aggregate coverage and is not a package PASS. API lint/typecheck completed with
zero errors; full API coverage run is in progress. Three real HTTP workflow cases
are authored, including Owner/Manager boundaries, replay, one-use source, foreign/
unscanned evidence and rejection. NOT RUN LOCALLY: real PostgreSQL/S3 integration,
rollback and concurrency. No new CI PASS, final APK or Phase 2 completion claim.

LOCAL SDK checkpoint: 10 generation/dependency tasks passed, then all four focused
SDK lint/typecheck/test/build tasks passed (137 tests/16 suites; 97.85% lines,
94.90% branches). Document helpers have 100% measured coverage. Owner selected-
branch review UI and five component cases are authored; full web verification is
running. Real container acceptance remains NOT RUN LOCALLY, and no CI PASS is claimed.

## Continuation checkpoint, 2026-10-16

This supplements the historical slices above; Phase 2 is still in progress.

| Surface                   | Implemented continuation                                                                                                                                                   | Evidence / remaining gate                                                                                                                                                                                                                                            |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Policy configuration      | Private Root/hostel/branch/room-type GETs; local/inherited/effective settings, explicit limits and edit grants; lazy settings editors in the existing web management shell | Contracts 279/23 suites and SDK 202/21 suites passed full local gates. Read API modules reached 100% coverage in the 1,101-test API checkpoint. Full web lint/typecheck/build and 373 assertions in 48 suites passed, with 100% lines/functions and 99.16% branches. |
| Identity at booking       | Permanent address required by creation and confirmation; current profile/category checks retained; private identity excluded from public snapshots                         | Unit cases passed in earlier full API checkpoints. Real address and confirmation scenarios remain NOT RUN LOCALLY.                                                                                                                                                   |
| Confirmation concurrency  | Existing globally ordered staff/Customer participant locks, scoped preflight, unchanged idempotency clock and binding recheck; ADR 0029                                    | Test-first missing-lock assertion failed, then 26 focused assertions passed. Further replay/denial cases and a deterministic PostgreSQL identity-wait scenario are authored; new complete API gates are queued.                                                      |
| Physical inventory        | Typed room-type/pricing/fee, room/bed and archival/status commands; management forms; account/branch cache isolation                                                       | Prior SDK/static and component checkpoints passed. Real mutation/constraint/rollback/concurrency acceptance remains pending.                                                                                                                                         |
| Manual blocks             | Bounded unreleased/released/all history, retained archived labels, exact room/bed target, private reasons and persisted release/create refresh                             | Earlier SDK 187-test checkpoint and API unit/HTTP assertions passed. Current web cases passed within an incomplete full run. Real PostgreSQL history/scope cases remain NOT RUN LOCALLY.                                                                             |
| Native protected requests | Server-verified, token-frozen actor binding for new booking, evidence, Saved and inbox work; immediate private cache cleanup                                               | Earlier mobile 228-unit / 143-component and Hermes export checkpoints passed. Renewed shared-client/native acceptance remains required.                                                                                                                              |

Concrete remaining implementation includes booking lifecycle notices through the
existing outbox, web discovery filters/map/Saved/full checkout/My Bookings,
management listing/amenity/gallery/grant controls, fuller management booking
information, essential native management operations and bounded/performance
acceptance. Existing guest Home/details/quote and native Customer flows should be
extended rather than replaced. All underlying real infrastructure, clean migration
replay/seed/constraints, concurrency, combined coverage, browser/native acceptance,
security and exact-source CI gates remain required. No Phase 2 completion, current
CI PASS, production release or final APK acceptance is claimed.

### Lifecycle and Customer web continuation, 2026-10-16

- LOCAL PASS: DB lint/typecheck/test/build, 25 unit assertions in three suites;
  notifications lint/typecheck/test/build, 74 assertions and 100% measured
  coverage (unchanged notification source reused cached results on recheck);
  worker lint/typecheck/test/build, 100% lines/functions and 99.05% branches.
- Booking state transactions now enqueue closed lifecycle events, including
  expiry, through the existing outbox. Recipient resolution and inbox delivery
  retain leases, idempotency and atomic rollback; ADR-0030 describes the two
  stages. API hook package verification is running. Three real PostgreSQL cases
  cover duplicate fanout/delivery, cancelled-state rollback and recipient FK
  waits crossing the lease deadline; NOT RUN LOCALLY.
- Customer web My Bookings/cancellation and Saved list/removal/detail saving are
  authored using existing typed APIs. New component tests cover pagination,
  real/empty/error distinctions, server-persisted success, exact response binding,
  stable retry keys, account changes and denied/stale access. Their complete web
  lint/typecheck/test/build is queued after API verification; no new UI PASS yet.

Required real browser acceptance must use the existing production web/API/worker
fixture and real PostgreSQL/storage runtime, without route mocks. Cover guest
hostel return through sign-in, Customer-only save/removal and persistence after
reload, unrelated account isolation, own booking history and reasoned
cancellation, CSRF rejection, expired/revoked sessions and unchanged private
booking/document disclosure boundaries. A successful component run does not
substitute for these cases. CI remains authoritative for container-dependent
checks; no current-revision CI PASS is claimed.

### Gallery continuation and media-grant enforcement, 2026-10-17

- LOCAL PASS: latest shared contract lint/typecheck/test/build with unchanged gates;
  gallery capabilities are explicit, and listing media previews have a one-photo bound.
- Generated migration 0015 adds only the active-public branch/order/ID index.
  Generation is not database application or replay proof.
- Public gallery server/SDK and web/native views now paginate all eligible images;
  DTOs carry public media IDs and alt text only. Empty, query-failure and failed-image
  states remain truthful. Existing controlled byte integrity checks are retained.
- Existing media_publish restriction now accompanies listing_edit for publication,
  published-image changes/archive and cover actions, including replay. Private
  draft editing remains listing-scoped; CHG-008 evidence privacy is unchanged.
- New capability matrix, live-revocation UI, SDK wire, web/native gallery and real
  PostgreSQL/storage suites are authored. Their latest complete verification is
  pending. Testcontainers cases include publication-grant revocation/replay,
  eligibility withdrawal, tied-order continuation, scan revocation and 103 photos.
  All real container cases remain NOT RUN LOCALLY. See ADRs 0034/0035.

Room-type amenities, listing rules, broader inventory/performance bounds and the
remaining browser/native/security/combined-coverage/current-CI acceptance remain
open. Earlier backlog statements above are historical checkpoints; completed
Customer web checkout/permissions/lifecycle source should be extended, not redone.
No completed phase, current-source CI PASS or final release artifact is claimed.

### Independent room-type amenities, 2026-10-17

Reuses the existing room_type_amenities/catalog schema; no new migration. Added
separate versioned no-store GET/PUT, current listing-edit authorization, exact
active-child locks, canonical idempotency/replay, retired-selection handling and
transactional audit. Pricing/fees remain independent. Required public detail
amenities use one bounded active-catalog batch, with no extra discovery/per-room
queries; web/native details render actual names only. Management editor/hook/module,
SDK wire and five real transaction/scope/rollback/concurrency cases are authored.
UI module wiring and complete validation remain open (ADR 0036).

Latest verified checkpoint before the public projection: contracts 353 tests/28
suites at 100% coverage and API lint/typecheck/build passed. Initial full API run
failed only two DELETE-recording test assertions (1302 passed/2 failed); corrections
passed eight focused assertions but the diagnostic retains nonzero full-coverage
exit and is not package PASS. Initial gallery web run failed two understood test
issues (563 passed/2 failed); corrected complete rerun remains required. New public
projection contract/API static/SDK checks are running. Real infrastructure, current
CI, full web/native/security and combined business coverage remain unverified.

### Native inventory operational continuation (2026-10-17)

Essential native management is authored under the existing actor/capability branch
workspace: lazy actual inventory display and reasoned room/bed availability status
changes through existing SDK commands. Backend grants, actor/branch/object locks,
audit, idempotency and transaction/conflict rules remain authoritative. Read-only
roles get no mutation controls; outage/refetch disables writes and preserves draft,
denial hides stale private data, and branch/account changes discard local selection.
No optimistic success or new business/financial rule is introduced. Twelve native
component cases are authored, not yet run. Native export/static/unit and actual
container/native acceptance remain open. No APK/commit/push/install was performed.

### Restart recovery and current verification (2026-10-17)

Recovered damaged STATUS from HEAD plus 171 preserved successful edits with zero
reconstruction failures; planning history retained. Restored generated API/SDK
artifacts from verified Turbo caches, then regenerated normally during diagnostics.
Original and continuation source recovery archives are stored on the task's C: drive.
No restart root cause has been established. Further file edits use atomic fsync and
replace; no OS configuration changes, commits, pushes, APKs or installs performed.

Gallery unpublication replay now retains current publication-grant requirements
through immutable version-bound audit provenance. Focused diagnostic passed 43
assertions before the fixed partial-index predicate refinement; command retained
full-coverage exit one, so no API package PASS. Drizzle generated index-only 0016;
apply/replay and real transaction case remain NOT RUN LOCALLY. The two reproduced
web amenity editor/connection defects and three cached-public-detail refresh defects
are corrected; complete renewed web gates are pending. The full native diagnostic
failed with 169 passed / 20 harness/mock failures, all corrected for fresh recheck.
New native inventory features and true detail/missing-scope regressions remain under
verification, not accepted. See STATUS and exact log paths for superseding evidence.

The missing static Home artwork now has a locally generated fictional architectural
illustration and exact provenance at assets/marketplace-hero-provenance.md. Web Home
integration is authored with a visible Illustrative image caption and fallback;
mobile integration and visual acceptance remain pending. Actual listing images
continue to use Owner publication/clean-file validation. No current CI PASS or
Phase 2 completion is claimed. Rules, bounded-query improvements, remaining native
work and real end-to-end/aggregate/security acceptance remain open.

### Temporary web Recently Viewed (2026-10-17)

Implemented actual successful-detail history through the existing application cache:
canonical branch IDs only, deduplicated most-recent-first and bounded20 in memory.
Existing identity/logout cache clearing removes it; no browser/server persistence,
analytics or account-history model. Fresh approved public summaries supply cards;
missing/unrequested rows are omitted and errors never become successful empty state.
Photo failures remain truthful and never substitute generated marketing imagery.
Twelve history/card cases plus successful/failed Details recording assertions are
authored, NOT RUN. ADR 0038 records lifecycle boundaries. Complete web gates pending.
The Home artwork is now a clearly drawn neutral illustration, superseding the initial
photographic draft in both apps and conforming to the authoritative v2.2 supplement.

### Informational hostel rules (2026-10-17)

Additive Drizzle migration 0017 implements scoped ordered rule text, revision and
archival. Private service/repository/HTTP routes reuse current actor/branch/object
locks, listing-edit grants, exact version preconditions, transaction idempotency
and same-transaction audit. Anonymous public rules require current eligible parent
visibility in the same bounded SQL statement. All fetched rows, including the
continuation probe, must be unique and ordered. Rule text never overrides enforced
booking/pricing/KYC/security policy.

Shared typed SDK plus web management and web/native public detail views are
connected. The management panel uses lazy account/branch cache, current row before
editing, explicit text/order/reason, stable command keys across retries, retained
outage drafts and explicit conflict reload. Public error refresh hides cached text.
SDK/HTTP/UI and six real Testcontainers acceptance cases are authored. Current
core verification is running. Contracts 377, SDK 298 and DB units 25 have passed;
complete API/coverage/static/Web/native results are still pending. Earlier static
backend/DB/contracts 26-task run passed. Migration apply/clean replay/seed/real
constraints/concurrency and current CI remain NOT RUN LOCALLY. See STATUS and ADR
0039 for exact checkpoints; Phase 2 remains incomplete.

### Discovery and private page checkpoint (2026-10-17)

One-statement public discovery aggregates and independently paged private room-type,
room and bed transport are connected. A lightweight access route replaces complete
inventory reads in web/native booking capability checks. Four new real paging
acceptance cases remain NOT RUN LOCALLY. Existing private inventory transport,
blocking selectors and public physical details still need complete caller migration.
Web physical browser navigation is authored and under baseline testing, not accepted.

LOCAL PASS: core static31/31 tasks; complete API1432, contracts384, SDK312, DB units25
and unchanged coverage thresholds, test command11/11 tasks, exit0. API line/statement
91.70%, branch96.81%, function84.48%; contracts100% all; SDK99.14% lines/statements,
96.72% branches,99.19% functions. These unit/static results do not replace combined
business coverage, real PostgreSQL/PostGIS/Redis/S3/AV/migration replay/seed/
constraints/concurrency/application/E2E or current GitHub Actions acceptance.
The earlier claim of a100-type amenity-helper input bound was inaccurate: source
bounds100 amenities per type. No101-type failure was reproduced; do not add a hidden
business cap. All physical collections still require bounded transport/client use.
See ADR0040/0041 and STATUS for exact evidence and remaining work.

### Physical client and manual block migration (2026-10-17)

Web physical browser, native physical browser and booking capability checks now
use scoped inventory pages/access. Web static/build33/33 tasks passed; native
selected45 assertions passed. Full mobile gates are running. Manual block history
and release are migrated to access-only reads, with a newly authored paged target
picker for creation. It preserves dates/reason across physical page navigation and
retains exact target IDs/ordinals and existing command idempotency. New regression
coverage remains pending execution. Public option paging, sorting/Featured ranking,
fresh security, combined business coverage and current real container/CI acceptance
remain open. No final APK/install, commit/push or Phase 2 completion claim.
