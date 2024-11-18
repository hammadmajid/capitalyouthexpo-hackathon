# SRS v2.14 supplement — Owner setup wizard and optional metadata

User-directed 2026-10-29. Refs ONB-001, OWN-001, PROP-001, ROOM-001..005,
SEC-003, ACC-001/002/006, CHG-005/006/017. This records the user's supplied
setup reference and explicit approval of the two new optional saved fields.

## Six setup screens

1. Basic Information: hostel name/type/description, optional property tier and year.
2. Location & Address: approved city/sector/area, address/landmark, automatic
   foreground location and an explicitly changeable map pin under CHG-017.
3. Building & Rooms: real branch buildings/floors, room types, rooms and beds;
   canonical capacity, price, occupancy, archival and authorization rules apply.
4. Photos & Gallery: actual uploaded clean media, room/bed targets grouped by their
   assigned building/floor. Do not invent a separate floor-photo target or bypass
   scan/publication requirements. Property photos remain separately identifiable.
5. Amenities & Services: actual approved catalog selections and supported services.
6. Review & Submit: preview persisted information from all steps and request review
   through the existing backend completeness/authorization gate.

Draft saving/resumption preserves canonical omission-versus-null semantics. No
step may silently ignore input, fabricate success, publish a hostel, approve itself,
change existing financial terms or hard-delete history. Screen progression does not
invent new server submission requirements. Existing required seat/room photographs
still gate public selectable inventory separately from initial draft submission.

## Hostel type and optional fields

The native chooser exposes **Male** and **Female** only. Existing canonical gender
category values remain accepted for compatibility; boys/working_male display Male,
girls/working_female display Female. Preserve a legacy value when it was not edited.
New choices use the existing boys/girls canonical values. No eligibility change.

The user separately approved optional `propertyTier` (standard/premium/luxury) and
`establishmentYear`. These are real saved main-branch setup metadata, not placeholders.
Tier is owner-declared, not platform quality certification or a pricing policy.
Year is an integer from 1800 through the current Asia/Karachi calendar year.
Omission preserves a saved value; explicit null clears it. Existing draft fields,
Owner-only setup authority, audit, approval and public-disclosure rules remain.

## Migration note

Generate additive migration0060 using Drizzle: nullable branch property tier and
establishment year, a closed tier enum and a structural year-range constraint.
Legacy rows remain null; no invented tier/year or historical data rewrite. Runtime
input validation rejects future years. Apply only after verified backup and local
migration-history preflight, together with the already approved pending0059 if needed.
Update shared contracts, OpenAPI/SDK, both setup writes and authoritative reads in
the same change. Native UI changes after CHG-017 use Metro; no further native module
is required. Focused and physical acceptance are pending until observed results.
