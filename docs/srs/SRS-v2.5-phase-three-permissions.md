# SRS v2.5 supplement: Phase 3 delegated branch operations

Implementation of the Phase 3 Owner-controlled Manager access explicitly approved
by the master prompt (CHG-009). Refs SEC-001/003, MGR-004, STAY/RES, RENT/PAY/OUT,
ACC-001..006. This records authorization changes before route activation; no final
acceptance is claimed.

## Explicit grants

Reuse the existing exactly branch-scoped Manager permission model. Add stay_manage,
rent_manage, payment_record, finance_view and checkout_manage. Existing grants keep
their meanings and no existing Manager receives a new permission automatically.
Only the owning Owner may grant/revoke them under current live actor/scope rules.
Delegated Manager financial write operations also require finance_view. Manual financial terms require
both stay and rent authority. Checkout authority alone does not permit a fund move.

Financial-policy/catalog configuration and Q14 payment reversal remain Owner-only.
Owner-initiated termination and private booking-document restrictions are preserved.
No Resident login role, cross-branch override, automatic identity merge or arbitrary
financial default is introduced. Further command-specific checks remain mandatory.
Private staff Stay collections/details require stay_manage, including read access;
booking_manage and finance_view alone do not grant this operational directory.
Customers read only explicitly user-linked own stays. Operational DTOs exclude
CNIC/private documents and finance data; finance resources need separate checks.

## Migration note

Expand the existing text permission check with an additive generated migration.
Do not insert/backfill new grants. Keep historical rows/audit and API paths; the
historical inventory-permissions path remains the one canonical grant resource.
Contract/OpenAPI limits follow the bounded controlled permission set. UI shows new
grants unchecked for existing Managers; dormant permissions confer no access until
an implemented operation explicitly checks them. Source/CI acceptance is pending.
