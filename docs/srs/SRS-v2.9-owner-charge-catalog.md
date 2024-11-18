# SRS v2.9 supplement: approved Owner-controlled charge catalogue

Implements the already approved configurable Phase3 framework (CHG-009/010),
FIN-004/RENT-003/AUD-004/ACC-004 and ADR0044. Only an owning Owner creates or archives
an approved custom-charge catalogue entry. An active branch Manager may read it
only with explicit finance_view; no Manager grant permits changing the catalogue.
Live authority is rechecked during idempotency replay, including child scope.

Unit prices are positive safe integer paisa at the transport boundary and bigint
in storage. Entries are immutable; new pricing requires a new record/code and an
explicit agreement amendment. Archiving retains history and stops new custom
postings under the existing active-catalogue guard. Previously posted financial
records and immutable agreements are never rewritten. Catalogue configuration alone
does not post a charge, approve a payment, fabricate Paid or move hostel funds.

## Migration note

Reuse the existing resident_charge_catalog table, unique branch/code identity,
foreign keys and existing immutable/retention/charge-source guards. No physical
migration, automatic grants, price backfill, agreement rewrite or public disclosure
is introduced. Add only private branch-scoped configuration APIs/contracts after
verification. Actual implementation and acceptance remain in STATUS.md.
