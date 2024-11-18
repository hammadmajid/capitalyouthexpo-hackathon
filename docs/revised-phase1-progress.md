# Revised Phase 1 implementation checklist

Approved scope: [execution prompt](revised-phase1-execution.md), received 2026-10-22.
This supersedes the active historical Phase 3 assignment, not its approved domain
rules or existing source. Preserve all previous work and planning history.

## Fixed scope baseline

One targeted source pass found existing auth, authorization, onboarding, inventory,
marketplace and booking modules and mounted clients. Visits, conversations and
waiting lists have planning contracts but no operational modules. Existing tests
are historical evidence until applicable source is verified again. COMPLETE is
not assigned from the existence of source or isolated tests.

These are conservative engineering estimates for the listed functionality, not
verified acceptance. Fixed workstream weights sum to 100. Initial weighted estimate
is 52.2%, reported approximately 52%; no milestone increase is credited merely for
a planner without connected persistence/API/clients. Re-estimate only with evidence.

| ID   | Workstream          | Weight | Initial implementation | Classification / remaining                                                                  |
| ---- | ------------------- | -----: | ---------------------: | ------------------------------------------------------------------------------------------- |
| R1-A | Foundation/security |      8 |                    85% | PARTIAL / current startup, scope, upload, error and session verification                    |
| R1-B | Auth/account/roles  |     12 |                    85% | PARTIAL / current end-to-end flow and role/cache verification; provider delivery UNVERIFIED |
| R1-C | Owner/setup         |     15 |                    60% | PARTIAL / effective prices, duplication/import, publication and verification gaps           |
| R1-D | Marketplace         |     18 |                    70% | PARTIAL / discovery/detail parity, compare/share and required disclosure gap closure        |
| R1-E | Booking             |     20 |                    60% | PARTIAL / full request/approval/reservation/evidence/confirmation workflow acceptance       |
| R1-F | Visits              |      8 |                     0% | MISSING operational persistence, API, SDK, clients, events                                  |
| R1-G | Chat                |     10 |                     0% | MISSING participant-scoped history, realtime, attachments, clients and safety linkage       |
| R1-H | Waiting list        |      5 |                     0% | MISSING deduplicated join/list/leave, scoped staff view and vacancy notifications           |
| R1-I | Notifications/jobs  |      4 |                    40% | PARTIAL / existing auth/booking workers; visit/chat/waitlist events missing                 |

Source evidence: apps/api/src/{auth,authorization,management,inventory,marketplace,booking},
apps/web/src/components/{auth,customer-bookings.tsx,branch-inventory.tsx},
apps/mobile/src/components/{auth-flow.tsx,owner-setup.tsx,native-inventory.tsx,customer-bookings.tsx}.
Definitions: docs/api/03-customer.md,05-management-setup.md,06-management-operations.md,
10-realtime-and-jobs.md; SRS p.23, VISIT-001, COMM-001/002, WAIT-001.

Overall HSM percentage: NOT ESTABLISHED. The attached prompt names a 12-phase
roadmap but does not supply a complete weighted requirement baseline for all 12.
Historical Phase 3's 28.9% must never be used as overall HSM completion.

## Dependency order and acceptance

- [ ] R1-A/B: close proven foundation/auth defects without replacing existing systems.
- [ ] R1-C/D/E: close actual setup/discovery/booking gaps and mount required clients.
- [ ] R1-F: visiting hours, scoped request/list/actions, explicit reschedule acceptance,
      cancellation, complete/no-show, one follow-up, audit/history/events, both clients.
- [ ] R1-G: customer/branch conversations, ordered paged messages, reads, clean private
      attachments, revocation/reconnect, scoped realtime, authorized safety linkage.
- [ ] R1-H: exact branch/room preference, active dedupe, own list/leave, permitted staff
      view, source-bound deduplicated vacancy alerts; never reserve or auto-book.
- [ ] R1-I: required phase events, correct live recipients, retry/deduplication and links.
- [ ] Final completeness audit, full applicable non-container checks/builds/security,
      fix failures and rerun affected final gates against applicable source.
- [ ] Required real scenarios preserved/authored: IMPLEMENTED — NOT RUN — DEFERRED TO PHASE 10.
- [ ] All intended source committed/pushed; final system acceptance Phase 11.

## Current implementation

VISIT-001 domain slice: strict request/command/window schemas and a shared transition
planner. Asia/Karachi weekly window boundaries; future-only requested/proposed starts;
reschedule preserves requested time until explicit acceptance, which rechecks hours;
closed states cannot reopen. This is not caller authorization or a connected visit
feature. Persistence, original-time history, live actor/object/branch checks, HTTP,
SDK, mounted clients and durable events remain required. No production route enabled.

Local static verification: LOCAL PASS4/4 Turbo lint/typecheck tasks; five existing contract lint warnings and no new warning. Focused visit assertions27/27 passed; new schemas100% all configured dimensions, planner L/S/F100%, branches97.22%. The selected test command exits1 on unchanged whole-package coverage floors; this is not a package PASS. Evidence: .tools/revised-phase1-visit-static-final.log and .tools/revised-phase1-visits-focused-final.log. Phase-wide verification PENDING. Infrastructure
acceptance DEFERRED TO PHASE 10; final system acceptance DEFERRED TO PHASE 11;
production readiness NOT YET ACCEPTED. No Docker/Testcontainers executed.

## Visit persistence source milestone

Additive Drizzle-generated0035_visit_requests creates weekly windows, visit
requests and branch-bound history snapshots. Source includes active-request dedupe,
state/proposal and rejection checks, foreign-key scope and paging indexes.
Eight actual PostgreSQL scenarios cover immutable history, competing duplicates, historical closure,
proposal/rejection/follow-up invariants, foreign-branch history and rollback.
They are IMPLEMENTED — NOT RUN — DEFERRED TO PHASE 10. Migration generation passed;
Generated custom0036 reuses the existing append-only history trigger. DB static LOCAL PASS7/7 Turbo tasks (31 existing DB warnings, no new warning), including typechecking all authored SQL acceptance scenarios. Journal assertions2/2 passed over all37 migrations; selected command exits1 on unchanged whole-package coverage floors, not a package PASS. Evidence: .tools/revised-phase1-visits-db-static-final.log and .tools/revised-phase1-visits-journal-focused.log. No runtime migration executed.
The visit workflow is still incomplete; estimate remains52.2% (approximately52%).

## Connected visit source continuation (verification pending)

Source now includes guarded HTTP registration, transactional request/list/actions,
preconditioned hours, retained SDK commands, generated paths and actual Web/Mobile
request/account/branch entry points. Corrected retained-intent local-key validation
has a reproduced RED1/4 case; subsequent focused SDK11/11 assertions pass. SDK
static/typecheck/build LOCAL PASS17/17. Initial API/notification static26/26 and
required generation10/10 pass. Selected focused SDK command exits1 on unchanged
whole-package coverage floors; no complete SDK test gate is claimed.

Eight real API/session/branch/concurrency/stale-acceptance/rollback/fanout cases
are authored in apps/api/test/integration/revised-phase1-visits.spec.ts. They are
IMPLEMENTED — NOT RUN — DEFERRED TO PHASE10, in addition to eight SQL cases.
Current UI/access/HTTP tests and final current-source static checks are pending.
Do not advance52.2% merely from mounted but unverified source. Follow-up/interest,
private visit history UX, richer readable labels and remaining other workstreams
remain required. VISITS_ENABLED=false prevents unaccepted runtime activation.

## Visit history/follow-up source checkpoint (verification pending)

Private paged history now retains proposal snapshots and readable visit scope.
Completed visits expose a versioned explicit customer interest response; staff
read only. Generated0037/0038 add immutable, version-ordered response records and
an eligible follow-up index. The enabled-only worker schedules daily bounded
source-bound prompts, skips answered visits and commits its one-shot marker with
the required event. Both clients mount history/response controls. Current source
static/interaction checks are pending; do not count these as verified completion.

Earlier selected assertions: API42/42; Web10/10; SDK11/11; contracts34/34; notice
service3/3. Selected commands still exit1 on full coverage floors. Native2/3 at
last retry; remaining guest fixture corrected, pending rerun. First history static
27/31 failed stale dependency exports plus an exact-optional type, corrected in
source.13 actual HTTP scenarios and11 SQL visit/interest scenarios are authored,
NOT RUN, DEFERRED TO PHASE10. Estimate remains52.2%; no CI/production PASS.

## Basic connected visit milestone: current implementation55.4%

R1-F now receives40% implementation credit for the basic configured-hour/request/
scoped list/action slice, from recorded API42/42, Web10/10, SDK11/11 and native
request/private-access2/2 assertions. This is partial connected functionality;
none of these selected commands is a full package PASS. Other fixed workstream
weights and estimates remain unchanged.52.2 + (8 x0.40) =55.4% revised Phase1.
Overall HSM remains NOT ESTABLISHED. No infrastructure/production acceptance.

History, post-visit response and daily follow-up current-source checks remain
pending and receive no extra credit. The source notification join correction has
a precise RED1/20 reproducer; native tests now await RNTL14 events and wrap query
revalidation in act. New waiting-list schema/contracts and isolated draft source
are in progress, not mounted, and receive no completion credit.

## Current visit uncertainty verification

A deliberate pending parent refresh exposed lost post-visit intent (RED1/7).
The parent now owns the retained command on both clients; acknowledgement/retry
is tied to the exact visit/kind. Private revalidation still hides cached facts.
Web7/7, native6/6 and API63/63 assertions pass; API visit module L/S98.71%,B97.70%,
F94.64%. Notice assertions23/23, visit fanout L/F100%,B97.36%. Selected commands
exit1 on unchanged whole-package floors. Logs are recorded in STATUS; no package,
phase, real SQL or CI PASS follows from these selected results. Last full static
attempt was interrupted by a Windows restart, not completed. Estimate remains55.4%.

Remaining visit work: readable names on list cards, current strict checks,
SDK/history/interest and follow-up/worker checks, plus final applicable phase gates.
Waiting-list drafts are not mounted and receive no credit.13 HTTP/11 SQL scenarios
remain authored, NOT RUN — DEFERRED TO PHASE10. Physical acceptance Phase8; final
system acceptance Phase11; production readiness NOT ACCEPTED.
