# SRS v2.20 � Owner profile evidence refinement

Extends v2.19. User-directed 2026-11-01, OWN-001 / AUTH-C / SEC-003.

- CNIC front/back photos are no longer prerequisites for Owner profile completion.
  Either may be omitted. When both are supplied, IDs must remain distinct.
- Verified email, active session, permanent password, legal identity/CNIC number,
  uniqueness, phone, address and explicit versioned agreement remain mandatory.
- Every supplied file remains actor-owned, private, correct-purpose and clean-scanned.
  Omission on update preserves previous evidence; no identity record is deleted.
- Completion grants existing Owner capability, not verified identity/property status.
  Existing hostel/branch verification and publication controls remain unchanged.
- Owner Profile has a circular photo selector, secure preview and existing moderated
  photo-update path. A photo is never required. Pending selection can be removed;
  approved-photo self-removal is unavailable in the current API and remains pending.
- Identity correction and evidence controls remain in the existing Account review
  workflow; no document uploads appear on the Owner Profile form.

## Migration note

Drizzle-generated 0064 drops NOT NULL only on owner_profiles.cnic_front_file_id and
cnic_back_file_id. It preserves foreign keys, distinct-side check, rows and files.
Test in disposable Postgres before local application. No production deployment.
Rollback requires handling newly nullable rows before restoring NOT NULL; never
invent files or delete profiles to roll back.
