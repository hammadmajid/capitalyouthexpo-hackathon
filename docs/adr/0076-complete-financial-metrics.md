# ADR 0076: Complete financial metrics through bounded canonical batches

- **Status:** Accepted implementation correction; local regression passed
- **Date:** 2026-10-28
- **Requirements:** FIN-001/002, PAY-008, OWN-003, RPT-001, AUD-005/012 remediation

## Context

Monthly metrics sample 2000 invoices; overdue counts sample 500 and exclude debt
older than 400 days. Disposable PostgreSQL returned 500 instead of 2001 and zero
for the same old unpaid debt. The 2000-candidate monthly calculation exceeded its
existing 30-second test limit before reaching its assertion. Simply removing
limits would expand the invoice-by-invoice query cost. Rent history also silently
clips accepted requests at 24 months.

## Decision

Traverse invoice candidates by due date and ID in pages of 100. The database batch
reader locks referenced Stays and executes the same adjustment, receipt-backed
allocation and original-agreement grace queries with grouped results. Both reader
paths reuse one balance projection; batch scope checks reject missing/mismatched
resources and ambiguous grace facts. The existing single-invoice contract remains.
Accumulate money as bigint and convert exactly at the JSON boundary, rejecting
unsafe totals. Remove candidate/debt-age sampling. Preserve the 24-month rent
processing bound with explicit validation failure for larger requests.

## Consequences

No migration, financial policy, grant expansion, historical rewrite or second
accounting engine. Locks still stabilize financial reads against writers. Test
canonical parity, scope failure, invalid aggregates and complete PostgreSQL totals;
measure actual processing time without increasing test or proxy timeouts.
This targeted performance dependency does not close all AUD-012 report risks.
Rollback is a normal revert of the isolated correction.
