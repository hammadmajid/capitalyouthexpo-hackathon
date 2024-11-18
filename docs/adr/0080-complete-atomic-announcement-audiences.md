# ADR 0080: Complete atomic announcement audiences

- **Status:** Accepted remediation; focused verification passed; final acceptance pending
- **Date:** 2026-10-28
- **Requirements:** ADM-010, ACC-004, SEC-003; AUD-008

## Context

Delivery capped assignment/branch/Customer candidates at 5000 before user
deduplication. A real 5001-Customer reproduction delivered only5000 notices and
marked the announcement sent. Display limits cannot define the intended audience.

## Decision

Resolve membership as EXISTS predicates on the unique users table, ordered by
user UUID, in500-user keyset pages. Preserve existing eligibility and audience
scope: active Customer accounts, active Manager assignments in nonarchived
branches, and applicable branch owners. Deduplicate before paging by selecting
users, rather than limiting membership rows then deduplicating them.

Retain one PostgreSQL transaction for the live lease, announcement lock, all
notice insert batches, final recipient count and job acknowledgement. Use a
repeatable-read snapshot so the paged audience describes one delivery-time view.
Any failure between batches rolls back all notices and status changes. Existing
outbox retry restarts the atomic operation; existing notice dedupe prevents double
delivery. There is no persisted partial batch or claim of external provider delivery.
Cancellation before dispatch acknowledges the cancelled job without sending.

No new notification preference or channel is introduced. Current announcements
are plain-text in-app administrative broadcasts, separate from waitlist opt-ins.
Existing scheduling/cancellation authority remains unchanged; no new post-schedule
admin reauthorization policy is inferred. The worker owns transactional ack;
generic failure reporting remains sanitized and uses existing retry policy.

## Consequences and migration

Query/result memory per page is bounded500, without a total-recipient ceiling.
Transaction duration grows with the actual audience. Monitor representative
query/lock cost under AUD-012; do not silently shorten audiences or increase
timeouts. A separate durable fanout protocol is unnecessary for this correction.
No schema migration, permission backfill, retention change or history rewrite.
Previously sent truncated announcements are not automatically resent.

Real focused cases cover1/5000/5001 Customers, >10000 current/historical Manager
memberships, owner/Manager dedupe, city/selected branch scope, cancellation, lease
rejection, and rollback/retry between real insert batches. Existing one-live-branch
Manager constraint remains enforced. Final combined acceptance remains pending.
