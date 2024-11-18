# Independent audit remediation — 2026-10-27

Starting revision: `6b385704e3e418cd1d25e9b012ba7ddb58841bf6`, branch
`codex/recovery-20261023`. User directive: sequential, evidence-based fixes; no
deployment, policy changes, historical rewrites or destructive infrastructure work.
Existing modified AGENTS.md and untracked local Chrome configuration are user-owned.

| ID      | Root cause verified                                               | Code changed        | Focused test                                            | Neighbor regression                                                 | Final status                                                         |
| ------- | ----------------------------------------------------------------- | ------------------- | ------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------- |
| AUD-001 | Settlement/deposit traversal uses presentation limits             | Yes                 | Reader 7/7; checkout 5/5; HTTP group 6/6                | DB units 752/752; API units 2204/2204; static pass                  | REGRESSION PASS                                                      |
| AUD-003 | Hooks clear unknown intents; lifecycle replay grants differ       | Yes                 | Web RED 3; authority RED 2; HTTP 3/3 PASS               | API 2206; Web 998; native 268 + 373; static/coverage PASS           | REGRESSION PASS; restart gap open by user                            |
| AUD-002 | Closed reporter catalog contains 5 of 19 current titles           | Yes                 | RED 5/5 failures; corrected assertions 26/26 PASS       | Web 1003/1003; static/coverage PASS                                 | REGRESSION PASS; final browser pending                               |
| AUD-004 | Timestamp To excludes its whole day; display uses UTC             | Yes                 | RED 32 failed / 1 passed; corrected 33/33 PASS          | HTTP 5/5; API 2239/2239; lint/typecheck/coverage PASS               | REGRESSION PASS                                                      |
| AUD-005 | Invoice/overdue sampling, old debt cutoff, silent range cap       | Yes                 | Unit RED 3; PG RED 3; corrected PG 3/3 PASS             | API 2249; DB 780; parity 26; static/coverage PASS                   | REGRESSION PASS                                                      |
| AUD-006 | Financial report ceiling applied before eligibility               | Yes                 | RED 2; boundary 14/14; real HTTP 3 PASS                 | DB 795; API 61 assertions/static PASS; export setup gap             | IMPLEMENTED; acceptance incomplete                                   |
| AUD-007 | CSV omits completeness metadata and download warning              | Yes                 | Verified API RED 6; Web RED 6; corrected API 24, Web 49 | Full Web 1010/1010; static/build/generated types PASS               | REGRESSION PASS; final browser pending                               |
| AUD-010 | Required filters/hierarchy were missing                           | Yes                 | Real PG filters/options/scope; Chrome PASS              | API2350/Web1029 + static/build at prior checkpoints                 | IMPLEMENTED — ACCEPTANCE PENDING                                     |
| AUD-009 | Plain counts; missing queues; 100-branch dashboard ceiling        | Yes                 | Real PG5 + Chrome4 PASS                                 | API2368/Web1052; shared2084; static/build/coverage PASS             | REGRESSION + SCOPED ACCEPTANCE PASS                                  |
| AUD-008 | 5000 candidates capped before distinct audience                   | Yes                 | Real PG10; Worker23 PASS                                | DB/Worker static4/4 PASS; full campaign deferred                    | IMPLEMENTED — FOCUSED VERIFICATION PASSED — FINAL ACCEPTANCE PENDING |
| AUD-011 | Historical phase3 entry points conflict with later accepted scope | Yes                 | Manual source/doc reconciliation                        | No runtime changes; history preserved                               | IMPLEMENTED — FOCUSED VERIFICATION PASSED — FINAL ACCEPTANCE PENDING |
| AUD-012 | Representative performance risk investigated                      | No confirmed defect | Real PG6/6 PASS; query/index/heap/lock observations     | API lint/typecheck2/2 PASS; final campaign pending                  | FOCUSED VERIFIED — LARGER EXPORT RISK RETAINED                       |
| AUD-013 | Terminal DB budget reused retained Redis attempt                  | Yes                 | Real RED, Redis recovery1 + PG8 PASS                    | Worker78/full static PASS; final integration pending                | IMPLEMENTED — ACCEPTANCE PENDING                                     |
| AUD-014 | Preserve exact source/config/command provenance                   | Preparation         | Existing fingerprint/manifest rules retained            | One final campaign; dirty/hosted/device constraints explicit        | PREPARED — FINAL ACCEPTANCE PENDING                                  |
| AUD-015 | Root race, adverse coverage and approved entry alignment          | Yes                 | Root3; checkout3; transport1; restore1; entry29 PASS    | API2368 + Mobile383/coverage PASS; final integration/device pending | IMPLEMENTED — ACCEPTANCE PENDING                                     |

## AUD-010 prerequisites and evidence (RPT-001/002, PROP, SEC-003)

`e0c2d37` is pushed. Terminal full API 229 files / 2350 tests PASS, configured
L/S 84.61%, F 82.19%, B 94.62%, exit 0, 10m11.829s
(`.tools/audit-010-owner-api-regression.log`). This adds the lookup and Owner scope
source to the prior checkpoint. Owner subset paging and property-management Web
controls are now implemented; final full Web/build/browser proof remains pending.

Property UI valid RED 1 failed / 14 existing passed
(`.tools/audit-010-property-ui-red.log`). First focused attempt had four missing
room-read test doubles and one query-notification wait error; corrected mocks and
awaited the actual version control. Next attempt clicked a disabled retry during
authority refresh and inspected outage controls before notification. Corrected
by awaiting enabled/visible state; no increased timeouts. Corrected four files /
31 assertions PASS, selected exit 1 on global coverage
(`.tools/audit-010-property-ui-verified.log`). Web static initial failure:
optional floor cursor narrowing and one unused test import; corrected Web
lint/typecheck 2/2 PASS, exit 0, 41.229s
(`.tools/audit-010-property-ui-static-verified.log`). Tests cover exact branch,
parent/room/version/body, all create/archive/location operations, matching read
success, stale edits, grant loss and original replay across remounts. Property
drafts use the existing in-memory retained-command runtime; restart recovery is
still open by user decision. Additional archive-reload/Owner paging assertions
were added after that focused checkpoint and await final verification.

An intermediate owner UI run had overlapping Web coverage processes and missing
`coverage/.tmp/coverage-0.json` (`.tools/audit-010-owner-ui-focused.log`); retain it
as an invalid coverage run. Subsequent Web tests are serialized. Full Web suite
and build began before the final stale-archive edit/browser helper was complete;
retain these interim logs without claiming an exact final-source certificate.
Repeat the necessary final-source checks before coordinated acceptance. Extended
existing Journey 8 exercises actual metadata controls and filtered authenticated
download; no test-title/reporter changes or relaxed timeouts. Bundled Chromium is
absent; installed Chrome and unchanged user local-Chrome config are available.
GitHub connector retry still returns 404 for the repository; no PR is created.

Selected-branch Web panel: valid behavioral RED three cases show no Filter reports
control (`.tools/audit-010-filter-ui-red.log`). Implemented bounded named pickers
pass 17/17 report/download/platform assertions (`.tools/audit-010-filter-ui-final.log`);
selected exit 1 is global coverage, not assertion failure. Earlier paging fixture
clicked a disabled refetch button; corrected by awaiting the enabled state, with
no increased timeout. Parent/report/actor resets, scope refresh failure, actual
names, format parity and bounded search/cursor behavior are covered. API/Web
lint/typecheck 4/4 PASS, exit 0, 1m28.885s
(`.tools/audit-010-owner-and-filter-static.log`).

Real owner-scope RED three failures: owned branch beyond 100 falsely denied,
all-owned export only 100/102 groups, duplicate selection duplicates groups
(`.tools/audit-010-owner-scope-red.log`). Corrected bounded complete traversal and
direct subset authority pass 3/3 real cases (`.tools/audit-010-owner-scope-http.log`).
A fourth RED shows location selection emits 102 unrelated branch aggregate groups
instead of the matching branch (`.tools/audit-010-owner-filter-group-red.log`).
Resolve the validated filter's branch before report grouping/limits/audit; final
4/4 PASS, exit 0, 1m22.8s (`.tools/audit-010-owner-scope-verified.log`). Focused
insights neighbors 11 files / 133 assertions PASS, selected exit 1 on global
coverage (`.tools/audit-010-owner-scope-focused.log`). Full API regression is running.
Dashboard bounds and existing ownership/archive policy remain unchanged.
Owner named branch paging, property Web management and coordinated acceptance
remain open. Earlier completed checkpoints do not certify this later source.

Latest checkpoint: prerequisite `0c1b13c` is pushed. Backend filters are implemented
across ten report families; Web named controls and final acceptance remain open.
The chronological prerequisite paragraphs below retain earlier pending states.

Report-filter checkpoint `319e261` is pushed. Its full Web regression completes:
135 files / 1011 tests, L/S 99.76%, F 98.85%, B 97.72%, exit 0, 11m29.957s
(`.tools/audit-010-web-regression.log`). This does not certify later lookup/UI
source or final coordinated acceptance. Existing user Login/AGENTS/Chrome work
remains excluded from audit commits.

Named-lookup prerequisite: real HTTP RED 404 instead of 200
(`.tools/audit-010-options-http-red.log`); implemented read-only minimal pages use
the selected report's existing live authority, not expanded directory access.
Confirmed HTTP 3/3 PASS, exit 0, 1m31.542s (`.tools/audit-010-options-http.log`):
actual bounded names, strict parent/cursor/literal search, archived identities,
finance-only Manager, directory denied, no names before permitted receipt facts,
receipt/deposit names after posting and live grant revocation/guest denial.
This changes no invoice/fund arithmetic and does not assert current eligibility
from selector names. Contracts four tasks PASS, 71 files / 1072 tests, configured
coverage, exit 0, 1m52.695s (`.tools/audit-010-options-contract.log`). SDK initial
RED proves the missing helper; full corrected four tasks PASS, 75 files / 1002
tests, L/S 97.75%, F 97.39%, B 95.94%, exit 0, 1m22.887s
(`.tools/audit-010-options-sdk-regression.log`). Final API static 2/2 PASS, exit 0,
1m14.756s (`.tools/audit-010-options-api-static-final.log`). Focused report neighbors
124 assertions / ten files PASS, selected exit 1 on global coverage; insights
L/S 99.32%, F 95.89%, B 91.77% (`.tools/audit-010-options-focused-final.log`).
API build/OpenAPI/forced SDK generation PASS. AST review adds exactly one path /
operation and changes/removes none (`.tools/audit-010-options-generated-review.json`).
Web selectors and property management remain open. Owner-scope review also found
the shared dashboard helper's 100-branch enumeration ceiling; reproduce and
resolve/report that boundary before claiming complete owner report selection.

Filter progression: missing scope-helper module initially prevents test collection
(zero assertions, not a valid behavioral RED). Corrected scope assertions pass
10/10; the selected command exits 1 on global coverage. Real HTTP RED shows a
valid occupancy room/status selection returning 400 instead of 200, while the
corrected transfer-history scenario passes (`.tools/audit-010-occupancy-red.log`).
An earlier transfer fixture used a stale hard-coded version after payment; fixed
by reading the authoritative version, without changing production concurrency.
Five occupancy-state projection RED failures / three existing passes are retained
(`.tools/audit-010-occupancy-projection-red.log`). Nine other valid family queries
fail against the unavailable-filter guard (`.tools/audit-010-family-filters-red.log`).

Scoped predicates now apply before limits/aggregation. Assignment EXISTS queries
retain fact cardinality and branch correlation; named identifiers receive exact
parent/live authority validation. Full initial API lint/typecheck 2/2 PASS, exit 0,
1m50.077s (`.tools/audit-010-filters-static.log`). Corrected focused nine files /
104 assertions PASS; selected exit 1 on global coverage, not a full-package pass
(`.tools/audit-010-filters-focused-verified.log`). First real combined group 11/11
PASS, exit 0 (`.tools/audit-010-filters-pg.log`).

Expanded HTTP attempts retain a test expectation error (overdue count was 0,
canonical policy correctly reports 1; an already-loaded rerun retained the old
expectation). The next run reproduces an actual requested-transport date bug:
null effective start excluded the matching request. Creation-time fallback fixes
that case while retaining effective-period/default status semantics. A subsequent
checkout assertion was placed before the return transfer in the fixture; moved
after it without changing the production predicate. Terminal real scenario
2/2 PASS, exit 0, 2m49.973s (`.tools/audit-010-family-filter-http-terminal.log`):
matching/nonmatching residents, bookings, outstanding amounts, deposits, payments,
complaints, rent aggregates, requested transport and checkout; midnight/later
transfer history; combined resident/parent/status scope; six families' CSV and PDF
bytes match the shared JSON table. This is not complete all-format/browser/device
acceptance, nor a performance PASS (the combined scenario took 12.417 seconds).

OpenAPI/API build and forced SDK generation PASS. AST comparison finds unchanged
238 paths / 279 operations except the two existing report operations gaining
filter queries (`.tools/audit-010-filter-generated-review.json`). No manual edit to
generated types. SDK RED eight failures proves ignored selections/invalid scopes.
Full SDK attempts retain a test unused-variable lint error, optional-field typing
error and invalid synthetic CSRF callback type, each corrected. Terminal full SDK
lint/typecheck/test/build 4/4 PASS, 990 tests, configured coverage, exit 0,
1m51.388s (`.tools/audit-010-report-sdk-complete.log`). Web stricter SDK validation
exposed inverted-date rendering: one RED / five existing passes; inline validation
and withheld links correct it, verification running. Full API regression is running.

Terminal API lint/typecheck/test 3/3 PASS, 226 files / 2314 tests, configured
L/S 84.48%, F 82.12%, B 94.63%, exit 0, 15m46.631s
(`.tools/audit-010-filters-api-regression.log`). Web date/download/platform/proxy
neighbors: three files / 12 assertions PASS; selected command exits 1 on global
coverage (`.tools/audit-010-report-web-focused.log`). Web lint/typecheck 2/2 PASS,
exit 0, 1m17.583s (`.tools/audit-010-report-web-static.log`). Full Web regression
is running with the previously established 1 GiB Node heap limit; no timeout,
assertion or coverage threshold was relaxed. The SDK terminal coverage is
L/S 97.74%, F 97.38%, B 95.95%; the new report helper has 100% measured coverage.

Q20/ADR0079 records user-delegated historical assignment timing. Applicability
is mapped in `audit-report-filters-20261028.md`; SRS p.39 common filters are not
silently applied to unrelated facts. Contract RED: six valid queries rejected,
six invalid/default assertions passed, exit 1 (`.tools/audit-010-contract-red.log`).
New contracts reuse operational status vocabularies and reject inapplicable
combinations. Initial focused correction 39/39 assertions passed, exit 1 on
whole-package coverage; static found an export collision with chat's report
status schema, corrected by naming the new schema `reportFilterStatusSchema`.
Corrected Contracts lint/typecheck/units 3/3 PASS, 1040/1040 tests and configured
coverage, exit 0 (`.tools/audit-010-contract-regression-verified.log`).

The first property PostgreSQL attempt failed before assertions because Docker
was unavailable. Starting the stopped Docker Desktop restored the engine; the
next run proves two RED failures: absent `buildings`/`floors` and `rooms.floor_id`
(`.tools/audit-010-property-red-verified.log`). No source schema edits preceded
those assertions. Generated additive 0059 creates real branch-scoped parents and
nullable legacy location, without invented backfill. Initial generation hit an
OS user-info ENOMEM sandbox failure; escalated file-only generation passed.

Initial fresh/previous-schema upgrade/constraint/seed group: 19/19 PASS, exit 0,
seed coverage 100% (`.tools/audit-010-property-pg.log`). An untracked, undeployed
draft was then safely regenerated to include building/floor and room-location
versions: validated paths, untracked-file checks, and exact earlier journal
comparison preceded replacement. All earlier committed migration files remain.
Final regenerated migration verification is pending. Migration note records this
distinction; no existing environment database has been migrated.

Real HTTP RED: authorized Owner create returns 404 rather than 201
(`.tools/audit-010-property-http-red.log`). Backend pages/commands now use live
branch authority, inventory_edit, exact parent checks, idempotent replay,
versions and mandatory audit. HTTP 8/8 PASS, exit 0
(`.tools/audit-010-property-http.log`): foreign IDs, concurrent updates, archived
parent replay, revoked Manager grants, audit rollback, bounds and literal search.
The updated suite additionally checks that new report fields reject explicitly
until their scoped predicates exist; its rerun is pending.

Contracts/DB static/build/unit group: 8/8 tasks PASS, 1059 Contracts and 795 DB
assertions, configured coverage PASS, exit 0, 2m12.335s
(`.tools/audit-010-prerequisite-regression.log`). API build-order typecheck failed
until new compiled factories existed; corrected build passed. Secret lint flagged
public OpenAPI names; narrow documented exceptions retain the secret scanner.
Focused API five files / 34 assertions PASS, selected command exit 1 on global
coverage (`.tools/audit-010-api-focused.log`). Full API/static and final real
PostgreSQL/HTTP reruns are in progress. SDK/Web hierarchy controls and full
report predicates remain unimplemented; this finding is not complete.

Final regenerated migration group: four files / 19 tests PASS, exit 0,
1m51.177s; seed coverage 100% (`.tools/audit-010-property-pg-final.log`). Updated
HTTP group: 9/9 PASS, exit 0, 1m59.643s, including explicit rejection of not-yet-
implemented report parameters (`.tools/audit-010-property-http-verified.log`).
OpenAPI generation PASS. Initial `client:generate --only` reused a stale cache
because its API dependency was skipped; forced generation then passed. Semantic
TypeScript AST comparison confirms exactly five added paths / eight operations,
zero removed or changed existing paths/operations
(`.tools/audit-010-generated-review.json`). Do not rely on the earlier cache hit
as generation evidence. Full API/static regression is still running.

Full API unit/static terminal result PASS: 223 files, 2279/2279 assertions,
configured L/S 84.36%, F 82.05%, B 94.60%, lint/typecheck/test 3/3 tasks, exit 0,
12m20.336s (`.tools/audit-010-api-regression.log`). Additional operation-ID-only
documentation build and OpenAPI generation pass; a secret scanner false positive
on the new public operation name was resolved by shortening that undeployed ID,
with a narrow documented exception for the SDK export-name test. Generated code
was regenerated rather than hand-edited. SDK RED 8 failed on missing helpers
(`.tools/audit-010-sdk-red.log`); corrected focused 8/8 assertions pass, selected
command exits on global coverage (`.tools/audit-010-sdk-focused.log`). Complete
SDK validation/static/build/unit verification is running with additional malformed
scope, version, parent and empty-page cases. This does not enable report predicates.

Final SDK verification PASS: lint/typecheck/test/build 4/4 tasks, 73 files / 982
tests, configured L/S 97.74%, F 97.37%, B 95.92%, exit 0, 1m22.377s
(`.tools/audit-010-sdk-regression-verified.log`). Repeated generated AST comparison
still reports five added paths / eight operations and zero changed/removed existing
members. The prerequisite is ready for review; AUD-010 remains incomplete until
Web management and real report filter predicates have coordinated acceptance.

## AUD-007 correction and evidence (RPT-002)

Initial API run: six cases fail on `Authentication required`, exit 1
(`.tools/audit-007-api-red.log`); this is a test fixture failure, not defect
reproduction. The initial corrected-source API focused run repeats this fixture
failure (`.tools/audit-007-api-focused.log`). Supply the test actor as the
existing controller unit suite does, replay the original committed controller
under that corrected fixture, and restore current source in a `finally` block.
That diagnostic RED and corrected-source rerun are pending. Six Web cases fail missing proxy metadata and
download/warning behavior, exit 1 (`.tools/audit-007-web-red.log`). Headers avoid
changing CSV columns or adding warning lines. The same flag accompanies all
formats. Web downloads use the actual authenticated response, retain safe server
filenames, display partial/unknown-completeness warnings, reject failed HTTP
responses as downloads, serialize clicks and release blob/abort resources.
No changes to report query scope, financial state or retention.

Contract build PASS, exit 0 (`.tools/audit-007-contract-build.log`). Corrected
focused Web four files, 35/35 assertions PASS; exit 1 on unchanged whole-package
coverage floors (`.tools/audit-007-web-focused.log`). Static and API checks and
broader coverage remain pending. New mobile/login/UI changes from concurrent
work are preserved and excluded from remediation staging.

Static/build terminal result: 9/9 tasks PASS, exit 0, 16m39.684s
(`.tools/audit-007-static.log`): Contracts/API/Web lint, typecheck and build,
including Next.js production compilation and generated route types. Existing
warnings remain; no lint errors. Additional download lifecycle assertions now
cover repeated clicks, unmount abort and safe server filename preservation.
OpenAPI generation passes; SDK generation and affected regressions are running.
GitHub connector read still returns 404 for the private repository; existing
feature-branch push works. AUD-006 is committed/pushed as `2bccb36`.

OpenAPI and SDK generation completed PASS (57.57s and 3m33.332s respectively),
exit 0 (`.tools/audit-007-openapi.log`). Generated SDK diff is exactly four
added lines documenting the two report routes' header types. With the corrected
actor fixture, replaying the original committed controller now produces six
expected missing-header failures, exit 1, 1m22.646s
(`.tools/audit-007-api-red-verified.log`). Current controller was restored by
the diagnostic command's `finally` block before the corrected-source rerun.
Full Web and corrected API regressions are running; no terminal PASS claim yet.

Corrected API focused terminal result: three files, 24/24 assertions PASS;
command exit 1 on unchanged whole-package coverage floors, not assertion failures
(`.tools/audit-007-api-focused-verified.log`). Full Web is still running; one
unchanged inventory-pricing retry case has exceeded its existing five-second
limit. Keep that result and verify the failed neighbor without increasing the
timeout or altering its assertion. Existing platform dashboard cases pass.

All five new browser-component download cases also pass in the full Web run,
including exact filename and serialized-click/unmount cleanup checks. Existing
owner browser journey now additionally clicks its real report link, waits for
the browser download, verifies its filename and checks CSV/PDF metadata; that
browser execution is pending and is not represented by component-test PASS.
Full Web run is still active and contains failures outside the report changes;
preserve its terminal result and rerun those neighbors separately.

Full Web terminal result: 135 files, 1003 passed / 7 failed, exit 1,
40m36.108s (`.tools/audit-007-web-full.log`). Five failed files are
branch-inventory, owner-invitation, staff-stay-payment, auth/customer-profile,
and services/services. Failures include unchanged five-second timeouts and a
payment form label unavailable after preceding timing failures. All five new
download component cases and both proxy metadata cases pass in this run.
Do not call the complete suite or coverage gates PASS. Isolated neighbor reruns
and coordinated acceptance remain pending; no timeout/assertion was weakened.

AUD-007 committed/pushed as `3eceaa4`. Quiet neighbor run: seven files, 49/49
assertions PASS, including all previously failed cases, without assertion or
timeout changes; selected command exits 1 on global coverage floors
(`.tools/audit-007-web-neighbor.log`). Final API/SDK/Web lint/typecheck: 6/6 tasks
PASS, exit 0, 2m16.768s (`.tools/audit-007-final-static.log`). A quiet complete
Web rerun is in progress to verify the whole-suite result and coverage gates.

Quiet full Web terminal result PASS: 135/135 files, 1010/1010 assertions, configured
coverage L/S 99.76%, F 98.85%, B 97.72%, exit 0, 8m35.65s
(`.tools/audit-007-web-full-verified.log`). The earlier 1003/7 failed run remains
recorded. No timeout, assertion or coverage floor changed. Extended real browser
journey and coordinated AUD-014 acceptance remain pending; this is local affected
regression evidence, not a production release or physical-device claim.

## AUD-006 correction and evidence (RPT-001/002, RENT-005, SEC-003)

RED `.tools/audit-006-red.log`: 2 failed / 8 passed, exit 1. Both financial
reports lose the one matching row after 5001 nonmatching candidates. ADR0077
records stable 100-row candidate pages, canonical branch-scoped balance batches,
and matching-row sentinel semantics; no columns, policy or history rewrite.
Memory is bounded by one page plus 5001 matches. Transaction lock accumulation
and broader performance acceptance remain AUD-012.

DB build PASS (`.tools/audit-006-db-build.log`). Initial API focused run:
46 passed / 1 failed, exit 1; existing mock returned a fixed unrelated invoice ID
and was corrected to mirror each requested batch ID, without assertion changes.
The new eligibility cases passed. Initial DB run: 791 passed / 4 failed, exit 1;
new parameterized tests accidentally spread array rows into callback arguments.
Corrected their input wrappers; assertions and production code unchanged.
Initial task-name/argument invocation errors were corrected using the installed
task names and explicit Corepack runner; they are not passing verification.

Sandbox PostgreSQL attempt could not access the runtime: 7 skipped, two failed
setup suites, exit 1 (`.tools/audit-006-pg.log`). Escalated disposable-container
rerun is in progress. Real fixtures contain 5001 approved-receipt-paid invoices
before later debt, and 5001 deposit-free Stays before receipt-backed funds;
receipt snapshots are schema-validated with at most 100 allocations each.
Scope, as-of, CSV/PDF and existing financial parity checks remain pending.

Corrected full DB static/unit run PASS: 38 files, 795/795 assertions; lint,
typecheck and test 3/3 tasks, exit 0, 5m18.239s. Configured L/S 98.41%, F 98.77%,
B 98.84% (`.tools/audit-006-db-regression-verified.log`). Initial combined HTTP
rerun hit the unchanged 180-second setup hooks in both the new suite and the
previously passing AUD-005 suite: 7 skipped, exit 1; no assertion PASS claim
(`.tools/audit-006-pg-verified.log`).

Isolated HTTP run reached real assertions: later unpaid invoice PASS (8847 ms),
later deposit-bearing Stay PASS (7109 ms), branch/customer/as-of checks PASS
(13101 ms). Command exit 1 because the export-comparison test loaded the earlier
incorrect two-argument CSV helper call before its on-disk correction; failure is
retained in `.tools/audit-006-pg-serial.log`. The corrected export cases now test
each report/format independently (two requests per case), with the same assertions
and unchanged timeouts. Stage messages contain no resident or payment payloads.
Full corrected HTTP, API static/focused units and real fund parity still pending.

The diagnostic HTTP rerun (`.tools/audit-006-pg-final.log`) records entry into
`containers-and-application` but never reaches `financial-candidates`; its setup
hook times out at the unchanged 180 seconds. Seven cases are skipped, command
exit 1. This isolates that attempt's failure before the large data fixture.
Do not claim complete HTTP/export verification or repeat the same setup attempt
indefinitely. Retain the three real assertions from the earlier isolated run;
final coordinated acceptance must rerun the corrected export cases on a stable
environment. API static/focused and smaller PostgreSQL fund parity are next.

API lint/typecheck 2/2 PASS, exit 0, 4m30.145s
(`.tools/audit-006-api-static.log`). Focused report/date/metric units: four files,
61/61 assertions PASS; command exit 1 on unchanged whole-package coverage floors,
2m11.521s (`.tools/audit-006-api-focused-verified.log`). This is affected-unit
evidence, not a full API coverage certification.

Real fund/migration/seed run: 25 passed / 4 failed, exit 1
(`.tools/audit-006-fund-parity.log`). All ten movement cases pass, including
batch/single parity for deposit/advance application, deduction and refunds;
concurrency, reversal and mandatory-audit rollback checks remain intact. Four
balance cases fail because the newly edited parity helper passed an entire
fixture object into the existing strict single-reader input. Restore its exact
branchId/stayId object; no production or assertion change. The corrected balance
and seed coverage run is pending. Do not relabel the failed command as PASS.

Corrected PostgreSQL run completed PASS: three files, 19/19 tests, exit 0,
3m55.637s, seed coverage 100% (`.tools/audit-006-fund-parity-verified.log`). All
five real balance cases now additionally prove batch/single equality for empty,
received, applied and reversed funds; real foreign-branch batch read is denied.
Together with the earlier ten passing movement cases this covers canonical fund
parity without changing accounting, authorization, timeouts or coverage gates.
HTTP export cases and coordinated source acceptance remain incomplete.

## AUD-001 correction plan (OUT-003..006 / FIN-002/004 / ACC-001/004/006)

- Root cause: complete liability and checkout application depend on bounded UI arrays.
- Preserve the 200-invoice/100-source response limits, but keyset-traverse the full
  exact Stay scope using existing canonical invoice/fund balance readers. Retain a
  Stay lock across traversal so financial writers cannot change the snapshot.
- Checkout deposit application consumes complete internal iterators, not the public
  response. Reuse the existing source-funded movement command and atomic checkout.
- Preserve integer paisa, receipt-backed balances, authorization, original invoice
  facts, frozen history, branch locks, audits and inventory-release transaction.
- Regression: real PostgreSQL at 0/1/200/201/>201 invoices, paid/partial/advance/deposit,
  older funding sources, duplicate/concurrent checkout, refund/application race and
  rollback; reconcile persisted statement with authoritative ledger.
- No schema migration or financial policy change planned. Rollback is a normal
  revert of the isolated verified commit; never rewrite applied data/history.

## Verification environment

Installed Turbo 2.11.7 documentation read before task changes. Approximately 7.41 GiB
RAM, 0.83 GiB free at initial inspection; expensive tasks must be serial. Docker
29.9.2 started with user-approved escalation. Tests must create fresh Testcontainers
databases; the existing development database and volumes are not test targets.

## AUD-001 evidence

- RED: `D:\corepack.cmd pnpm turbo run test:integration --filter=@hsm/db
--concurrency=1 -- test/stay-settlement-completeness.spec.ts`: 4 failed / 3 passed,
  exit 1. `.tools/audit-001-red.log` and `.exit.txt` retain the actual result.
- First corrected group: seven reader cases, invoice balances 8/8, fund movements
  10/10, migration/seed 14/14 PASS. Four checkout cases failed because the receipt
  helper's resident label did not match the new admission fixture; the database
  correctly rejected the fixture. Fix: admit the identity actually named by the
  existing helper. No assertion or database guard changed.
- Corrected checkout command: `D:\corepack.cmd pnpm turbo run test:integration
--filter=@hsm/db --concurrency=1 -- test/stay-checkout-completeness.spec.ts
test/migrations.spec.ts test/seed-failures.spec.ts`: 19/19 PASS, exit 0;
  `.tools/audit-001-checkout-verified.log`. Coverage retains the configured seed gate
  (100%); this is not a claim of whole-finance coverage.
- `D:\corepack.cmd pnpm turbo run lint typecheck test --filter=@hsm/db
--concurrency=1`: 8/8 tasks PASS, 752/752 units, exit 0;
  `.tools/audit-001-db-regression.log`. Configured unit L/S 98.32%, F 98.66%, B 98.73%.
- The 201-application checkout uses a source behind 101 newer spent payments;
  persisted statement equals the returned statement, invoice facts are unchanged,
  and receivable/deposit ledger balances both reconcile to zero. Separate tests
  prove rollback, concurrent checkout, refund/application contention and partially
  consumed deposit with distinct advance credit.
- No migration or response-schema change. API/client and final coordinated
  regression remain pending; no VERIFIED RESOLVED or whole-system PASS claim.
- Remote branch tip independently checked with `git ls-remote`: unchanged at the
  starting revision before this checkpoint. User-owned files remain excluded.

### AUD-001 HTTP follow-up

First focused correction committed/pushed as `2e2a5b0`. Before closing the finding,
the additional real PostgreSQL HTTP test reproduced a 500: the valid checkout
result exceeds the generic 64 KiB response-cache budget. The checkout command alone
now opts into a finite 256 KiB budget (ADR0074); all privacy/authorization guards,
the default for other commands and the replay lifetime remain unchanged.
New size/privacy/replay/revocation unit assertions: 16/16 selected tests PASS;
the selected command exits 1 because unrelated whole-API coverage floors are
unsatisfied by a three-file selection, not because of a failed assertion. No floor
was disabled or reduced. Corrected real HTTP verification passed: 6/6 tests in two
files, exit 0 (`.tools/audit-001-http-verified.log`), using disposable infrastructure.
The 201-application checkout persists the expected frozen statement and replays
the identical response; five neighboring financial lifecycle cases also pass.
Full API regression: `D:\corepack.cmd pnpm turbo run lint typecheck test
--filter=@hsm/api --only --concurrency=1`: 3/3 tasks, 216/216 files,
2204/2204 tests PASS, exit 0 (`.tools/audit-001-api-regression.log`). Configured
coverage gates pass: overall L/S 85.24%, F 83.23%, B 94.52%; idempotency L/S/F 100%,
B 98.95%. Focused and neighboring regression pass; final combined acceptance remains
pending. No whole-system or production-readiness claim.

### AUD-003 investigation

Current service hooks and lifecycle forms clear retained keys in `onSettled`,
including transport failures. New Web hook RED: 3/3 failed (same-intent key changes,
altered unresolved payload accepted, remount loses the key). Initial client changes
are in the working tree, excluded from the AUD-001 commit until independently
verified: actor/resource/operation-scoped retention, immutable request snapshots,
explicit original-request retry, and refusal to rotate expired unresolved keys.
Durability across a full application restart still needs assessment; no resolution
claim for AUD-003.

### AUD-003 verification checkpoint (working tree after `4447b77`)

- ADR0075 describes the narrow SDK/hook/lifecycle correction, explicit retry controls,
  and the remaining full-process restart gap. Admin verification/moderation reasons
  now belong to the immutable command input instead of mutable callback closures.
- Backend RED: `.tools/audit-003-authority-red.log`, 2/2 failures, exit 1: cached
  repriced-transfer/deposit-checkout responses used the basic act's grants. The
  service now selects the already-approved matching financial act before replay.
- Initial SDK run: 967/967 tests and 4/4 tasks PASS. Expanded SDK run: 969/969 tests
  PASS; command exit 1 because the secret scanner flagged a code example in a comment.
  Reworded the comment; no scanner rule was disabled. Corrected build/lint/typecheck
  3/3 PASS, exit 0 (`.tools/audit-003-sdk-static.log`). Expanded coverage L/S 97.57%,
  F 97.76%, B 95.93% passes the existing floors.
- Initial Web: 131 files, 994/994 tests, lint/typecheck and existing coverage floors
  PASS, exit 0 (`.tools/audit-003-web.log`), including the three original RED cases.
  Additional recovery UI and message assertions require the expanded rerun.
- Initial full native components: 370 passed / 3 failed, 71 suites, exit 1. Two new
  hook tests omitted RNTL 14's required await on renderHook (fixture corrected). The
  existing actor-switch inventory test clicked a disabled control during fresh
  revalidation. Its unchanged isolation assertion passed in the focused rerun;
  it now explicitly waits for the control to become enabled before pressing.
- Native focused group: 35/35 tests, 7/7 suites, configured coverage floors PASS,
  exit 0 (`.tools/audit-003-mobile-focused.log`). Native full unit/static group:
  268/268 tests, 23 files, 3/3 tasks PASS, exit 0; configured L/S 93.52%, F 98.03%,
  B 99.31% (`.tools/audit-003-mobile-static-unit.log`).
- First HTTP attempt: Docker's Linux engine pipe unavailable, 2 failed setup suites,
  3 cases skipped, exit 1. No application result. After runtime availability was
  restored, `.tools/audit-003-http-verified.log`: 3/3 cases, 2/2 files PASS, exit 0.
  Partial refund replay produces one movement, preserves the frozen statement,
  rejects altered input and another resident; revoking payment_record denies checkout
  replay; 201-application checkout remains correct and replayable.
- Combined rerun initially stopped on an unused fixture binding (API lint); removed
  only the unused binding. During diff review an accidentally replaced existing refund
  test file was restored byte-for-byte in Git; its original two cases are retained and
  the new recovery case lives in `audit-stay-refund.spec.tsx`. Expanded serial combined
  validation is running in `.tools/audit-003-regression-verified.log`.
- No schema migration, grant expansion, automatic retry, financial-history rewrite,
  secret-storage change, Android device PASS or whole-system acceptance claim.
- User decision: “Keep restart recovery as an explicit open gap.” No device drafts
  will be persisted. The remount/backgrounding fix may be assessed on its executed
  evidence, but full process restart recovery remains an explicit user-approved gap
  in the final and Phase 11 reports (ADR0075).
- Expanded serial acceptance: `D:\corepack.cmd pnpm turbo run lint typecheck test
test:components --filter=@hsm/api --filter=@hsm/web --filter=@hsm/mobile --only
--concurrency=1`: 10/10 tasks PASS, exit 0, 32m20s. API 217 files / 2206 tests;
  Web 132 files / 998 tests; native unit 23 files / 268 tests; native component
  71 suites / 373 tests. Existing coverage floors all pass. Log:
  `.tools/audit-003-regression-verified.log` plus `.exit.txt`.
  The separately prepared AUD-002 reporter regression is excluded from the AUD-003
  commit and was not part of this acceptance run; no whole-repository final claim.

## AUD-002 reporter catalog (ACC-001 / SEC-003)

The unchanged default Playwright configuration points to the private reporter.
Its closed catalog recognizes only five of the nineteen current static scenarios.
New regression reads the actual E2E source AST and verifies default configuration,
complete outcomes, distinct fixed labels and exclusion of raw titles/private error
and attachment content. RED: 5/5 failures, exit 1 (`.tools/audit-002-red.log`);
an otherwise passed nineteen-case run incorrectly records fourteen failures.

Correction adds the fourteen missing approved titles with fixed sanitized labels.
Unknown scenarios still fail; failed/timed-out/interrupted/skipped cases and
infrastructure failures remain blocking. No diagnostic, artifact-path, retries,
timeout, screenshot, video or privacy guard changed. Existing reporter cases plus
new cases: 26/26 assertions PASS (`.tools/audit-002-focused.log`); selected command
exit 1 is the unchanged global coverage gate, since only two Web test files ran.
No coverage threshold is lowered. Full Web static/unit/coverage verification is
pending. Actual complete browser acceptance remains part of final coordinated
validation; this checkpoint does not certify a new browser run or discredit any
historical result.

The first whole-Web attempt exited 1 on the unchanged admission-submission
interaction's five-second timeout (5131 ms); the reporter scenarios themselves
passed. After that run ended, the unchanged admission file plus both reporter files
passed 30/30 assertions, including the interaction at 4640 ms. That focused command
still exits 1 on unrelated whole-Web coverage floors. No admission assertion,
fixture, timeout or coverage setting was changed. A quiet serial whole-Web rerun
is in `.tools/audit-002-web-verified.log`: exit 1, 1001 passed / 2 failed,
133 files. The admission case passed; existing owner-invitation and staff-payment
interactions instead exceeded their unchanged five-second limits. No timeout,
assertion or coverage setting was weakened.

Runner investigation found that outer Corepack selected pnpm 10.18.3 while Turbo's
child command resolved a fallback pnpm 11.25.0. Official Corepack shims installed
only in ignored `.tools/corepack` now precede PATH; both outer and nested pnpm
report 10.18.3. Earlier logs retain their actual provenance; final coordinated
acceptance must use the corrected pin. A scoped 1024 MiB Node heap cap bounds
resource use without changing test timeouts. Corrected pinned Web lint/typecheck:
2/2 tasks PASS, exit 0 (`.tools/audit-002-pinned-static.log`). Reporter plus all
three affected neighboring UI files: 46/46 assertions PASS, five files, 36.28 s;
command exit 1 on unchanged whole-Web coverage floors
(`.tools/audit-002-pinned-bounded-neighbor.log`). Full pinned Web command:
`pnpm turbo run test --filter=@hsm/web --only --concurrency=1`, PATH prefixed with
`D:\hsm\.tools\corepack;D:\;`, scoped `NODE_OPTIONS=--max-old-space-size=1024`:
133/133 files, 1003/1003 tests PASS, configured coverage floors PASS, exit 0,
10m05.787s (`.tools/audit-002-pinned-full.log` and `.exit.txt`). Static checks
and full Web regression pass; actual full browser run remains final-campaign work.

## AUD-004 calendar boundary correction (RPT-001)

Root cause: four timestamp report families use `< To midnight` rather than the
midnight following the inclusive To date. UTC date rendering then mislabels
records during Karachi's first five hours. Payment dates and transport effective
dates already use correct inclusive calendar comparisons.

Minimal correction: a shared report-only helper preserves existing +05:00 range
conversion, advances the exclusive end by one day, and reuses the existing Karachi
formatter for displayed timestamp dates. Only affected timestamp predicates/cells
change. The approved 5000-row limit, money, grants, audit, metadata, canonical
financial readers and date-only reports remain. No migration or history rewrite;
rollback is a normal revert. API date semantics documented in API 08.

RED `.tools/audit-004-red.log`: 32 assertion failures / 1 pass, exit 1, before source
edits. Four families cover ordinary days, month/year end, non-leap February,
leap February 28/29 and maximum accepted date 9999-12-31; four local-display cases
and the unchanged payment-date comparison are included. Corrected focused run
`.tools/audit-004-focused.log`: 33/33 new plus 4/4 existing insights assertions
PASS; command exit 1 on unchanged whole-API coverage floors (two files selected).
Real HTTP `.tools/audit-004-http.log`: 5/5 tests in two files PASS, exit 0,
3m26.7s. New actual API test persists complaints at exact local midnight/midday/
last millisecond/next midnight, then checks one-day report rows, adjacent-day
exclusion, Karachi labels and unchanged metadata/payment dates. Four existing
platform cases (including scoped dashboards/exports and authorization) pass.

Full API `.tools/audit-004-api-regression.log`: 218/218 files, 2239/2239 tests
PASS and configured coverage floors PASS (L/S 85.24%, F 83.23%, B 94.52%). Lint
passes with zero errors. Combined command exits 134 after typecheck exhausts the
scoped 1024 MiB Node heap cap; it is not a full task PASS. Rerunning typecheck
alone with normal Node memory in `.tools/audit-004-typecheck.log`: PASS, exit 0,
56.719s. Combined failure retained; all affected checks have passing terminal
results separately. Normal typecheck memory is required in final acceptance.

## AUD-005 investigation and correction plan (FIN-001/002, OWN-003, RPT-001)

Source confirms monthly selection capped at 2000, overdue candidates capped at
500 and restricted to 400 days, while canonical state still checks agreed grace.
Rent export silently stops at 24 months. None of the invoice/debt sampling limits
is an approved financial definition. Numeric sums may exceed exact JSON integers.

Plan: traverse complete branch-scoped invoice candidates in bounded keyset pages,
reuse the existing canonical balance reader, accumulate money as bigint and fail
explicitly outside safe JSON range. Preserve void/no-charge, adjustments, receipts,
grace and all authorization. Keep the existing 24-month processing bound but reject
larger requests explicitly, as authorized by the directive; do not silently trim.
Correct maximum-date month arithmetic. No schema, policy or history rewrite.
Rollback: ordinary revert of the isolated correction.

Before source edits, `.tools/audit-005-unit-red.log`: 3 failed / 1 passed, exit 1
(unsafe aggregate, 25-month silent clipping, December 9999 overflow; exact 24-month
range already passes). Disposable PostgreSQL reproduction is pending: 2001
invoices with an approved partial receipt, >500 overdue candidates, and >400-day
unpaid debt. Performance observations will inform AUD-012, not justify sampled sums.

PostgreSQL RED terminal result (`.tools/audit-005-pg-red.log`): all three cases fail,
exit 1. Overdue assertions return 500/0 instead of 2001; monthly calculation exceeds
the unchanged 30-second timeout before its assertion. This establishes a dependency
on AUD-012: removing caps without reducing round trips would be unsafe. ADR0076
records bounded batch reads sharing the existing adjustment/receipt/grace query
builders and one invoice projection. Existing single-reader contract is retained.

Initial generic Drizzle implementation failed build/typecheck; concrete query
selection corrects it. DB build PASS (`.tools/audit-005-db-build-verified.log`).
Focused DB 84/84 assertions, three files; API 41/41, three files PASS; both selected
commands exit 1 on unchanged whole-package coverage floors. New batch source is
included in configured DB coverage; no threshold changed. Corrected real metrics
cases all pass: monthly 2001 invoices with partial receipt (1845 ms), overdue 2001
(1674 ms), old unpaid debt 2001 (1154 ms). The combined PostgreSQL command is still
running neighboring checkout/date cases; no terminal combined PASS claim yet.
No proxy/test timeout increased. Broader report/lock performance remains AUD-012.

Combined API PostgreSQL run subsequently completed PASS: 5/5 tests, three files,
exit 0, 6m19.383s (`.tools/audit-005-pg-verified.log`). Complete metrics, the actual
201-application persisted checkout/replay, and exact Karachi date reports pass.
The existing real invoice-balance tests now additionally compare batch and single
results through the same financial transitions; their execution is pending.

DB PostgreSQL parity/settlement group completed: 26/26 assertions PASS, four files
(`.tools/audit-005-db-pg.log`), command exit 1 on the unchanged seed.ts branch
coverage floor (83.33% versus 85%; seed-failures file not selected). No assertion
or coverage setting was relaxed; seed failure-path verification remains required.

Full API units: 219 files, 2249/2249 PASS, configured coverage floors PASS (L/S
85.26%, F 83.25%, B 94.57%). Combined static/unit command exits 1 on a forbidden
non-null assertion in the new batch unit fixture; replaced it with the known
fixture Stay ID without changing the test assertion. Remaining DB and API static
checks are being run separately. Logs retain the failed command:
`.tools/audit-005-regression.log` and `.exit.txt`.

Additional unrelated local-environment work appeared during execution:
`infra/local-env.mjs`, `infra/dev.ps1`, and local-environment unit fixtures/tests.
Preserve and exclude these from this remediation commit. Current local runs
describe their actual working tree; final coordinated source provenance must
account for concurrent workspace changes rather than claim a frozen clean checkout.

Corrected full DB static/unit run: 3/3 tasks PASS, exit 0, 3m08.047s;
37/37 files and 780/780 assertions, configured L/S 98.38%, F 98.74%, B 98.81%
(`.tools/audit-005-db-regression-verified.log`). This includes 24 new batch tests
plus four unrelated local-environment cases, excluded from this correction's
staging. Full API static and seed error-path coverage verification still pending.

Final separate terminal checks: API lint/typecheck 2/2 PASS, exit 0, 2m34.171s
(`.tools/audit-005-api-static.log`); seed/migrations 14/14 tests, 100% seed coverage,
exit 0, 1m22.401s (`.tools/audit-005-seed-coverage.log`). Existing seed coverage
floor is satisfied through its success and error-path suites; the earlier selected
financial command's exit 1 is retained, not relabeled. All affected regression
categories now have passing checks. No financial history, schema, grants, test
timeouts or coverage thresholds changed. Final coordinated acceptance and wider
AUD-012/AUD-014 assessment remain open.

AUD-009 partial checkpoint (OWN-003 / MGRD-004 / PAY-004): confirmed that
Actions Required rendered plain text. Payment proof action now opens a named,
live finance_view-authorized branch and the existing submitted-proof review queue.
Owner all-branch mode uses only returned owned branch choices; branch dashboards
retain their exact branch. Permission refresh hides the queue while preserving
its mounted state; definitive denial removes it. Initial test RED establishes the
missing component, then exposes a shared-query remount/refetch loop (corrected).
Focused proof/platform/payment group passes 9 assertions; selected command exits
1 on unchanged whole-package coverage floors. Initial typecheck catches an
incomplete access fixture, corrected with the full typed DTO. Final static recheck
is pending. Other four actions, direct-link navigation, complete all-branch paging,
keyboard/browser verification and full regression remain open; AUD-009 is partial.

AUD-009 proof checkpoint static recheck: lint/typecheck 2/2 PASS, exit 0,
38.651s (.tools/audit-009-proof-static-verified.log). This supersedes the
pending static note above; broader AUD-009 acceptance remains open.

## AUD-009 booking request queue checkpoint (2026-10-28)

OWN-003 / MGRD-004 / BKG-004 / ACC-002: the booking action now opens the
existing review interface for a named authorized branch with booking_manage.
The additive branch-booking query `queue=pending_requests` matches the dashboard's
persisted `pending_request` count, before cursor/limit. Default history and
Customer endpoints are unchanged. Existing projection still displays elapsed
request deadlines as expired; this filter neither reactivates them nor permits
new actions. All-branch selection uses current returned owned branches; complete
owner paging and direct-link routing remain separate AUD-009 gaps.

RED: service rejects the new queue parameter; SDK omits its serialization.
Corrected service and SQL-predicate assertions cover strict queue values, exact
branch and filtering before the limit. Initial Web assertion mistakenly retained
the proof queue's expected parameter; corrected to pending_requests/limit20.
Initial SDK lint reports a removed validator's unused import; corrected. Initial
OpenAPI generation used the prior dist; rebuilt API and regenerated both outputs.
The resulting generated diff adds only the optional queue query literal.
SDK complete regression 75 files / 1003 tests and coverage, lint/typecheck/build
4/4 PASS, exit 0 (3m9.43s). Full API/contracts and Web regression/static checks
are in progress. Real PostgreSQL first attempt cannot find a runtime while Docker
is stopped; ready-daemon retry is in progress. No integration/browser PASS yet.

Booking checkpoint verification update: final Web lint/typecheck/build 3/3 PASS,
exit 0, 8m3.16s (.tools/audit-009-booking-web-static.log). Corrected SDK complete
regression 1003 tests and configured coverage, 4/4 tasks PASS. Generated schema
review: exactly one added optional query literal, no other changes. The first
real-container attempt has no runtime; ready-runtime retry hits the unchanged
180-second setup hook and executes no assertions (4m16.212s command, exit1).
Keep this an open acceptance gap; do not call it a failed application assertion
or a real PostgreSQL pass. Full API/contracts and Web runs are still progressing.

Booking checkpoint 863833d is pushed. Complete API/Contracts run: six tasks PASS,
exit 0, 25m36.28s. API 230 files / 2352 assertions, configured L/S84.70%, F82.30%,
B94.56%; Contracts 1072 assertions. This includes the pending SQL-predicate test.
Post-API-unit real-stack retry again times out in the unchanged 180-second setup
hook, exit1, 3m35.754s; no queue assertions execute. Observed disposable ClamAV
container remains health:starting while object storage is up. Stop repeating the
same setup unchanged; retain the explicit PostgreSQL acceptance gap for diagnosis.
Web full regression still runs, without a terminal claim. No new browser proof
or full AUD-009 completion is claimed.

Full Web initial terminal: 140 files, 1031 assertions PASS / 2 FAIL, exit1,
22m20.661s. Failures are unchanged services.spec.tsx's resident/staff interaction
cases hitting their 5000ms limits. With other heavy checks finished, both cases
and dashboard/booking neighbors pass: 5 files / 20 assertions, selected exit1 on
unchanged whole-package coverage floors (40.356s). No test/source/timeout change
for this correction. A complete Web-only repeat is running; the initial result
remains a failed run and is not replaced by selected evidence.

Final Web-only terminal for implementation checkpoint 863833d: all 140 files /
1033 assertions PASS, configured coverage floors PASS, exit0, 11m22.089s
(.tools/audit-009-booking-web-solo.log). No code, timeout or threshold changes
between the initial failed full run, focused retry and this successful full run.
This closes that Web regression retry, not the real PostgreSQL/browser gap or
remaining AUD-009 destinations. Review identified a follow-up: booking decisions
must invalidate both default and pending queue caches plus dashboard counts;
upfront proof review currently invalidates only the default exact key. Reproduce
with failing behavior tests before correcting cache scope. No financial/booking
policy or authorization changes are needed for this cache correction.

## AUD-009 scoped cache correction (2026-10-28)

BKG-004 / PAY-004 / OWN-003 / MGRD-004: RED 2 failed / 8 passed proves decisions
in default/pending booking views leave sibling queue and dashboard caches stale.
Proof rejection independently reproduces stale counts (1 failed / 2 passed).
An initial proof test edit had a duplicate local declaration and no assertions;
that failed transform is retained, then corrected to produce the real RED above.
Shared invalidation now refreshes every booking queue variant for the exact
actor/branch, plus that actor's owner dashboards and exact branch dashboard.
Upfront proof reviews use the same booking refresh; resident proof outcomes
refresh dashboard counts alongside the existing queue/Rent Board refresh.
No unrelated actor or other branch dashboard is invalidated, as interaction
tests verify. Corrected 5-file group: 20/20 assertions PASS; selected command exits
1 on unchanged whole-package coverage floors, not failed assertions. Static
recheck is in progress. The preceding full 1033-test PASS applies to 863833d;
it is not a final-source certificate for this follow-up. Final coordinated
regression/provenance and outstanding PostgreSQL/browser acceptance remain open.

Cache follow-up Web lint/typecheck: 2/2 PASS, exit0, 56.336s
(.tools/audit-009-cache-static.log), superseding the pending static note.

## AUD-009 remaining destinations implementation (2026-10-28; in progress)

User explicitly requested completion of overdue/complaint/checkout destinations,
direct links, Owner paging and database/browser acceptance. Additive exact-branch
queue reads reuse canonical invoice balances and operational complaint/Stay
projections. Counts and destination queries share unresolved/upcoming predicates;
notice/checkout-pending Stays remain included independently of the 14-day window.
Overdue financial eligibility is resolved before the page sentinel in bounded
100-candidate batches across billing months. Existing grants: finance_view for
overdue/proofs, stay_manage for complaint/checkout operations, booking_manage for
booking decisions. No stored state, financial history, grants or retention change.
Direct canonical paths preserve Owner/Manager context, branch and queue through
sign-in; queue branch choices use actual names with bounded cursor paging.
Existing complaint and checkout controls receive exact selected records; unknown
commands lock queue paging/close. New paths and data remain under verification.

RED: missing queue contract; owner regression proves a 100-branch total ceiling.
The owner fix enumerates owned branches in bounded name/id pages, returns a bounded
display page with nextCursor, and computes totals across complete scope. Default
100-row presentation is preserved. Analytics' separate existing ceiling is outside
this queue checkpoint and remains for wider report/performance review. API initial
queue static/build 3/3 PASS; first selected queue/insights group 12 assertions PASS
(selected command exits1 on global coverage). SDK initial static/build 3/3 PASS.
Final source checks, foreign/live grant tests and real acceptance are pending.

AUD-009 current evidence: API initial owner paging RED400 instead of408 beds for
102 owned branches; corrected real PostgreSQL four-case suite PASS (1m26.424s),
covering canonical receipt-paid exclusion before limit, unresolved/upcoming
membership, live grant/foreign-branch denial, and complete102-branch totals/pages.
The targeted real API fixture uses actual Postgres/Redis/auth/production Insights;
file upload/scanner acceptance remains on the full unchanged browser fixture.
Initial fixture errors (duplicate linked resident; missing Stay version/transition)
were corrected to satisfy existing constraints, without changing those guards.
Web focused67 assertions PASS (selected exit1 on global coverage); final Web
lint/typecheck/build3/3 PASS. Contracts1073 + SDK1011 units/coverage and all eight
shared tasks PASS. API combined command stopped at test-fixture type errors before
its full units; those errors are corrected. A separate RED catches empty overdue
batches against the existing nonempty canonical reader contract; caller now returns
an empty page first. That patch and typed fixtures are under focused/real recheck.
API final static/build3/3 PASS (1m31.262s). No unchanged shared/Web build is repeated.
Browser journeys now cover the new paths/operations/paging without catalog or
budget changes; execution waits for the sequential database check to finish.

AUD-009 implementation checkpoint: final scoped database run PASS5/5, exit0,
59.337s (.tools/audit-009-final-real-http.log), including all three authorized empty
queues after the canonical nonempty-batch guard fix. Focused API20/20 assertions
PASS (selected exit1 on unchanged global coverage). Existing final Web build3/3,
Contracts/SDK8/8 and their1073/1011 tests remain valid; no producer/SDK/Web source
changes invalidate them. Real browser journeys and final API/Web regressions remain
pending and will run sequentially. No timeout, scanner, coverage or security gate
was weakened. Underlying generation changed one new queue path/operation and Owner
pagination metadata; source-contract docs and migration note (none) are updated.

AUD-009 real Chrome acceptance at efd137b: four selected extended existing journeys
PASS, zero failures/skips, exit0, 7m1.667s. Evidence:
.tools/audit-009-browser-acceptance.log/.xml and checkpoint source hashes in
.tools/audit-009-checkpoint.json. Covers complaint resolve/reopen/accept, checkout
and frozen settlement/refund, Owner direct links/reload/keyboard activation,
102-branch dashboard and queue paging, Manager exact branch/foreign denial and
live grant revocation. Original private reporter/catalog and timeouts unchanged.
Full API-only then Web-only regression remains pending; do not repeat already
verified database, SDK/Contracts or production build without a source change.

AUD-009 final API regression for efd137b: 232 files / 2368 tests PASS,
configured coverage PASS (L/S84.77%, F82.31%, B94.49%), exit0,14m30.423s.
Evidence: .tools/audit-009-api-final-verified.log. The earlier combined attempt
stopped at fixture typecheck before units; this is its separate terminal unit
certificate. Final API static/build already passed. Browser4/4 and real database5/5
remain verified against unchanged source. Final Web-only regression is running;
no other heavy test run is launched by this audit.

AUD-009 first final Web run: 141 files /1051 assertions PASS, one existing report
choice interaction exceeds its unchanged5000ms test budget (5044ms), exit1,
14m57.888s. No product assertion failure. Isolated original report-filter file9/9
PASS, paging case2275ms, selected exit1 on global coverage. Do not relabel the
failed full run or repeat it unchanged. Test-only correction scopes repeated role
queries to the already named Report building fieldset; all original interactions,
assertions,20-choice boundary and timeout remain. Same test then completes1274ms;
all9 assertions pass. New full Web checkpoint is warranted after this changed
source. Production source, API, SDK, database/browser evidence remain unchanged.
Final API2368/232 files and coverage PASS is retained. No additional rebuild or
OpenAPI generation is needed for this test-only change.

## AUD-009 closed scoped acceptance (2026-10-28)

Implementation efd137b; test-only performance checkpoint d861a41. Final Web
142 files /1052 tests PASS, configured L/S99.77%, F98.90%, B97.41%, exit0,
13m51.5s (.tools/audit-009-web-complete.log). The scoped report-choice test passes
inside this full run in824ms with its original5000ms budget and every assertion
retained. Initial timed-out full run and both focused results remain recorded.
Final API232 files /2368 tests/coverage PASS; Contracts1073 + SDK1011 PASS;
Web/API static/build gates PASS. Five real PostgreSQL/Redis/auth scenarios and
four real Chrome journeys PASS against unchanged production implementation.
Generated-schema AST review records one new queue operation/path and additive
Owner pagination metadata only. .tools/audit-009-checkpoint.json and
.tools/audit-009-verification.md preserve revision, command/log and source hashes.

Closed AUD-009 scope: three outstanding operational destinations, direct paths
and reload/login preservation, keyboard activation, Owner102-branch paging/totals,
exact Manager/Owner authority, foreign denial, live revocation, empty queues,
canonical financial eligibility before paging, existing complaint/checkout controls.
This is not completion of allAUD-001..015, the complete19-scenario system suite,
physical Android acceptance, hostedCI or deployment. PR creation remains unavailable
through the previously checked GitHub connection; feature commits are pushed.
Next finding: AUD-008. No unrelated mobile/Login changes or data were committed.

## AUD-008 complete audience correction (2026-10-28)

Root cause: candidate limits5000 before deduplication silently omit intended
recipients and still mark sent. Real PG RED proves5000 notices for5001 eligible
Customers (.tools/audit-008-recipients-red.log), exit1. Correction: bounded500-user
keyset pages with EXISTS membership on unique users; repeatable-read snapshot
retains one delivery-time audience across pages. All inserts, count and job ack
remain in one transaction under live lease/announcement locks. Failure between
batches rolls back all notices; retry restarts atomically without duplicates.
No external-provider delivery claim, channel/preference change or historical resend.
ADR0080 records scope, snapshot, performance risk and no-migration note.

Focused real PG delivery5/5 passes (1/5000/5001 active Customers, interruption
rollback/retry, cancellation, mismatched/expired leases). Original membership
fixture incorrectly attempted two live assignments per Manager and was rejected
by the existing guard; corrected current/historical memberships preserve that
constraint and explicitly test its rejection. Corrected membership5/5 passes
for >10000 membership rows, all_managers/city/selected_branches and dedupe/scope.
Logs .tools/audit-008-recipients-focused.log and
.tools/audit-008-membership-corrected.log. Selected commands exit1 on unchanged
seed-only package coverage floors; all ten actual tests pass, not full DB acceptance.
Worker delivery/outbox neighbors23/23 assertions PASS, selected exit1 on global
coverage (.tools/audit-008-worker-focused.log). Initial DB static/build3/3 and
expanded static2/2 PASS; final DB/Worker static check is running. Full regression
is deferred to the one coordinated campaign under the accelerated user directive.

Next: AUD-011 safe phase/entrypoint reconciliation. AUD-010's old top-row Web
pending label is reconciled to implemented/acceptance pending using existing
0c1b13c..d897b84 checkpoints; no code is reopened or fresh acceptance fabricated.
See audit-remaining-work-20261028.md for dependency order and final campaign scope.

AUD-008 final focused static: DB + Worker lint/typecheck4/4 PASS, exit0,
1m8.478s (.tools/audit-008-final-focused-static.log). Worker23 assertions and
real PostgreSQL10 cases pass; selected coverage commands remain exit1 on their
unchanged whole-package floors. Status: IMPLEMENTED — FOCUSED VERIFICATION PASSED
— FINAL ACCEPTANCE PENDING. No full regression was run for AUD-008.

## AUD-011 active phase documentation reconciled (2026-10-28)

Confirmed conflict: AGENTS.md and05-roadmap.md identified Phase3 as current while
STATUS recorded later Phase9/10 local checkpoints. Updated only the active phase
paragraph/rule in AGENTS; retained its historical phase directive by explicit
supersession, all original requirements, and the user's separate unstaged Turbo
block. Roadmap/status/development rules now agree: audit remediation, focused
implementation, frozen source, one coordinated Phase11 final acceptance campaign.
No Phase12/deployment. HostedCI and physical/operations evidence remain explicit
blockers/pending; AUD-003 restart persistence remains the accepted exception.
Architecture no longer describes the current work as an old CI repair. Q20 and
ADR0079 implementation status now reflect existing filter/Chrome evidence, with
final coordinated acceptance still pending. No SRS/business-policy change.
Manual verification compares active scope, accepted-history references, deferrals
and local links; no runtime tests or full regression required for this docs-only fix.
Decision: active entry points follow current user-approved audit scope; historical
phase text is retained as superseded. Next AUD-012 performance evidence, then013.

## AUD-012 representative observations

Six real PostgreSQL measurements passed with API lint/typecheck. See STATUS's
2026-10-28 AUD-012 checkpoint and .tools/audit-012-profile.log. On1001 invoices,
all formats preserved output with77 queries and4.4–5.8s elapsed; the candidate
query used resident_invoices_due_idx. The warmed same-actor delay was464ms.
No production bottleneck was established by this bounded workload. Retain the
larger-export/proxy-overhead risk for coordinated acceptance; no timeout or
business-rule changes were made. Initial static errors are retained in.tools.

## Final acceptance campaign (2026-10-29)

Report: [HSM_AUD_001_015_FINAL_ACCEPTANCE.md](HSM_AUD_001_015_FINAL_ACCEPTANCE.md).
Source `7b8837a`, plus `1970a28` (one API test file) for the browser campaign and API
rerun; production source hash unchanged. Real integration: DB 51/51 files (361),
Worker 25, API 93/93 files (443), Files 9, Notifications 11; Chrome 19/19 scenarios.
First-run DB failures were environmental (container readiness, CPU contention,
host/VM clock skew proven by probe) and passed unchanged on rerun. The AUD-009
`dashboard-booking-queue` acceptance test had never executed; on first execution it
failed on its own invalid seed data (deferred inventory-source guard), corrected in
`1970a28` with assertions unchanged. API `auth-delivery` setup exceeded its 180 s
hook under memory pressure and passed on rerun. No limits or assertions were changed.

Final classification: VERIFIED COMPLETE — AUD-001, 002, 004, 005, 006, 007, 008,
009, 010, 011, 013 (local evidence). ACCEPTED EXCEPTION — AUD-003 restart
persistence. IMPLEMENTED — ACCEPTANCE PENDING — AUD-012 (larger export/proxy),
AUD-014 (clean-revision certificate, hosted CI), AUD-015 (physical device, full
operational recovery). Hosted CI BLOCKED; device acceptance PENDING.
