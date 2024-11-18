# Phase 3 functional progress

This is an approximate engineering estimate, not acceptance or a release claim.
Weights remain fixed unless the approved Phase 3 scope changes. Estimates reflect
working workflows and missing integration, not file counts or test counts.

| Workstream                  | Weight | Engineering estimate | Remaining acceptance                                                                      |
| --------------------------- | -----: | -------------------: | ----------------------------------------------------------------------------------------- |
| P3-0 architecture           |      4 |                  75% | Combined architecture and acceptance audit                                                |
| P3-1 data foundation        |      7 |                  50% | Real migrations, seed, constraints and transactions                                       |
| P3-2 manual admission       |     10 |                  35% | Native connection, real transactions, production activation                               |
| P3-2 booking check-in       |     10 |                  10% | Transaction and both clients                                                              |
| P3-3 occupancy              |      7 |                  25% | Integrated lifecycle and concurrency acceptance                                           |
| P3-4 agreements             |      7 |                  65% | Full operational integration and real acceptance                                          |
| P3-5 billing                |     10 |                  35% | Operational posting, corrections and worker acceptance                                    |
| P3-6 payments               |      8 |                  40% | Client recording and real receipt-backed posting                                          |
| P3-6 proof review           |      6 |                   0% | Submission, review and integration                                                        |
| P3-6 funds                  |      5 |                  15% | Deposit/advance/reversal APIs and clients                                                 |
| P3-7 transfer and extension |      5 |                   5% | Transactions, schedules and clients                                                       |
| P3-7 departure notice       |      3 |                  40% | Persisted status, cancellation, staff handling, production activation and real acceptance |
| P3-7 checkout               |      6 |                   0% | Settlement, statement, release and clients                                                |
| P3-8 My Stay                |      4 |                  30% | Finance and lifecycle integration                                                         |
| P3-9 staff operations       |      3 |                  25% | Rent Board and operational integration                                                    |
| P3-10 reports               |      3 |                   0% | Reports, dashboards and export                                                            |
| P3-11 notifications         |      1 |                  25% | Lifecycle producers and real redelivery acceptance                                        |
| P3-12 final acceptance      |      1 |                   0% | Frozen-source coverage, security and automated acceptance                                 |

Weighted estimate: **28.90%, reported as approximately 28.9%** on 2026-10-21.
Fully accepted workstreams: **0 of 18**. Real integration and production readiness
remain unaccepted. The connected notice submission slice has local evidence; acceptance remains open.

Every feature/milestone update must report this weighted estimate and distinguish
implemented, locally verified, integration verified and production-ready status.
Small safety or test milestones may leave the percentage unchanged. Increase an
estimate only when working behavior closes a functional gap with evidence.
Physical-device testing remains Phase 8; automated native acceptance is retained.

## Verified milestone: retained own-notice command

OUT-001 / ACC-004: shared SDK controller retains the original normalized body and
idempotency key after an uncertain outcome, prevents concurrent/duplicate success
submission, and only unlocks a definite initial rejection. Scope is one UI actor
and Stay; no global credential or command storage is introduced.

LOCAL PASS: complete SDK lint, typecheck, build and tests, 4/4 tasks; 605 tests in
41 files, line/statement coverage 99.96%, functions 100%, branches 97.69%.
Evidence: `.tools/phase3-notice-intent-sdk-20261021.log`.
Integration: NOT RUN LOCALLY. Production route activation remains guarded.
CI: latest inspected run 39620113544 failed before job execution due GitHub
billing/spending restrictions; no CI PASS is claimed. This SDK safety milestone
leaves the overall functional estimate at approximately 27%.

## Locally verified milestone: connected notice submission clients

OUT-001 / SEC-003 / ACC-004: actual Web and Mobile own-Stay entry points mount
notice submission, retain the original uncertain command outside refreshing
list/detail renders, require fresh linked authority, and hide private timing after
access loss. Exact body/key replay, emergency reason validation, CSRF/bearer
transport, actor changes and staff exclusion have local interaction evidence.

Client lint/typecheck LOCAL PASS4/4 (.tools/phase3-own-notice-client-static-retry-20261021.log).
The complete Web run passed both affected files (17 assertions), but its overall
result is FAIL:866 passed,2 timed out/868,99 files. Failures: existing admission
submission and marketplace map opt-in each exceeded the unchanged5s deadline.
Evidence:.tools/phase3-own-notice-web-complete-20261021.log. Do not label this Web PASS.
The complete native run is LOCAL PASS269 tests in46 suites, including both affected
files (15 assertions). Lines/statements/branches100%, functions84.61% (floor80%).
Evidence:.tools/phase3-own-notice-native-complete-20261021.log. This precedes invoice UI changes. Earlier native focused failure was reproduced when a
global mock reset erased a lazy native Switch component; application-only mock
resets repair the harness while preserving the actual Switch and all assertions.

This milestone increases notice engineering progress30% to40%, adding0.30 weighted
points: overall27.15% (approximately27.2%). It does not complete notice cancellation,
persisted status/history, staff handling, checkout, container acceptance or guarded
production activation. Fully accepted workstreams remain0/18.

Latest inspected CI39624063157 at980bcde failed before execution:all7 required jobs
steps0, aggregate skipped. GitHub annotation confirms account payments/spending
restriction. Evidence:.tools/phase3-sdk-intent-ci-inspection-20261021.json.

## Locally verified milestone: connected invoice selection and balances

FIN-001 / RES-001 / SEC-003 / PAY-008: actual Web and Mobile Stay entry points now
select bounded named invoice references and load the protected authoritative
balance. Exact paisa display, staff finance_view restriction, own linked access,
lazy reads, pagination, actor changes, safe error/empty distinctions and hiding
cached financial facts after failed revalidation have interaction evidence.

My Stay engineering progress20% to30% and staff operations20% to25% add0.55
weighted points, giving27.70% (approximately27.7%). This credits the connected
read workflow only; payment recording, receipt selection, statements, Rent Board,
other lifecycle actions and real financial acceptance remain required.

Static LOCAL PASS6/6 API/Web/Mobile lint/typecheck tasks. New API assertions36/36
passed. Web invoice component/entry assertions11/11 passed; the six-file diagnostic
had37 passing assertions and one existing admission5s timeout. The unchanged
admission file then passed4/4 in isolation (first case2.855s), supporting resource
contention as a cause, without establishing a complete Web PASS. Native retry
passed26/26 assertions in4 suites, including11 new invoice assertions. A controlled
pending authority response, resolved inside act, repairs the reproduced native
notice fixture race while retaining its original queries, deadlines and all draft
retention assertions; it additionally checks the form stays hidden before access
succeeds. Selected API/native commands still exit1 on unchanged whole-package
coverage floors, so these are focused assertion results, not full package passes.

Evidence: .tools/phase3-invoice-reference-static-retry-20261021.log;
.tools/phase3-invoice-reference-api-focused-retry-20261021.log;
.tools/phase3-invoice-reference-web-focused-20261021.log;
.tools/phase3-admission-submission-isolated-20261021.log;
.tools/phase3-invoice-reference-native-focused-retry-20261021.log.
Five real PostgreSQL collection cases are committed, NOT RUN LOCALLY. CI and
production readiness are unverified. Fully accepted workstreams remain0/18.

## Locally verified milestone: core staff payment recording clients

PAY-008 / FIN-001 / SEC-003 / ACC-004: actual Web and Mobile staff Stay entry
points now connect explicit draft amounts, named invoice allocations, review,
direct-receipt confirmation, retained immutable command/key retry and correlated
server receipt reads. No invoice Paid state is calculated from an upload or the
client draft. A failed current grant refresh hides cached receipt facts. The
receipt must match the acknowledged payment ID, number and amount before display.

Payment engineering progress25% to35% adds0.80 weighted points, giving28.50%
(approximately28.5%). This credits the core source/local workflow only. Optional
direct proof upload, receipt history/PDF, finance-only Rent Board entry, real
transaction/rollback/outbox acceptance and guarded production activation remain.
Customer proof submission/review is a separate unimplemented workstream.

LOCAL PASS: client lint/typecheck4/4,2m59s; complete SDK698/45 and4/4 tasks,
lines/statements99.96%, functions100%, branches97.72%. Web22/22 affected assertions
and native22/22 affected assertions passed; each includes9 new payment cases.
The selected Web/native commands exited1 on unchanged whole-package coverage
floors. These are focused assertion results, not complete package passes. The new
Web hook has lines/statements/functions100%, branches90.47%. Native hook coverage
is not inferred from the Web result. Initial Web19/20 diagnosed missing render
synchronization in one fixture; it now waits for the access-error state before
checking absent cached facts. Privacy assertions and deadlines remain unchanged.

Evidence: .tools/phase3-payment-clients-static-20261021.log;
.tools/phase3-payment-intent-sdk-retry-20261021.log;
.tools/phase3-payment-web-focused-retry-20261021.log;
.tools/phase3-payment-native-focused-20261021.log.
Real financial integration remains NOT RUN LOCALLY. CI39650006944 at20dc77c
started0 of7 required jobs because GitHub billing/spending restrictions persist;
aggregate skipped. Production readiness is unverified. Accepted workstreams0/18.

## Locally verified milestone: optional direct staff payment proof

PAY-008 / SEC-003: both recording forms reuse the existing private upload/scan
pipeline with payment_proof purpose. Explicit attachment selection blocks review
until clean readiness; removing it clears the reference from the actual payment
request. The review discloses attachment without exposing private IDs or URLs.
Native uploads bind the current actor; the picker still removes only its app-cache
copy. The existing server rechecks ownership, private bucket, purpose, clean SHA
and verified path under a lock, with sensitive audit inside the payment transaction.
No customer-submitted proof approval or Paid inference is added.

Payment engineering progress35% to40% adds0.40 weighted points:28.90%, approximately
28.9%. Customer proof submission/review remains0%; receipt PDF/history, finance-only
staff entry, real integration and guarded production activation remain pending.

LOCAL PASS: static4/4 plus final typecheck2/2 (1m36s); full Mobile unit249/21,
lines/statements/functions100%, branches99.64%. Web20 distinct affected assertions
passed across the initial19-case run and updated11-case payment run. Native33/33
assertions passed in4 suites, including11 payment,9 picker,10 directory and3 entry
cases. Selected Web/native component commands exit1 on unchanged whole-package
coverage floors; no complete component/package acceptance is claimed. Actual
object-store/scanner/payment transactions are NOT RUN LOCALLY and CI is unverified.

Evidence: .tools/phase3-direct-proof-clients-static-20261021.log;
.tools/phase3-direct-proof-final-typecheck-20261021.log;
.tools/phase3-direct-proof-web-focused-20261021.log;
.tools/phase3-direct-proof-web-clear-retry-20261021.log;
.tools/phase3-direct-proof-mobile-unit-20261021.log;
.tools/phase3-direct-proof-native-focused-20261021.log.
Fully accepted workstreams remain0/18. Physical-device testing remains Phase8.
