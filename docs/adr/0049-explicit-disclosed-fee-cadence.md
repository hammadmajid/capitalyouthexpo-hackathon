# ADR 0049: Disclosed fees retain explicit cadence independently from rent

- Status: implemented calculation/configuration and internal transaction boundaries; API/real transaction verification pending
- Date: 2026-10-19
- Refs: CHG-011, SRS v2.6, RENT-003/004, FIN-001/004, ACC-004

## Decision

Add optional explicit fee timing to the existing immutable billing-policy model.
Owner selects one-time due offset and, where required, a complete monthly fee
cycle/proration. Old policies remain valid but cannot generate a fee with missing
required timing. Preserve original disclosed fee categories, cadence and rates.
A weekly rent amount or cycle never becomes a monthly fee's amount or period.

Factor the existing cycle/proration schemas intact into shared billing values.
Reuse the verified one-period rent/calendar/bigint proration implementation for
each monthly fee with its own disclosed rate and selected monthly subpolicy;
keep rent's fixed-first behavior unchanged. One-time fees retain their exact
amount and a deterministic Stay-wide source. Unknown categories, cadence mismatch,
amount injection and one-time overrides fail before persistence. Manual partial
fee amounts remain unresolved until explicit authorized input, never guessed zero.

The planner computes only one requested fee period. Its bounded source identity
is independent of policy-version changes. Internal human-only rent and fee wrappers
share a scoped Stay lock, latest immutable agreement validation, source/overlap
protection and charge/debit/issued-invoice/link persistence in the caller transaction.
Exact replay recovers the original invoice; mismatched existing sources fail closed.
Zero creates no payment or paid status. The caller must authorize live participants
and hierarchy before posting and include mandatory audit/outbox in its transaction.
No financial mutation route or scheduled-worker authority is enabled by these helpers.

## Migration and acceptance

Extend only optional nested JSON contracts and new explicit Owner policy versions;
retain old agreements/prices and existing physical migrations. Regenerate OpenAPI
and SDK through normal tasks. Existing rent cases are retained, new fee-boundary
and policy idempotency cases are added, and actual PG policy-history coverage is
authored for CI. Shared contracts pass 610 tests/42 suites with configured 100%
coverage and the complete static gate. The expanded DB source passes lint/types/
build (8/8 tasks) and all99 unit tests/5 suites with100% L/S/F/B for the four scoped
posting files. All43 rent cases are retained. The initial fee-suite collection failed
on a bigint-unsafe test title; only that title changed before the successful full
retry. SDK package retry passes3/3 static and366 tests/32 suites; billing settings100%
in all dimensions. A typed adapter omits undefined optional wire fields under
exactOptionalPropertyTypes; generated types are unchanged by hand. Current API
runtime and full dependency-aware client verification remain pending. Four additional real fee persistence tests cover concurrency, exact
replay, cadence separation, rollback and foreign scope; NOT RUN LOCALLY.

2026-10-20 response-validation follow-on (FIN-004 / RENT-003): built SDK accepted a same-scope policy with different graceDays. Twenty failing mismatch cases plus one equivalent-order/undefined control reproduce the defect. The save helper now compares strict-schema-normalized submitted and returned policy facts before success. Complete SDK406/34 passes configured gates, retaining all385 previous cases. Static/consumer follow-on remains pending. This changes no financial policy, permissions, schema or historical agreement; no migration/SRS pricing revision is needed.

Latest financial-response SDK normal static passes17/17 (13 cached),4m28s. Full unfiltered native component regression is running against that rebuilt SDK; final dependent app builds and real CI acceptance remain required.

2026-10-20 API response-binding follow-on (RENT-003 / SEC-003): the original built policy service accepted a same-scope valid response with a different grace period; a failing runtime assertion reproduces it. The service source now requires exact requested local level/scope and strict-normalized policy facts before storing or replaying the response. Request keys parse before execution; authoritative response-schema failures become opaque INTERNAL500. Twenty-three service/HTTP regressions and controls are authored but NOT RUN yet. Verification and real infrastructure acceptance remain separate in STATUS.md. No pricing rule, policy history or migration is changed.

Policy response follow-on focused assertions pass49 tests/3 suites, including all23 new cases and26 prior service/HTTP cases. Selected command FAILED unchanged whole-package coverage; full API and normal transitive static remain pending. The two real PostgreSQL rollback cases are authored and NOT RUN LOCALLY.

Normal transitive API/SDK/Web static follow-on LOCAL PASS37/37 (27 cached),12m53s, including strict source/test types, real-scenario compilation, generated SDK and Next production build. Current full API/Web regressions remain pending; real scenarios remain NOT RUN LOCALLY.

Complete API follow-on LOCAL PASS:1,663 tests/164 suites,24m45s, all configured coverage gates. L/S92.75%, F86.16%, B96.96%; policy service100%all dimensions. Retains all1,640 prior cases plus23 response-binding regressions. Full Web retry is running; actual PostgreSQL rollback scenarios remain NOT RUN LOCALLY.
