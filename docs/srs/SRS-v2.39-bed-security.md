# SRS v2.39: Per-bed security preset

User correction on 2026-11-21. CHG-058 / BED-001 / BKG-003..005 / RES-001.
Supersedes only CHG-057's admission-only security preset decision. Rooms still
derive size from physical beds; Add Room has no rent, security or bed-count field.

Add Bed sets its own monthly rent and security deposit together. Zero security
is an explicit supported amount. Security is a refundable-deposit requirement,
never monthly income or an already-paid balance. Store all money as integer
paisa. Publishing either preset requires existing scoped inventory/pricing grants
and audit, with the same idempotency and immutable price-history protections.

Future bed quotes use the effective bed security preset. Public bed options show
that amount, and deposit filters match the selected bed's security. Per-bed type
summaries show security from the least expensive selectable bed security; legacy
whole-room terms remain their own. Native new admission starts with the selected
bed's rent/security, and staff confirm the final agreed terms. Explicit historical
agreement capture on web continues to require staff-entered original amounts.

Preset changes never rewrite existing held/booked quotes, admission agreements,
invoices, security balances or receipts. Existing payment allocation, overpayment
blocking and approved-record-plus-receipt requirements remain authoritative. No
platform custody, inferred payment or automatic resident debt is introduced.

Migration note: 0086 adds nullable deposit_paisa to append-only bed_prices plus a
safe-integer/nonnegative check. No backfill changes old amounts. Resolve the last
explicit effective bed security; a later rent-only version inherits it. Without
an explicit bed preset, retain effective legacy type security (zero for a new
empty setup container). Future presets stay inactive until their effective date.
Existing zero remains zero; null means inheritance, never a write-off. API fields
are additive; old rent-only request bodies remain accepted. Updated strict clients
consume the new response fields.

Focused database/API/native checks precede local migration. Final coordinated
acceptance and production deployment remain separate.
