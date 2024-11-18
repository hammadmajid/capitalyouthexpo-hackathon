# Phase 3 billing delivery verification

Date: 2026-10-20. Refs: RENT-003/004, FIN-002, AUD-004, ACC-004; ADR0054.

Source-only implementation. No migration application, deployment, admission route or application billing producer is enabled. Phase3 is not complete.

## Local evidence

- Complete DB units: LOCAL PASS301 tests/13 suites,100% lines/statements/functions/branches across all13 configured modules. All preceding231 tests remain. Evidence: .tools/phase3-billing-delivery-unit-retry-20261020.log.
- DB static: LOCAL PASS8/8 at the atomic command checkpoint. Two subsequent integration-helper size warnings were split; final worker dependency-aware static/full-unit verification is pending.
- Complete worker LOCAL PASS39 tests/6 suites, L/S/F100%, B99.15%; evidence: .tools/phase3-billing-dispatch-unit-20261020.log. API/worker static LOCAL PASS32/32,16m40s at the runtime checkpoint. Current helper extraction/authorization component static and full units remain pending.
- Initial failing regressions are retained in the retry, future-checkin and dispatch RED logs. The first full atomic unit attempt failed one encoded-date assertion; all300 cases were retained and the future-checkin case brought the full result to301.

## Container commands

Run the same commands on any compatible Docker environment, including Ubuntu GitHub Actions:

```sh
pnpm turbo run test:integration --filter=@hsm/db --filter=@hsm/worker --concurrency=1
```

CI's container-integration job invokes the existing infrastructure coverage producer, which runs the complete integration producers, including these automatically discovered suites. It also retains original migration/seed/constraint suites and all other infrastructure packages. The new tests do not replace any existing suite or whole-application coverage gate. Exact-source CI is NOT VERIFIED until a successful run exists.

PostgreSQL17/PostGIS comes from Testcontainers postgis/postgis:17-3.5; each harness applies the real Drizzle migrations. The worker harness also supplies redis:7.4-alpine and Mailpit. No Docker Desktop dependency is introduced. Clean replay and seed remain covered by the retained DB foundation suites; a successful billing command alone does not prove them.

## New real-infrastructure coverage

All cases below are NOT RUN LOCALLY:

- DB resident-billing-delivery.spec.ts:10 cases, including six concurrent duplicate deliveries, replaced and expired leases, zero/manual/obsolete outcomes, mandatory audit rollback with same-lease retry, exact unique next-job collision rollback, human-source recovery without attribution change, and finite exhaustion without checkout. These exercise the actual command, SQL constraints and transactions.
- Worker billing.spec.ts:1 case using real Redis/BullMQ/PostgreSQL. An intentional transient handler failure persists failed state; the first worker closes; a new worker retries the same stopped message through the actual DB command and creates one obsolete execution/system audit with atomic acknowledgement. This proves stopped-work recovery, not successful rent posting or HTTP admission.
- Worker outbox.spec.ts:1 new real concurrent failed-row claim case retains attempt/error history and grants exactly one pending lease.

The retained69 PostgreSQL billing-foundation cases remain mandatory. The new DB cases bring those billing-focused DB cases to86 across eight suites; the two worker cases are additional. Units use isolated query fixtures only for local command/guard coverage; those fixtures never stand in for real integration acceptance.

## Remaining gates

Real SQL execution, complete migration replay and seed, Redis worker acceptance, API/admission transactions, security audit, complete application coverage and exact-source CI must succeed before acceptance. Admission, initial financial obligations, payment/receipt/deposit/corrections, transfer/extension/checkout, complete resident/staff workflows and reports remain required Phase3 work. No Phase3 completion percentage is inferred from unit coverage.

Initial authorization component: resident-billing-authorize.ts creates a human-audited schedule only inside the caller transaction, with explicit item/cadence/starting cursor. No historical period is inferred. No application caller is enabled. Fifteen local unit cases and three real SQL cases are authored; current verification is pending. SQL cases cover persisted audit/job/schedule, concurrent duplicate rollback and required-audit rejection.

Initial billing coordinator follow-on: initializeAdmissionBilling requires complete explicit rent/fee starting selections, invokes existing human postings and authorizes the following period on its calculated due date. Four additional real PostgreSQL cases cover exact initial human sources, required schedule-audit rollback, explicit zero manual amount and future due-time persistence. All are NOT RUN LOCALLY. Authorization checkpoint316/14 passed its selected source tests, but the new coordinator was not collected and had0% module coverage in that run; it is not coordinator acceptance. Current complete source validation is running in phase3-initial-billing-static-final/unit-final logs. The due-time regression log records actual1 failed/15 passed before its fix.
