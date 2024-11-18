# ADR 0070: Mandatory room and bed photos for public selectability

- **Status:** Accepted; implemented and locally verified (real PostgreSQL)
- **Date:** 2026-10-25
- **Requirements:** ROOM-002, ROOM-003, ROOM-004, SEAT-002, SEAT-004, SEC-003, ACC-002, AUD-001

## Context

`docs/06-database-schema.md` defines a publicly selectable seat as one whose room
has an approved room photo and whose seat has its own approved photo (ROOM-003,
SEAT-002). The runtime gallery (ADR 0033/0034) only stored hostel-level photos, so
public pages, discovery aggregates, Available Now, quotes, holds and booking
requests treated photo-less inventory as selectable.

## Decision

- Additive Drizzle migration 0050 adds nullable `room_id`/`seat_id` to
  `listing_media`, with composite branch-scoped foreign keys to rooms and beds and a
  check that a bed photo always names its room. Migration 0051 makes the target
  immutable after attachment. No existing row is rewritten; existing photos remain
  hostel photos.
- The existing gallery API accepts an optional `target` (`room` or `bed`) and
  filters private pages by `roomId`/`bedId`. Authorization, `listing_edit` /
  `media_publish` grants, scanning, idempotency, versioning and audit are unchanged.
  Targets must be current (unarchived) inventory of the same branch.
- One shared SQL predicate decides selectability: a published, unarchived,
  currently clean, verified listing image for the room, and for a bed additionally
  one for that bed. It is applied to public room/bed pages and direct room scope,
  discovery price/availability aggregates, Available Now search, quotes, automatic
  allocation, holds, booking requests and management confirmation (which already
  revalidates public inventory). Scan rejection, unpublication or archival withdraws
  the inventory immediately; nothing is cached.
- Whole-room options require room photos only; no bed is being selected (ROOM-004).
- Public room and bed page rows expose up to 12 published photo IDs, served through
  the existing verified media endpoint. Hostel galleries/cards exclude room and bed
  photos.

## Consequences

Inventory without mandatory photos stays internal (SEAT-002) instead of failing at
booking time. Existing development data needs room/bed photos before it is
bookable; no automatic backfill invents photographs. Mobile management photo
editing is not yet available (the existing gallery editor is web-only); mobile
shows public room/bed photos.
