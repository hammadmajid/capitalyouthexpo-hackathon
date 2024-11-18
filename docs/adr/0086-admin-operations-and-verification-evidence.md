# ADR 0086: Scoped Admin operations and immutable verification evidence

- Status: Implementation in progress; focused verification recorded separately
- Date: 2026-10-30
- Requirements: ADM-001..010, TRUST-002, REV-006, COMM-002, SEC-003, AUD-001/003,
  CHG-020; SRS v2.16

## Context

Phase1/2 native identity and Root management exist. Remaining staff workflows need
role-specific clients, complete readers and privacy-preserving evidence/history.
Current dossier records cannot reconstruct the evidence seen at an earlier decision.

## Decision

Reuse live role/session locks and exact-intent idempotent commands. Each native module
uses current role gates, actor/signature query keys and post-read authority validation.
Chat and verification file access are explicit justified audited operations with no
automatic retry/cache replay. Sign only clean files currently associated with the
reviewed branch or its currently attached Owner verification documents.

Capture a submission header and every price/photo item in the original Owner submission
transaction. Persist decision-to-submission references. Migration0062 adds three immutable
tables with UPDATE/DELETE rejection; no historical backfill. Comparison returns explicit
unavailable history for legacy submissions, plus only allowlisted fields/items.
Normal participant support messages exclude internal notes before keyset paging.
Owner verification notices commit atomically with the decision and use its event UUID.

## Consequences

Shared API/OpenAPI/SDK rollout and migration are coordinated; applying migration to the
existing development database requires separate approval. No Root identity/grant change.
Source completion and isolated tests do not certify Android. APK/device acceptance waits
until the Phase6 gate; subscriptions, SMS, impersonation and external push stay deferred.
