# ADR 0012: Transactional in-app notification publication

- **Status:** Accepted
- **Date:** 2026-10-08
- **Related:** NTF-002/003, ADR 0007, Phase 1 Task 9

## Context

The existing email outbox and BullMQ dispatcher already provide leases and bounded
retries. An in-app notice must not be duplicated on redelivery, acknowledged before
its insert commits, or published by an expired or replaced worker.

## Decision

Use shared server package `@hsm/notifications` for the producer, strict job schemas,
fixed account/security templates and notification publication. Producers accept only
a known transactional event, recipient UUID and operation UUID. Outbox payloads carry
the event and operation IDs; titles, bodies and links cannot be supplied by callers.
Recipient-bound dedupe keys are inserted in the caller's business transaction.

The existing worker dispatches `in_app` jobs through the shared service. Publication
locks the outbox row, refreshes its clock after locking, and rechecks the current
lease token, expiry, channel, event, recipient and payload. A unique notification row
and outbox acknowledgement commit in one transaction. Rollback leaves no notice.
Terminal duplicates and stale leases cannot publish. Typed malformed jobs use the
existing dead-letter policy; database failures retain bounded retry behavior.

Email verification and password reset/change enqueue fixed notices in their existing
identity transactions. Account/security events cannot be opted out. Notices contain
no identity details, credentials or arbitrary links. Manager state templates are
available for the subsequent approved staff-isolation task; no appointment workflow
or later domain schedule is introduced.

## Consequences

In-app delivery is exactly one persisted notice per outbox job, backed by a unique
key and atomic acknowledgement. Existing SMTP remains at-least-once (ADR 0007).
No new database migration is needed. Five mandatory real PostgreSQL tests verify
deduplication, business rollback, acknowledgement rollback, stale leases and actual
row-lock expiry. The compiled API/worker fixture additionally verifies real in-app
delivery alongside the existing email and session assertions.

Inbox HTTP endpoints and client notification screens remain outside this foundation
checkpoint. Later resource links must rerun recipient authorization.
