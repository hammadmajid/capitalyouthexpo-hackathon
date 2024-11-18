# SRS v2.8 supplement: original agreed grace governs overdue classification

Corrects the implementation to the existing SRS v2.0 RB-002/FIN-002 rule (p.29/30)
and the approved configurable Phase3 framework, CHG-009. This records the rent-state
correction before activation; implementation/real acceptance remain in STATUS.md.

An unpaid invoice stays neutral/issued, or partially paid when applicable, through
its original due date plus configured grace days. Overdue begins on the following
calendar date while money remains outstanding. Preserve the actual due date and
all amounts; grace does not forgive debt, invent payment or change Paid/no_charge/
voided provenance. Date interpretation uses the server's Karachi calendar date.

Grace must come from the immutable agreement referenced by the invoice's charge
links. Later current-policy changes never rewrite that historical timing. Multiple
linked agreements must agree on grace for this shared invoice projection; missing,
invalid or conflicting values fail closed instead of choosing zero or a current
setting. Existing writers issue per agreed source; a future mixed-policy batching
workflow must explicitly preserve valid agreed timing rather than guess it.

## Migration note

No physical schema/history rewrite or grace backfill is needed: existing agreement
snapshots already require policy.graceDays. Resolve that value through the existing
invoice-charge-agreement lineage. The internal invoiceBalance calculator now
requires explicit graceDays; legacy zero-grace test fixtures state zero explicitly.
No universal default, rate, identity, staff permission or payment rule is changed.
Use exact elapsed calendar days, avoiding overflow for very large configured grace.
