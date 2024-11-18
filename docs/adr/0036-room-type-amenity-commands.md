# ADR 0036: Independent room-type amenity commands

- Status: Implementation in progress; verification pending
- Date: 2026-10-17
- Refs: ROOM-002, ACC-002, ACC-004, AUD-001

## Context

Phase 2 requires controlled branch and room-type amenities. The existing
room_type_amenities association and composite branch/room-type foreign key already
exist. Pricing forms must not silently clear selections that they do not edit.

## Decision

Use separate strict versioned room-type amenity GET/PUT commands, rather than
adding defaulted selection fields to pricing writes. Reuse the approved amenity
catalog and existing listing_edit restriction, with implicit Owner authority.
Assigned readers receive actual names, retired status, edit capability and a
scope-bound version. Lock exact branch and active room type; deny foreign child
IDs opaquely. Bound selection reads to 101 and fail beyond the supported 100
associations rather than truncate or invent empty state.

PUT explicitly replaces the selected codes under If-Match and idempotency. Accept
active catalog choices and retain already-selected retired codes; forbid newly
adding retired or unknown codes. Canonicalize selected codes before fingerprinting.
Reauthorize current actor, branch, active child and listing-edit grant before replay.
Write the scoped association replacement and privileged audit in one transaction,
with fresh actor checks after waits and before completion. Preserve pricing,
fees, identities and archived room history.

## Consequences

No database migration is required for this slice. No new role or cross-branch scope
is granted. Private management needs current version and explicit selected codes;
pricing commands remain unchanged. Public room amenity projection must use a
batched approved-catalog query rather than one request/query per room. Contract,
repository, service, HTTP, SDK, UI and real-transaction/scope/rollback acceptance
are required. Current authoring is not a package, container or CI PASS.
