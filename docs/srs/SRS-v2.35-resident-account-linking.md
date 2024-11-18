# SRS v2.35 — Customer account linking for manual residents

User-directed, 2026-11-18. RES-001 / RES-004 / AUTH-C / SEC-003 / ACC-004/006.
Supersedes CHG-009's prohibition on contact-based linking only as specified here.

- Email OTP verification and permanent password setup precede first-time Customer
  profile setup. Saving the profile searches for a matching offline manual resident.
- A candidate must be a checked-in manual Stay with state `active`, no closure,
  no linked user, and an unarchived resident/branch/hostel/organization. Phone and
  verified email matches must resolve to the same single candidate. Ambiguity,
  existing account links, or an existing live Stay prevent linking.
- A verified account email matching the resident email links the current Stay
  directly. Comparison is case-insensitive. Closed historical Stays are untouched.
- A normalized phone match alone creates a persistent hostel confirmation request;
  it grants no Stay or financial access. Customers see a pending confirmation message.
  The hostel's Residents queue shows the claimant name, matching phone and resident.
- Only branch staff with live `stay_manage` permission may approve or reject.
  Approval rechecks account eligibility, the unchanged matching phone, and the exact
  current active Stay under transaction locks. A checkout before approval makes the
  request unavailable. Ready, notice, checkout-pending and closed Stays are ineligible.
- Approval atomically sets both resident and Stay account IDs, advances the Stay
  version, and records history and hostel audit evidence. Existing Stay/finance
  records remain intact. Private reads continue using exact linked account IDs.
- Repeat saves do not duplicate requests, and a rejected request is not recreated
  by saving again. Staff decisions are repeat-safe. Stale requests cannot be approved;
  other pending claims for a newly linked Stay expire.

## Migration note

Migration 0078 adds `resident_account_links`, foreign keys, a queue index and a
unique Stay/account pair. No contact backfill, historical linking, identity merge,
financial migration, or production deployment is performed. Apply the normal
additive migration before running this API version against an existing database.
