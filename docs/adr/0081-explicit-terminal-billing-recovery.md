# ADR 0081: Explicit recovery of terminal billing jobs

- **Status:** Accepted remediation; focused verification passed; final acceptance pending
- **Date:** 2026-10-28
- **Requirements:** RENT-004, ACC-004, SEC-003; AUD-013

## Context

Five transient delivery failures leave an outbox job dead. An active billing
schedule can retain that job as its current pointer. Restarting the dispatcher
does not select dead work. Repeated automatic attempts would erase the existing
bounded retry policy; pretending that the period completed would lose rent.

## Decision

Provide an explicitly invoked Worker maintenance command using the existing
trusted database credential boundary. This is an operational capability, not a
new HTTP endpoint, Owner/Manager permission, or automatic dead-letter sweeper.
Require exact branch/job IDs, observed exhausted attempts, a restricted incident
reference, and `--apply`. Do not accept a human actor ID or impersonate the
schedule's original authorizer. Operator identity/access approval belongs in the
incident and existing credential-access records; the database audit says system.

Lock hierarchy, Stay, schedule and job in delivery order. Recover only transient
exhaustion of the still-current, due, active schedule for a live occupied Stay in
an operational hierarchy, with the current valid agreement and no execution.
Reject invalid payloads, invalid-message failures, stale pointers/versions,
foreign branch selection, completed work and live leases.

In one transaction, append `billing.job.recovery.requested` with the previous
dead state/attempt count/error, incident, and exact schedule cursor, then reset
the same job to pending with a fresh five-attempt budget. Keep its ID, payload,
dedupe key and original authorization. Do not advance the schedule, post money,
change prices, grant permissions, or fabricate an execution. Every further manual
recovery requires a separate explicit audited request. Concurrent recovery of
the same dead state succeeds once; other requests fail closed.

## Consequences and migration

The existing worker must claim a new lease and perform the unchanged atomic
billing command. Existing financial source keys and execution uniqueness still
prevent duplicate invoices. Audit failure rolls back recovery. Attempt counts
are per explicit retry budget; immutable recovery audits preserve prior exhausted
budgets. The job row remains durable but its operational status changes.

No schema migration or new public authorization/business policy. No deployed or
existing local finance records are modified by verification. See the operational
[runbook](../billing-recovery-runbook.md). Final combined acceptance is pending.

## Redis dispatch follow-through

The first focused SQL recovery tests proved requeue and direct atomic delivery,
not the complete BullMQ dispatch path. A subsequent real Redis test retained the
original failed attempt and found that resetting the DB counter reused its queue
job ID: restored work stayed pending. Preserve that valid RED evidence.

Dispatch identity now includes the persisted next-attempt timestamp alongside
outbox ID and attempt count. Repeated dispatch of the same attempt remains stable;
an explicit fresh budget has a different persisted due time and cannot be hidden
behind the previous retained attempt. Do not delete retained jobs, shorten their
retention, increase timeouts or change provider message IDs. The outbox ID/payload,
financial dedupe key, schedule cursor, lease claims and atomic acknowledgement
remain authoritative. Existing queued jobs can still complete through DB lease
validation. The real Redis regression must pass with the old failed job retained.
