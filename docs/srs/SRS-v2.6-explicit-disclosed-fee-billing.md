# SRS v2.6 supplement: explicit disclosed-fee billing

Derived implementation detail of the user-approved Phase3 configurable billing
framework (CHG-009). Refs RENT-003/004, FIN-001/004, ACC-004, AUD-004. Original
booking-disclosed rates, Owner-only policy writes and retained agreements remain
authoritative. Implementation/real acceptance are reported separately in STATUS.md.

## Explicit Owner choices

Billing policies may include feeBilling. It supplies an explicit nonnegative
oneTimeDueOffsetDays measured from the agreed Stay start date. A monthly subpolicy,
when selected, supplies its own calendar-month or anniversary-month anchor/due
rule and full-period, calendar-day/rounding or manual-partial proration. Fee timing
is not inferred from a weekly, fixed-period or term rent cycle.

For a requested fee, the exact category/cadence must occur in the immutable
agreement's original disclosure. One-time fees retain the disclosed amount and
occur once per Stay; subsequent corrections are explicit adjustments. Monthly
fees retain their disclosed monthly base amount and apply only the explicitly
snapshotted monthly fee policy. A selected manual partial amount remains unresolved
until authorized input supplies it, including explicit zero. Zero is no charge,
never an invented payment or Paid state. A shared aggregate fixed-first rent
amount is not silently applied to every fee.

Missing required fee policy is unconfigured: admission/posting must obtain an
explicit version, not skip a mandatory fee or guess a due date/amount. Owner
settings supersession does not silently change a resident agreement. These rules
add no free-form fee category, Customer pricing authority or Manager policy-write
permission; existing controlled categories/catalogs and scoped grants still apply.

## Migration note

feeBilling is an optional nested property of the versioned policy JSON. Existing
policy/agreement rows remain valid and unchanged. Only explicitly appended Owner
policy versions and applicable explicit agreement changes supply new fee terms;
no rate, due-date, identity or financial-history backfill is performed. No physical
schema or migration-journal change is needed for this JSON contract extension.
Generated OpenAPI/SDK types must be refreshed normally. Fee calculation is not a
completed charge scheduler, admission, payment, ledger posting or receipt flow.
