# Phase 3 scheduled posting transition review

Status: user explicitly APPROVED guarded source implementation on 2026-10-20 in this conversation, with no deployment. Source transition is authored; acceptance remains open.
References: AUD-004, FIN-002, RENT-004, ADR0048.

## Approved source change

Additive Drizzle0033_guarded_system_posting permits NULL only in resident_charges.posted_by_user_id and resident_invoices.issued_by_user_id after0031/0032 establish integrity. Existing foreign keys remain. Additive0034 also requires the charge kind to match its actual authorized schedule item at deferred completion. Adjustment/fund actors remain mandatory. Existing human records and strict human posting commands retain their actual user identity; no Owner account or synthetic login becomes a worker actor.

The shared posting component validates exclusive human/system scope, reuses its existing integer-paisa financial calculation results, and inserts a new origin only for a new system charge/invoice. Recovery does not relabel an existing human or system source. Explicit zero creates neither financial sources nor origin. No new prices, defaults, receipts or Paid flags are introduced.

The immutable origin binds exact branch/Stay/agreement, charge, invoice and actual posted execution. Deferred checks reject missing or mixed attribution. Execution requires matching live outbox lease, exact job identity, system audit, schedule progress and acknowledgement in one transaction. A caller must complete those proofs before commit; the private component alone cannot commit actorless records.

No migration is applied to a shared database. Public financial/admission routes and production billing producers remain disabled pending the required transaction/worker implementation and acceptance. No deployment is authorized.

## Approval and risk history

Automatic approval review rejected the original combined operation because it removed mandatory actor constraints before the promised integrity guards/runtime proof existed, risking unaudited or invalid financial records. That rejected command never executed. The safer guard-first foundation was authored with both NOT NULL constraints intact. After reviewing this concrete proposal, the user explicitly approved the separate guarded source implementation. The approved follow-on does not bypass the guards.

A defect in the integrity guards could admit an invalid financial record. Real PostgreSQL provenance, rollback, replay, concurrency and worker tests plus successful exact-source CI remain blocking requirements. Their success cannot be inferred from local unit tests.

## Evidence and open work

Eleven new unit cases cover exact actorless sources/origin, prior human/system recovery, zero, failed origin persistence, and invalid/mixed attribution. Complete DB units LOCAL PASS219/9 (eleven new plus208 retained),100% L/S/F/B across the seven configured modules,1m08s. This does not cover unexecuted SQL.

Nine additional real PostgreSQL cases cover successful atomic system proof, missing audit/acknowledgement/advancement/execution rollback and committed-origin update/delete/truncate rejection, and authorized schedule-item/charge-kind binding. The existing eight origin tests remain, now rejecting actorless records through the exclusive-origin guard instead of the superseded NOT NULL constraint. All69 real billing-foundation cases across five suites are NOT RUN LOCALLY. Registered-worker stale/replaced leases, duplicate delivery, next-job rollback/recovery and full admission acceptance remain required.

Drizzle generation LOCAL PASS (11.35s);0033 contains only the two approved actor nullability statements and follows the0032 guard migration in source. Initial static FAILED7/8 at three typed Money fixture amounts. Fixed using the existing money(bigint) constructor, without unsafe casts. The preceding0033 normal static LOCAL PASS8/8,1m35s, baseline28 warnings/no new warning. Drizzle drift LOCAL PASS (no schema changes),10.2s. Snapshot review confirms exactly those two field changes and34 sequential migrations. API dependency-aware strict compatibility LOCAL PASS17/17,6m31s, including backend build. Complete current API unit/HTTP regression LOCAL PASS1710/165, L/S92.78%, F86.24%, B96.98%,27m20s; all configured gates pass. Full unchanged Web LOCAL PASS763/89, L/S/F100%, B99.45%. Exact-source CI and real migration/worker acceptance remain NOT VERIFIED.

Worker follow-on prerequisite found during source review: apps/worker/src/process-delivery.ts currently recognizes only files.scan for internal delivery. OutboxRepository.claim retains failed status when leasing a retry, whereas the billing execution guard requires pending status. The registered billing command must explicitly reconcile live retry claims, preserve exact token/freshness and prove rollback/retry before any application billing producer is enabled. This source transition does not claim a running billing worker.

Schedule-item proof follow-on (AUD-004 / FIN-002): source review found that0032 completion binds execution/source scope but not charge kind to the actual authorized schedule item. A ninth real system-origin case is authored for a rent schedule attempting a mess charge; current foundation69 cases/five suites, all NOT RUN LOCALLY. This regression has not been reproduced against PostgreSQL locally. Custom Drizzle0034_billing_origin_item_guard is generated (25s), preserves existing completion proof, and adds exact authorized item binding without schema changes. Final normal DB static LOCAL PASS8/8,1m54s,28 baseline DB warnings/no new warning. Complete units LOCAL PASS219/9,100% L/S/F/B across seven configured modules,1m12s. Drift LOCAL PASS (no schema changes),10.9s;35 sequential migration entries and no0034 schema changes. All69 actual PostgreSQL cases remain NOT RUN LOCALLY; no SQL/runtime/CI PASS is inferred. No producer or deployment is enabled.

## Atomic worker continuation (2026-10-20)

The source-only delivery command and worker registration now exist (ADR0054). Canonical rent/fee planning is shared; one transaction owns exact live proof, financial posting/origin, execution, audit, schedule progression, at most one next job and acknowledgement. Failed retry claims restore pending; typed invalid billing payloads use the existing safe dead-letter classification. Current complete DB unit gate LOCAL PASS301/13 with100% across13 configured modules. Eight real SQL command cases and one real SQL/Redis worker restart case are authored, NOT RUN LOCALLY. Final normal worker static/full-unit verification is RUNNING. No application producer, migration application or deployment is enabled; exact-source CI remains NOT VERIFIED. Prior dated prerequisites above are retained as history.
