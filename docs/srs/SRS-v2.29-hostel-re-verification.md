# SRS v2.29 — Edit an approved hostel with re-verification (CHG-041)

Approved by the user on 2026-11-15 (answer: "Stay live"). Extends OWN-001 / ONB-001 /
ADM-007 and relaxes TRUST-006 for approved hostels only.

## Rule

- An Owner may change an **approved** hostel's basics (name, logo, category, description,
  contact) and location/address. The changes are stored as one pending revision; the
  approved listing stays live and unchanged meanwhile.
- One open revision per hostel branch (draft or waiting for review). The Owner saves
  drafts, sends them for re-verification, or withdraws them. Sent changes are read-only
  until decided or withdrawn.
- A Verification Admin (or Root) sees the changes beside the live values, then approves
  (the changes replace the live values in one locked transaction; the hostel stays
  approved) or rejects with a reason (live values stay). Both are audited and the Owner
  is notified.
- Hostels that are draft, changes requested or rejected keep the normal setup flow.
  Submitted, under review and suspended hostels cannot take a revision.
- Rooms, photos, amenities, policies, visiting hours and staff are operational settings
  already edited live from Operations; they are not part of a revision.

## Migration note

Migration 0073 adds `hostel_revisions` (additive). Existing hostels are unaffected.
