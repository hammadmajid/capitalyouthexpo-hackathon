# ADR 0011: Private file HTTP transaction boundaries

Date: 2026-10-08. Status: accepted for Phase 1. Requirements: SEC-001, SEC-003, CHG-004.

## Context

Upload completion must validate real provider bytes while account suspension and session revocation still take effect before work is queued or a download URL is returned.

## Decision

Uploader-only routes resolve actors through the existing authenticated transport. Every repository transaction locks the identity first, rechecks its account and persisted session, then queries and locks a file scoped to its uploader, bucket and private visibility. Missing or foreign files return the same 404.

Completion reads an authorized snapshot, validates actual size/MIME outside the transaction, then opens a second live transaction. Metadata must still match before persisting a deduplicated scan job. Confirmed invalid content commits rejection before returning 400; provider outages leave it pending and return sanitized 503. Concurrent terminal verdicts supersede earlier validation.

Downloads require a clean file with server SHA-256 and a verified private snapshot key. Sensitive access audit precedes signing within the live transaction. Audit or signing failure aborts the transaction and returns no URL. URLs expire after 60 seconds and cannot be cached by idempotency.

The API and worker use the existing real S3/ClamAV adapters. Integration runs compiled application processes against actual PostgreSQL/PostGIS, Redis, SMTP, S3 and ClamAV. Workspace integration tasks run serially to bound scanner memory; the command is identical in CI and compatible developer environments.

## Consequences

Previously issued URLs may remain usable until their short expiry. Quarantine overwrites cannot mutate verified snapshots. Domain attachments and non-uploader resource grants remain later-phase work; no such access is introduced.
