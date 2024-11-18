# SRS v2.25 — Manager runs the whole branch

MGR / AUTH-M-003 / ACC-002. Product decision (2026-11-14): a Manager is appointed to
run a branch, so the Owner no longer picks individual permissions.

- When a Manager activates (temporary password) or accepts an invitation, the
  assignment receives every branch operation permission (`listing_edit`,
  `inventory_edit`, `pricing_edit`, `policy_edit`, `media_publish`, `block_manage`,
  `booking_manage`, `document_review`, `stay_manage`, `rent_manage`, `payment_record`,
  `finance_view`, `checkout_manage`) in the activation transaction, audited as
  `manager.inventory_permissions.granted` (ACC-006).
- The mobile Owner team list has no permission picker.
- Unchanged: branch isolation (a Manager reaches only their assigned branch), Owner-only
  actions checked by role (appointing/cancelling Managers, payment reversal, billing
  policy and charge catalogue saves, Owner-initiated termination), and every command's
  live server checks.
- The Owner temporary password is typed by the Owner; the app never generates one.

## Migration note

No schema migration. Managers activated before this change keep their saved grants; an
Owner can cancel and re-invite to apply full access. The grants API remains available.
