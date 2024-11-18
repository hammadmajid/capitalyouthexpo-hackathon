# ADR 0010: Transactional file scan publication

- **Status:** Accepted
- **Date:** 2026-10-08
- **Related:** SEC-003, NTF-002, ADR 0007, ADR 0009, Phase 1 Task 9

## Context

Antivirus and object storage calls cannot participate in a PostgreSQL transaction.
An expired or superseded worker must not publish metadata or delete another
attempt's bytes. A successful scan with a failed outbox acknowledgement must
remain retryable without exposing uncommitted content.

## Decision

Add the internal outbox channel through generated migration 0004; preserve all
previous migrations. Internal jobs contain only a file identifier and use the
existing bounded retry and lease recovery mechanism. They never reach SMTP.

Validate and scan the exact bounded quarantine bytes, then write a unique private
attempt snapshot. Lock the file before the outbox row and recheck the persisted
lease token, expiry, job identity and file metadata. Refresh the clock after both
locks are acquired so waiting cannot retain an earlier lease admission time. Commit the clean digest and
private key, or the rejected verdict, together with the outbox acknowledgement.
Provider calls remain outside the transaction.

A stale attempt removes only its own unpublished private snapshot. A committed
attempt removes quarantine after the transaction. A duplicate terminal delivery
acknowledges its current lease without reading or deleting the verified object.
Cleanup failure may leave a private orphan and cannot reverse a committed verdict.

## Consequences

Five additional mandatory Testcontainers tests use real PostgreSQL/PostGIS,
private S3 and ClamAV. They verify immutable publication, infection rejection,
superseded and expired leases, row-lock contention, and rollback on a real acknowledgement failure.
Historical replay now includes five migrations.

This checkpoint supplies shared scan processing and worker routing. API upload,
completion and audited download routes, and production provider wiring remain
unfinished Task 9 work. Container checks are NOT RUN LOCALLY; CI verification
is required before reporting CI PASS.
