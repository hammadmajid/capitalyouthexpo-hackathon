# ADR 0047: One canonical agreed-rent persistence component

- Status: local unit/coverage and strict compilation verified; real transaction acceptance pending
- Date: 2026-10-19
- Refs: RENT-003/004, FIN-001/002, PAY-008, ACC-001/004, CHG-009, ADR0046

## Decision

Use one internal Drizzle transaction component to persist a prospective agreed rent
period as an immutable charge, source-linked receivable debit, issued invoice and
exact invoice/charge link. Reuse the verified shared rent planner, bigint paisa and
JSON range checks. Caller supplies the already authenticated human actor; clients
cannot choose authoritative charge amounts, source keys or posted state. Explicit
manual partial amounts are accepted only where the agreed planner permits them.

The component locks the exact scoped Stay, requires a nonterminal state and exact
latest immutable agreement, and validates its snapshotted policy/price identity.
A deterministic period source key and the existing source unique constraint combine
with the Stay row lock to serialize concurrent requests. Recover an exactly matching
existing invoice; reject overlapping, rewritten or incomplete existing postings.
Never delete or silently repair history. Mid-period agreement changes need explicit
adjustments. An exhausted finite period produces no_period; explicit zero produces
no_charge with no payment or Paid fiction. Unresolved manual proration fails closed.

## Composition boundary

This is a rent-only persistence component, not an authorization, full admission,
fee scheduler, financial command or public API. The owning service must lock live
actor/participants and branch hierarchy first, authorize current capabilities before
idempotent replay, and append mandatory history/audit/outbox in the same transaction.
Do not enable an admission route until occupancy/claim and all required initial
financial pieces commit atomically. No internal nested commit is introduced.

Current schema requires a real human posting actor. A scheduled worker must acquire
an explicit system-actor persistence design before use; never impersonate the human
who originally approved an agreement. Fee cadence, deposit, payments, adjustments,
receipts, automatic scheduling and checkout remain separate required workflows.

## Evidence

Unit scope/immutable-source/concurrency-shape/failure tests authored. New unit business
logic coverage gate90% on every dimension is blocking; existing unit cases remain.
Three actual PostgreSQL transaction cases cover concurrent deduplication, complete
caller-failure rollback/retry and exact branch/agreement identity. These real tests
are NOT RUN LOCALLY; no container or admission acceptance is claimed.

Complete local unit suite now passes68 tests/4 suites (43 new,25 retained);
rent writer100% in all coverage dimensions. DB lint/build/strict compilation also passes8/8 tasks;
this does not verify PostgreSQL locks, constraints, rollback or admission behavior.

Admission/agreement creation must independently preserve the original marketplace
quote and its monthly price basis. This component accepts a validated selected-cycle
agreement; it does not convert a quoted monthly amount into weekly/fixed/term rent
or establish customer consent on the caller’s behalf.

## Fee persistence follow-on (2026-10-19)

ADR0049 factors the internal scoped context and charge/debit/invoice writer for
rent and disclosed fees. The exported rent command and all 43 original rent cases
are retained. The original evidence above predates that refactor; the fee/context checkpoint passes 99/5, and the subsequent invoice/grace checkpoint passes the complete 159/7 DB units with 100% coverage across six scoped production modules, plus static 8/8. Real transaction acceptance remains NOT RUN LOCALLY. This does not enable a financial or admission endpoint.

2026-10-20 admission prerequisite: booking-admission-terms.ts and44 unit cases are authored, NOT RUN. The internal constructor binds exact server-derived target/range and selected policy scope/version, clones the original quote and its exact monthly prices/deposit/disclosed fees, validates bounded quoted totals, and rejects unconfigured required fee timing or implicit monthly-to-week/fixed/term reinterpretation. It creates no extra catalogue charges. This implements the existing BKG-004 snapshot rule without a pricing, authorization or schema revision. The caller must still authorize/lock live scope, establish agreed terms and atomically compose Stay, occupancy, required financial sources, audit and outbox. No admission route is enabled or complete.

Admission constructor follow-on LOCAL scoped static PASS3/3,3m51s;47 assertions pass and constructor100% L/S/F/B. Scope binding and timing are separate responsibilities; no new complexity warnings. A review regression reproduced RED1failed/46passed when stale policy selection masked corrupt stored totals; the original opaque producer-fault precedence is restored and tested. Selected command FAILED unchanged whole-API/scoped coverage; full current API remains pending. This does not enable or verify admission transactions or real infrastructure.
