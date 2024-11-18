# SRS v2.2 supplement: revised Phase 2 (2026-10-14)

Approved by the user through the Phase 2 master prompt and latest KYC answer.
Refs: AUTH-C, AUTH-M, BKG-001..009, ROOM-001..002, SEAT-001, SEC-001/003,
ACC-001..003/006, CHG-007. This is a specification, not acceptance evidence.

## Scope and transitions

Combine inventory/setup, public discovery and booking foundations in revised
Phase 2. Reuse organization -> brand (hostel) -> branch; room types, physical rooms
and beds follow. Instant or approval-based bookings are Owner-configurable,
superseding universal approval in BKG-002 only where resolved mode is instant.
No payment gateway, rent engine, resident check-in, complaints, mature reviews,
production launch or store publishing. Phase 1's outstanding acceptance stays open.

## Owner policy and platform invariants

Resolve platform defaults -> hostel -> branch -> room type deterministically.
Missing/null override inherits; explicit unlimited stay uses an explicit value.
Configure holds within separately supplied platform bounds; no scattered guessed
business defaults. Snapshots preserve price, fees and resolved policy/version.
Preserve BKG-001 request cap and BKG-005 prohibition on booking-confirmation fees.
Payment-dependent confirmation remains blocked without approved payment evidence;
this phase does not implement the payment processing/verification workflow.

Owners cannot disable authorization, branch/tenant isolation, account/session
revocation, audit, actor-bound idempotency, scanning, money precision or DB integrity.
Only approved/unhidden/unarchived listings with eligible clean published media are
public. Never disclose private evidence, occupant identity or rent status publicly.

## Booking KYC decision

The latest user answer permits Owners to make CNIC optional. It supersedes their
earlier mandatory-at-confirmation answer and the mandatory interpretation of
CHG-006. Owners select additional document requirements from a platform-approved
closed catalog; unrestricted sensitive free-text requirements are prohibited.
When CNIC is required it gates confirmation. If collected, existing encryption,
purpose-separated HMAC/uniqueness, masking, private storage/scanning and least
privilege remain mandatory. Format/scan acceptance is not government identity
verification. Other booking/profile eligibility requirements remain unchanged.

## Inventory and booking

Use half-open calendar-date ranges [move-in, move-out). End boundary may be the
next booking's start. Holds/blocks/pending-reserving requests/confirmed bookings
conflict with overlapping targets. Whole-room claims conflict with every bed in
that room, including newly added beds. Database exclusion constraints plus live
actor checks and room/user locks defend concurrent requests. Expiry is server-owned;
expired holds cannot be consumed and no client timer controls inventory.

Archive referenced records. Audit privileged mutation in the same transaction.
Snapshots are immutable. Public availability never exposes the conflict reason.

## Client direction

Guest-accessible Home/search/filter/map/details; protected Saved/Bookings/Profile
and mutation actions. Mobile Home scrolls; fixed Home/Map/Saved/Bookings/Profile
navigation. No top city selector or Home quick-filter grid. Shared existing font
and scoped green/off-white/sage tokens follow the reference. No fake notification
counts, hostels, availability, institutional counts or photorealistic marketing assets.
Use real published Owner media or an explicitly neutral placeholder.

## Migration and acceptance note

Preserve migrations 0000–0006 byte-for-byte and historical identity/CNIC records.
Generate additive 0007+ through Drizzle Kit; separate generated custom migrations
may provide extension/exclusion DDL unavailable in the schema builder. No push to
shared DB via drizzle-kit push. Real PostgreSQL/PostGIS replay, Redis, Testcontainers,
API/security/concurrency/browser/native and existing coverage gates remain mandatory.
NOT RUN LOCALLY for container gates; no current CI PASS is inferred.
