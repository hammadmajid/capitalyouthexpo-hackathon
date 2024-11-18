# ADR 0068: Scoped CSV validation and immutable inventory import history

- **Status:** Accepted; implementation and targeted verification complete
- **Date:** 2026-10-25
- **Requirements:** PROP-001, ROOM-002, ACC-004, AUD-001; SRS p.16–17

## Context

Phase3 requires approved CSV inventory import. Existing private uploads already
support import files, quarantine, content validation and scanning. The planned
import workflow had no production persistence, API or connected client controls.
Later resident and opening-balance execution must remain outside this phase.

## Decision

Reuse private clean CSV uploads, exact current branch inventory-edit grants,
actor-bound idempotency and transactional audit. Add Drizzle0046/0047 validation
history with immutable source SHA256, row previews, creator and terminal commit
time. Preserve all earlier migration SQL. Only rooms and beds are executable.

Validation checks storage size/digest, parses UTF-8 quoted CSV and records bounded
row errors without creating inventory. Commit rechecks current capacity, labels,
types, scope and clean source under the existing hierarchy locks. All inventory,
terminal state, exact created-identity audit and replay evidence commit together.
Content digests prevent re-uploaded batches from being committed twice.

New rooms and beds are inactive with fresh physical identities; bed ordinals never
recycle. No reservation, occupancy, media publication, pricing snapshot or rent
state is copied. Technical limits of500 records/5000 new beds bound one command;
they do not impose a business limit on branch inventory. File size remains the
existing5MB import limit. Original file-purpose/type/scan protections remain.

Both clients expose templates, checked uploads, private paginated previews and
explicit commit-all. Unknown outcomes retain the original command/key and block
replacement. API responses contain only scoped DTOs; no storage keys, private
download URLs, uploader identity or raw financial/personal fields are exposed.

## Consequences and verification

Failed validation never partially imports; changed source inventory requires a
new validation. SQL guards preserve source/file metadata and terminal history.
There is no XLSX execution or later-phase import endpoint. Current real HTTP8/8,
migration/seed14/2, shared package and affected client/static evidence is recorded
in STATUS.md. Final browser/device and phase regression remain mandatory.
