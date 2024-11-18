# SRS v2.19 — scoped custom amenities

User-approved property lifecycle master, continued 2026-11-02 (LIST-001 / ACC-002).
Extend the existing amenity catalog with organization-scoped owner-defined names and
categories; reuse branch, room-type and room associations. Global approved amenities
remain global. Authorized managers may assign available organization amenities using
existing listing_edit; only owners create, rename or archive their organization's entries.
Foreign organization codes must be rejected in every assignment writer. Names are unique
case-insensitively within an organization and may not duplicate global offerings.
Archival retains associations and audit records. Published property views retain existing
publication rules; custom names do not enter the public global amenity catalog.
No payment, identity, booking or financial permission change is authorized by this addendum.

Migration 0065 adds nullable organization scope, category with existing-row default other,
foreign key and organization/name uniqueness. No table replacement or record deletion.
Generation/disposable validation only; development application remains pending a coordinated
migration gate. Mobile functionality is not accepted until focused checks and device testing.
