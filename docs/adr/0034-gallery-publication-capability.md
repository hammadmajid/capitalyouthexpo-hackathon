# ADR 0034: Enforce the existing media publication restriction

- Status: Accepted; full verification pending
- Date: 2026-10-17
- Refs: ROOM-003, ACC-002, ACC-004, SEC-003, AUD-001

## Context

The existing Owner-configurable media_publish grant was not enforced by gallery
commands. Reproduced regression tests showed listing_edit alone could publish an
image and replay that publication after media permission was revoked.

## Decision

Clarify ADR 0033: listing_edit permits attaching and editing or archiving private
drafts. Publication, changes or archival of published assets, and cover selection
also require media_publish. Apply the same live branch, object and grant checks
before returning a stored idempotent result. Owner authority remains implicit.
Return explicit canEdit and canPublish capabilities on private gallery pages;
canPublish cannot exceed canEdit. Clients preserve drafts but disable restricted
actions when capability changes. Customer document access remains CHG-008.

## Consequences

This enforces an existing restriction and grants no additional scope. No data
migration is required for permissions. Existing clients must regenerate contracts
and supply both capabilities. Real-database grant/revocation/replay regression
coverage remains blocking; its authoring is not a Testcontainers PASS. Retain all
original authorization, audit, integrity and scanner suites.
