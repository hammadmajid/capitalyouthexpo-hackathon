# ADR 0033: Controlled listing gallery publication

- Status: Accepted; implementation verification pending
- Date: 2026-10-16
- Refs: ROOM-003, TRUST-003, ACC-002, ACC-004, SEC-003, AUD-001

Publication permission clarification: ADR 0034 enforces media_publish together
with listing_edit for publication, published-image changes and cover selection.
The original decision below is retained as history.

## Context

Phase 2 requires a gallery and cover selection using the existing private upload,
validation and malware-scan infrastructure. Published image reads already require
an explicit publication record, current clean snapshot and approved visible branch,
and verify stored bytes and current metadata again after storage I/O. Generic
private download credentials must never become marketplace assets.

## Decision

Reuse listing_media and files without a new migration. Assigned branch readers
receive bounded private metadata and actual listing_edit authority. Attachment
requires an actor-owned private listing_photo in the configured bucket, a clean
scan, 32-byte server digest, validated immutable snapshot key and file-bound prefix, supported image MIME
and existing 8 MB image bound. Attachment creates an unpublished draft. Existing
active same-branch attachment is rejected under the branch lock.

Require explicit publication choice for metadata edits and an opaque image/version
precondition for edit, cover and archive actions. Bind versions to branch/image
identity, metadata, scan state and immutable file snapshot. Include the version in
idempotency fingerprints and recheck live scope and listing_edit before replay.
Allow unpublication and archival after scan revocation; reject enabling publication
or selecting a compromised image as cover. Preserve original publication attribution
while publication remains enabled. Re-enabling after unpublication records the new
actor and time.

Cover selection makes the selected active image order zero and shifts other active
images by one under the branch lock, without publishing it. Detect database integer
order overflow before any write. Public projection continues to choose the first
currently eligible published image; an unpublished draft never hides a public image.
Archive retains image/file/audit history and an explicit reason. Each operation and
its audit commit in the same transaction, with fresh actor validation after lock
waits and before completion. Return no storage key, digest, uploader identity or
signed URL in gallery DTOs.

## Consequences

Clients must distinguish publication enabled from currently visible: public reads
also require current branch verification, visibility, city and scan eligibility.
Use the existing upload/scan flow and resume pending scanning rather than pretending
it succeeded. Managers may edit gallery metadata only with listing_edit; this does
not grant access to Customer booking evidence (CHG-008 remains Owner-only).
Require unit/HTTP authorization, real concurrent writes, rollback, revocation,
private-object and published-byte tests. Pre-scanned test fixtures do not certify
scanner behavior; existing real scan suites remain blocking. No CI PASS is implied.
