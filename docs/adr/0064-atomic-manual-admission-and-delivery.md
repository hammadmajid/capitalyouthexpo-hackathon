# ADR 0064: Atomic manual admission and recipient-free delivery

- Status: Guarded source implementation; local and real acceptance pending
- Date: 2026-10-21
- Refs: STAY-001, RES-001/003/004, RENT-003/004, FIN-004, AUD-004, NTF-002, SEC-003, ACC-001/004; CHG-009/010/012/014

## Decision

Compose the verified private target, actual conflict, current agreement and explicit relationship components inside the caller's single transaction. Required authorization proves live actor/session, current Owner or explicit Manager stay/rent/finance grants, ordered actor/linked-account locks and applicable branch admission requirements. There is no authorization fallback or new production admission route. Application-level authorized idempotency and complete HTTP/Manager/session/client acceptance remain required.

Preserve explicit historic billing start separately from actual admission time. Reject future actual admission. Create the active Stay, first physical assignment, immutable agreed policy/catalogue snapshot and canonical assignment claim, then all selected initial obligations/future schedules, history, human audit and outbox. Write assignment before agreement: the database agreement guard derives a manual Stay's room-type scope from that assignment. Deferred claim constraints still require the exact complete graph at commit. Any mandatory failure propagates for rollback. Required deposit terms never fabricate a payment, receipt or Paid state.

Commit a strict recipient-free resident.lifecycle event bound to Stay and immutable admission history. This avoids acquiring recipient FK locks while holding inventory. Worker delivery validates the exact original Stay, history, first assignment/agreement and current Owner; it publishes fixed private notices in sorted account order and acknowledges in the same lease-bound transaction. An original offline relationship gets no fabricated or retroactive resident recipient. A changed link suppresses the former recipient. Generic notices carry no names, contact details, private documents, amounts or inaccessible deep links.

The server package exports the guarded transaction component for server callers/acceptance fixtures; package export does not register or enable a public mutation endpoint. Existing pricing, delegation, privacy, history and money rules remain unchanged. No deployment or migration execution is authorized by this source change.

## Verification

Coordinator/writer/producer and source-bound delivery units,13 real manual-admission cases across two suites, and six real notification fanout/delivery cases are authored. Normal static LOCAL PASS23/23,6m02s;28 baseline DB,3 notification and1 worker warning with no new warning. Complete DB LOCAL PASS692/29 includes26 coordinator,11 writer and9 producer cases at100% configured coverage. Notifications LOCAL PASS149/7,100% all configured coverage; worker39/6,L/S/F100%,B99.15%. The initial excess-property test-call typing failure is retained in STATUS.md and corrected without removing metadata acceptance. Actual PostgreSQL cases are NOT RUN LOCALLY, exact-source CI NOT VERIFIED. Existing Testcontainers suites, assertions and coverage thresholds are retained.

## Initial obligation regression follow-on

Four RED cases prove that selecting a future/exhausted rent or fee period could bypass the intended initial obligation. Before any relationship/Stay write, reuse canonical rent and independent-fee planners to require a real selected period whose start has begun. One-time periods beyond zero are unavailable. Explicit past cursors remain explicit; no historical arrears, date clamping, payment or waiver is inferred. Four coordinator regressions,14 pure boundary cases and3 actual PostgreSQL rollback cases are authored; local retry pending and real cases NOT RUN LOCALLY.

Initial-start and public contract verification: complete DB LOCAL PASS710/30,100% configured coverage,4m20s; contracts794/49,100%,2m38s; normal static8/8,4m06s. The corrected manual-zero test now uses a genuine partial month; full-month manual amount rejection remains enforced. Three added real rollback cases increase manual transaction cases to16, still NOT RUN LOCALLY. Guarded HTTP composition is tracked separately in ADR0065.
