# ADR 0037: Retain original publication authority on gallery replay

- Status: Repair implemented; focused regression passed; full acceptance pending
- Date: 2026-10-17
- Refs: ROOM-003, ACC-004, SEC-003, AUD-001

## Context

A successful unpublish command makes the current image private. Rechecking only
current publication plus the requested published boolean therefore loses its
original media_publish requirement before stored replay. The regression reproduced
that denial failure; private metadata editing/replay and 21 other assertions passed.
Gallery changes already write a scoped before-image containing the original opaque
version and publication timestamp in the same transaction. Baseline migration 0002
makes audit records immutable, including UPDATE, DELETE and TRUNCATE protection.

## Decision

Retain the existing API body and idempotency primitives. Bind authorization to the
requested version and the immutable before-image, in addition to current state.
When a currently private image action might replay, query the exact branch,
listing_media target, image ID, listing.image.changed action and original before
version, requiring a non-null original publication timestamp. Bound the lookup to
one matching audit record. An original published before-image requires the current
media_publish grant together with listing_edit, even after successful unpublication.

Pass the parsed original version into both service replay authorization and the
repository's standalone transaction authorization. Keep the media/branch locks and
fresh actor checks before returning any stored success. Historical role/grant values
never authorize the current actor; provenance only adds the original restriction.
Private metadata with no published before-image remains listing-edit only.

Add a generated partial expression index for scoped audit-version lookup. Preserve
all existing migration history and audit immutability guards. No new data or role
is introduced; the migration adds only an index. Generation/replay verification is
pending and no database acceptance is implied.

## Consequences

Atomic audit persistence is already required for a successful privileged command;
its immutable version-bound before-image supplies original publication provenance.
The repair needs scoped SQL/predicate, current-grant and private-metadata regression
coverage plus a real PostgreSQL/storage replay case. Existing published-byte,
rollback, privacy and authorization suites remain blocking. The real case is
NOT RUN LOCALLY. Complete API/static/client/UI/CI gates remain required; no package
or security PASS is claimed merely from the focused diagnostic.

## Verification checkpoint

The focused 2026-10-17 diagnostic passed all 43 assertions, including the original
red unpublication replay and exact scoped SQL provenance binding. Its command
still exits one under retained full-package coverage thresholds; no package PASS.
Drizzle generated 0016_lethal_hairball.sql with only the scoped partial index.
Database apply/replay and the real PostgreSQL/storage case are NOT RUN LOCALLY.
Full API/static/client/UI/security and exact-source CI remain pending.

## Prepared query eligibility

Use fixed internal literal predicates for listing_media and listing.image.changed,
matching the generated partial index. Continue parameterizing branch, image and
original version. PostgreSQL matches a partial index predicate at planning time;
parameterized category/action conditions cannot establish that match for a generic
plan ([PostgreSQL 17 documentation](https://www.postgresql.org/docs/17/indexes-partial.html)).
SQL construction assertions cover literals, bound user values and limit one.
Actual index use/EXPLAIN and replay remain NOT RUN LOCALLY. The earlier focused
43-pass diagnostic predates this refinement; renewed verification is required.
