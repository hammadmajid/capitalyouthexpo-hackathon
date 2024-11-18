# ADR 0032: Scoped listing settings and explicit publication preconditions

- Status: Accepted; implementation verification pending
- Date: 2026-10-16
- Refs: TRUST-006, ACC-002, ACC-004, SEC-003, CHG-007

## Context

Phase 2 needs private current-state listing and approved-amenity management.
Public listing projections cannot safely initialize editing forms. Existing
branch description/contact fields and approved catalog/association tables suffice;
no new identity, money model or migration is required. The baseline API already
documents ETag/If-Match and typed 412 PRECONDITION_FAILED behavior.

## Decision

Expose a no-store exact-branch private listing read with actual edit authority.
Only listing_edit permits minor description/landmark/public-contact and approved
amenity changes. Do not accept category, ownership, name, address or location in
this endpoint; their re-verification rules remain unchanged. Contact publication
requires the explicit existing showPublicContact flag. Never copy private account
contact fields into the listing automatically.

Bind an opaque SHA-256 resource revision to the normalized returned fields,
branch identity, edit-authority flag and canonically ordered selected catalog
metadata. Return it as a quoted ETag and require that If-Match for writes. Recheck
under existing actor/branch locks, then persist fields, selected associations and
audit in one idempotent transaction. Include the original revision in the request
fingerprint. Identical replay rechecks live authority; stale new commands return
the documented typed 412. Revisions depend on content rather than clock resolution.

Public catalog reads are bounded, active-only and contain code/name metadata.
Retained retired selections may be preserved or explicitly removed, but cannot
be newly selected or satisfy public amenity search. Catalog records and audit
history remain retained. Bound private association reads fail rather than truncate.

## Consequences

Editors must load actual configuration before editing, preserve failed input and
require explicit review/reload after a version conflict. Existing publication,
private-evidence, booking, financial and major-field verification rules remain
in force. Require real concurrent-edit, replay/revocation, contact-disclosure,
retired-search and rollback tests. This ADR certifies no product or CI PASS.
