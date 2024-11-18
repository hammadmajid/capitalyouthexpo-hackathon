# ADR 0021: Main-branch drafts use existing branch verification states

- **Status:** Accepted
- **Date:** 2026-10-10
- **Requirements:** OWN-001, BRN, CHG-006, SEC-001, ACC-006

## Context

Revised Phase 1 requires resumable incomplete owner setup. Existing branches
require category, city, area, address and location immediately, preventing drafts
without invented values. Existing verification states already cover the lifecycle;
organizations, brands and branches already express the required ownership model.

## Decision

Extend branches through generated migration 0006. Allow missing setup fields for
draft, changes_requested and rejected records. Require the original complete
geographic/address/category fields for submitted, under_review, approved and
suspended states. Keep names/addresses nonblank when required and prevent nullable
composite-FK bypass by requiring city for area and area for sub-area.

Use existing is_primary for the main branch and enforce one unarchived primary
per brand. Add optional nearby_landmark. Preserve composite ownership FKs,
PostGIS geography and existing verification enums. Archive history remains intact.
No parallel hostel model or fabricated location/address is introduced.

## Consequences

Owners can save partial progress and corrections; submission cannot approve a
listing. Public queries must still require approved state and live parents.
Application validation and transactional owner scope remain mandatory. New setup
creation will reuse the existing idempotency transaction context, so resource,
audit and replay result commit together. Migrations 0000..0005 remain unchanged.
Eight real draft/constraint cases plus seven-migration clean replay must pass in
a compatible container environment; local static checks alone do not verify them.
