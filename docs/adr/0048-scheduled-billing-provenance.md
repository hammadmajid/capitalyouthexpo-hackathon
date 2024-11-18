# ADR 0048: Scheduled billing retains explicit system provenance

- Status: design accepted; guarded source transition authored with explicit user approval; worker and real integration acceptance pending
- Date: 2026-10-19
- Refs: RENT-003/004, FIN-001/002, AUD-004, ACC-001/004, CHG-009, ADR0044/0047

## Context

The verified agreed-rent component records a real human posting/issuing actor.
A recurring worker must not fill those fields with the Owner who once authorized
an agreement, and must not create a synthetic login account. Current charge and
invoice user foreign keys are mandatory; the component remains human-only until
explicit scheduled provenance and its constraints exist.

## Decision

Retain one financial model and shared rent calculation/posting implementation.
Represent human authorization and system execution separately:

- The persisted schedule retains its actual human authorizer and exact immutable
  agreement. Superseding a branch policy never rewrites that agreement.
- A completed billing execution retains its real internal outbox job, scoped
  branch/Stay/agreement, deterministic item/period source and outcome. Retries
  recover the same committed execution; agreement versions cannot bypass the
  existing Stay-wide charge source identity or overlap protection.
- Human postings continue to require their real authenticated user. A nullable
  posting/issuing user is permitted only with an explicitly constrained scheduled
  execution reference. Scoped foreign keys and mutually exclusive origin checks
  must prevent arbitrary actorless charges/invoices. Provenance remains immutable.
- System audit events use the existing nullable audit actor with explicit system
  role and execution/job references. The original human remains the authorizer,
  never the impersonated executor. This adds no human role or public authority.

The internal job carries bounded identifiers/version/cursor information, never
client-selected authoritative amounts, receipts, Paid flags or posting actors.
Its registered worker handler loads the current scoped schedule, exact agreement
and live Stay under the existing transaction/lock discipline. Lock the Stay before
checking/locking the outbox lease. Revalidate the lease token and fresh time inside
that transaction; a stale lease cannot post financial records or acknowledge work.

Commit required financial sources/ledger/invoice links, execution outcome, schedule
advance, mandatory audit, subsequent bounded outbox work and current lease
acknowledgement atomically. Any mandatory failure rolls all of them back. Persist
only bounded next work, not an unbounded future materialization. Zero/no-period
outcomes cannot fabricate a payment or receipt. Terminal Stay state or an obsolete
schedule or agreement must not create a future charge; handle obsolete work explicitly
without silently applying another agreement's amount.

Billing coverage/start and monthly fee cadence still require explicit agreed
terms. This decision does not invent historical arrears, reinterpret a quoted
monthly rent as weekly rent, choose fee proration or change due dates. Reaching an
expected departure stops only the agreed financial coverage; it never checks out
actual occupancy. Closing/transferring a Stay retains all financial history.

## Implementation and acceptance boundary

Use additive Drizzle migrations; preserve existing human provenance and historical
migrations. Extend the existing internal outbox handler registry and shared posting
component only after the new provenance checks exist. Do not enqueue a billing job
that the deployed worker cannot recognize and transactionally complete. Keep the
current component human-only; scheduled posting and incomplete admission/financial
mutation routes remain disabled meanwhile.

Required real PostgreSQL/Redis tests include concurrent duplicate delivery,
lease expiry/replacement, exact tenant/agreement scope, actorless-write rejection,
terminal/amended Stay races, zero outcomes, mandatory audit/next-job failure rollback
and restart/retry recovery. They remain NOT RUN LOCALLY until actually executed.
This ADR is an implementation design, not a scheduler, migration or CI PASS.

## Metadata implementation checkpoint (2026-10-20)

Additive Drizzle0029 adds scoped schedule/execution tables, bounded counters,
closed item/cadence/outcome states, same-agreement charge references and exact
human authorization-audit foreign keys. The actual authorizer is independent of
the original agreement creator; no account is impersonated. Review reordered two
new supporting uniqueness statements before their referencing foreign keys in
this unpublished migration. Existing0000..0028 are preserved.

Custom Drizzle0030 protects immutable execution/history, schedule revisions,
exact internal work identity, live lease proof, factual charge/invoice references
and deferred atomic audit/acknowledgement/schedule advancement. Posted outcomes
remain blocked for human-origin charges. No human actor field was made nullable.
The strict internal payload permits only scheduleId/version/periodIndex; branch,
actor, amount, due date, receipt, Paid and lease fields are rejected. Its
canonical dedupe key normalizes identifiers without financial defaults.

Initial normal DB static LOCAL PASS8/8,1m57s; complete DB unit LOCAL PASS208/8,
all coverage dimensions100% across seven configured modules, including49 new
job-envelope cases and every prior159 case. A small schema constraint refactor
and the new real integration fixtures still require the current static retry.
Two real Testcontainers suites are authored for metadata scope/uniqueness,
authorization evidence, malformed work, live/stale leases, immutable history and
mandatory completion rollback. They are NOT RUN LOCALLY. Manually constructing
metadata fixtures is not acceptance of worker processing or Stay admission.

No production route creates these schedules; no billing event is enqueued by
application code and no billing handler is registered. Actual system financial
origin references, shared posting extension, authorized schedule creation,
registered worker processing and their real concurrency/recovery tests remain
required. This foundation does not decide historical billing coverage or enable
incomplete recurring billing. SQL execution, migration replay/seed and exact-head
CI remain NOT VERIFIED.

Final local checkpoint: strict fixture-ID regression initially FAILED7/8 static;
fixed without casts or weakened types. Retry static8/8 and complete DB208/8
units pass,100% scoped coverage. The final proof-specific assertion refinement
passes normal static8/8 (1m56s), with baseline28 DB warnings and no new warning.
Drizzle generation reports no schema changes (14.6s);31 sequential entries and
new supporting uniqueness order are statically checked. All42 real metadata/proof
cases remain NOT RUN LOCALLY. This does not verify trigger SQL, commit-time
behavior, a running scheduler, financial origin extension or exact-source CI.

Reverse-proof review follow-on:0030 now also requires an actual exact execution
for cursor advancement; same-cursor human resume/stop/supersession requires a
matching immutable before/after audit. Audit proof binds revision/state/job rather
than comparing transaction-start timestamps. No change ends occupancy. Six
additional real PostgreSQL progress cases are authored (total48/3 suites),
NOT RUN LOCALLY. The preceding8/8 static checkpoint predates this test fixture
extension; a serial static follow-on is required after the native full run.

Commit-proof review additionally binds final outbox event/payload/recipient/dedupe
identity to the execution. Four real same-transaction mutation regressions are
authored (current52 cases/3 suites), NOT RUN LOCALLY. The expired-lease fixture
uses matching historical creation/execution/lease values to isolate live expiry,
not a mismatched token/date or a later deferred audit failure. These integrity
checks do not grant authority: future mutations still require live authenticated
actor/session and branch-scoped permission checks. Final static follow-on remains
pending after the native full regression; prior static results are checkpoints.

2026-10-20 final52-case follow-on: normal dependency-aware DB lint/strict source
and test typecheck/build LOCAL PASS8/8,1m52s, baseline28 DB warnings and no new
warning. Complete DB units208/8 retain100% coverage across seven configured
production modules. Canonical0029/0030 table snapshots match and chain correctly;
JSON property order alone differs. Real SQL,52 Testcontainers cases, replay/seed
and actual worker delivery remain NOT RUN LOCALLY / NOT VERIFIED. No system
financial origin or billing worker is enabled, and no Phase3 or CI PASS is claimed.

## Historical guard-first origin checkpoint (2026-10-20; before approved0033)

Automatic approval review rejected removing mandatory financial actors before
corresponding integrity/runtime proof existed. The rejected command did not run.
A safer additive0031 adds resident_billing_origins with unique execution, charge
and invoice identities and exact scoped foreign keys. A separate relation avoids
circular charge/invoice/execution schema imports. Custom0032 makes the execution
reference deferred for one transaction and prepares immutable-origin, exact
system-source, matching posted execution and exclusive human/system checks.

The existing NOT NULL posting/issuing actors remain in the schema and every
generated migration. Current application posting stays human-only; no writer
or worker registration changed. Human records cannot be relabelled as system
records. Source and ledger math are untouched. No new login account or role is
created, no payment/receipt is inferred, and no historical record is rewritten.

Eight real PostgreSQL cases are authored, NOT RUN LOCALLY; current60/4 real
foundation cases remain unexecuted. Normal static/full local units are RUNNING.
The next actor-nullability transition requires separate review of these guards
and real provenance acceptance; this checkpoint neither bypasses the rejection
nor enables system-origin financial writes. These are integrity checks, never
a replacement for current actor/session and branch permissions.

2026-10-20 guard-first follow-on verification: initial static FAILED5/8 at
lint because a SQL constraint-name string triggered the entropy scanner and
a scope callback gained a size warning. Normal SQL parameters and a separate
scope-definition helper resolve both without suppressions. Retry LOCAL PASS8/8,
5m55s, baseline28 warnings/no new warning. Complete DB units LOCAL PASS208/8,
100% across seven configured modules,1m47s. Drizzle drift reports no schema
changes (10.4s);33 entries and both new snapshots preserve mandatory human
actors. New eight real cases/current60 total remain NOT RUN LOCALLY.
A separate guarded source transition proposal awaits explicit user approval;
no nullability change, scheduled posting, deployment or CI PASS is claimed.

2026-10-20 decision: the user explicitly approved the guarded source implementation described in phase3-billing-origin-review.md, with no deployment. Human commands retain their real actor. Automated sources require immutable execution/job/audit proof; real PostgreSQL and successful exact-source CI remain mandatory before acceptance. This supersedes the preceding pending-approval status, not its rejection history or evidence limits.

### 2026-10-20 approved guarded source transition (AUD-004 / FIN-002)

User explicitly approved source implementation with no deployment. Generated0033 follows0031/0032 proof guards and changes only charge/invoice human actor nullability, preserving their foreign keys and all adjustment/fund actor requirements. Shared persistence validates exclusive human/system scope and records exact immutable origins for new system sources only; recovery/zero cannot invent provenance. Human rent/fee commands still require the real actor. Eleven new units and eight additional real PostgreSQL cases are authored; verification is pending. Current real billing foundation68 cases/five suites is NOT RUN LOCALLY. No migration application, registered worker, enabled admission/financial route, infrastructure acceptance or CI PASS is claimed. Earlier pending-approval statements are historical and superseded by the explicit approval, not by inferred verification.

Guarded transition verification: first static FAILED7/8 at three Money fixture types; corrected through the existing money(bigint) constructor. Final normal DB static LOCAL PASS8/8,1m35s,28 baseline warnings/no new warning. Complete DB units LOCAL PASS219/9,100% L/S/F/B across seven configured modules,1m08s. Drizzle drift LOCAL PASS (no schema changes),10.2s,34 sequential migrations; exact snapshot comparison changes only the two approved notNull flags and retains mandatory adjustment/fund actors. All68 real billing foundation cases/five suites and migration SQL execution/replay remain NOT RUN LOCALLY; exact-source CI NOT VERIFIED. Unit coverage is not SQL/runtime proof.

2026-10-20 item-binding review follow-on: a ninth real system-origin regression is authored for a rent schedule attempting to prove a mess charge. Custom Drizzle0034_billing_origin_item_guard preserves prior completion proof and additionally requires charge kind to equal the scoped authorized schedule item. No schema fields change; prior migrations remain intact. The preceding0033 source checks remain recorded; final0034 static/unit/drift verification is running. All69 real billing-foundation cases/five suites remain NOT RUN LOCALLY. No PostgreSQL reproduction or SQL PASS, producer, deployment or CI PASS is inferred. Complete unchanged API1710/165 now passes all configured coverage gates.

Final0034 source verification LOCAL PASS: normal DB static8/8,1m54s,28 baseline DB warnings/no new warning; complete DB units219/9,100% L/S/F/B across seven configured modules,1m12s; no schema drift10.9s,35 sequential migrations and unchanged custom-migration schema snapshot. Current complete API1710/165 and Web763/89 pass configured local gates. All69 real billing-foundation cases/five suites, SQL execution/replay/seed and exact-source CI remain NOT RUN LOCALLY / NOT VERIFIED. No deployment, applied migration, registered billing worker or admission/financial route is enabled.
