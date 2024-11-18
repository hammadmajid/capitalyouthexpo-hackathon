# SRS v2.19 — operational Root dashboard drill-downs

User-directed 2026-10-31, HMA-015..018 / ADM-008 / RPT-003 / SEC-003.
Extends v2.18; no financial mutation, subscription or resident-evidence entitlement.

- Root dashboard snapshots open actual user, Owner, Manager, hostel-business, branch,
  booking, complaint-category, occupancy and approved-payment directories. Existing
  operational verification, support and moderation queues retain their actions.
- Reuse organization → hostel brand → branch. A business can have many branches;
  branch/brand organization consistency is already enforced by foreign keys. Owners
  and Managers keep the same account identity; no duplicate user model is introduced.
- Root directories support name/record-ID search, status and relationship filters,
  stable date/name sorting, bounded keyset pages, and Karachi month/quarter/year/
  lifetime cohorts. Cursors bind the directory and filters. Account cohort statistics
  use account registration; business/branch cohorts use creation, not live occupancy.
- Profiles expose only name, status, lifecycle timestamps, role/profile presence,
  ownership/assignment relationships and operational category metadata. No contact,
  password, CNIC, resident identity, complaint free text, room occupant mapping,
  transaction reference, proof or receipt contents are disclosed. Profile reads are
  audited. Other Admin roles, Owners and Managers cannot access these Root directories.
- Booking records are metadata only; Root cannot approve/cancel branch bookings.
  Complaint records show category/status, not resident description or evidence.
  Complaint priority is explicitly not recorded, never inferred. Existing support
  priority and review actions remain in their dedicated operational screens.
- Occupancy means current active placement assignments by branch. It excludes
  bookings/holds; no historical utilization percentage or capacity claim is fabricated.
- Payments show branch aggregates for approved, receipted, non-reversed hostel-direct
  payments, using integer paisa. Selected periods/statistics count actual payments;
  profile totals are lifetime. They are not platform income. Rent decisions remain
  with authorized hostel staff, and existing ledger/receipt guards remain mandatory.
- Eligible ordinary Customer profiles reuse the existing reasoned, versioned,
  idempotent enforcement component. Self, Admin, Owner and active Manager protections
  remain unchanged. Branch profiles link to existing guarded verification/history.

## Migration and acceptance note

Existing tables suffice; no new migration, data rewrite or permission-grant backfill.
New API endpoints and SDK are additive; existing strict profile feature negotiation
remains unchanged. Platform income tracking is still deferred and expenses excluded
per user decision. Nonempty physical scenarios require suitable authorized records;
disposable PostgreSQL fixtures provide isolated operational verification.
