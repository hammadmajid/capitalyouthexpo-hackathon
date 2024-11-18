# ADR 0084: Six-step Owner setup with persisted optional metadata

- **Status:** Accepted; implementation in progress
- **Date:** 2026-10-29
- **Decision owner:** User

## Context

The user supplied a six-screen hostel setup reference and explicitly approved real
optional Standard/Premium/Luxury and establishment-year fields. Prior instructions
require only Male/Female hostel type choices, real floor/room galleries and a full
saved-data review. Existing monolithic native panels do not satisfy that workflow.

## Decision

Use native step screens/panels around the existing SDK, backend permissions, branch
hierarchy, inventory, media, amenities and review commands. Add only the two approved
nullable metadata fields through generated0060; no guessed backfill. Preserve legacy
gender categories behind the two display choices and retain unchanged legacy values.
Do not infer new submission, financial or disclosure rules from reference artwork.
Review displays authoritative saved values and explicit unavailable/loading states.

Keep command drafts/keys in the existing actor-scoped runtime retention boundary;
AUD-003's full-process restart exception remains. Manager invitation and dashboard
references are separate authorized UI work; illustrative email delivery, stock
photos, example counts and certification badges are not backend facts.

## Consequences

Existing API/DB write/audit paths own persistence. One local backup/migration/runtime
update is needed for new columns; preserve existing data, identities and credentials.
Test optional/invalid/future values, omit/null preservation, genuine HTTP/DB save,
version/scope denial and relevant wizard/media/hierarchy physical paths. No final
Owner acceptance follows from this design record.
