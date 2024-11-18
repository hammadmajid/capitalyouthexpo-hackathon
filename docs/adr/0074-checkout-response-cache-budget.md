# ADR 0074: Bounded checkout response cache budget

- **Status:** Accepted implementation correction; focused HTTP verification passed
- **Date:** 2026-10-27
- **Requirements:** OUT-005, PAY-008, ACC-004, SEC-003, AUD-001 remediation directive

## Context

Complete settlement still has bounded detail (200 invoices, 100 fund sources), and
checkout may report up to 400 deposit applications. The resulting valid DTO can
exceed the generic 64 KiB replay-response budget. The new real PostgreSQL HTTP
regression returned 500 for 201 applications, rolling back an otherwise correct
checkout. Domain-only tests cannot detect this response persistence boundary.

## Decision

Keep the default 64 KiB budget. The server's checkout command alone opts into a
finite 256 KiB budget for its bounded result; this is internal configuration, not
an HTTP parameter. Both initial persistence and replay apply the same limit and
the same DTO validation, credential/private-field/signed-URL rejection and live
authorization. Oversized or unsafe results still roll back with the transaction.

## Consequences

No schema migration, historical rewrite, retention-period change or financial
policy change. The replay lifetime remains 24 hours. Add size/privacy/revocation
unit tests and a real HTTP persisted-statement/replay test. Other commands keep
their existing budget. Final whole-API coverage and combined acceptance remain
mandatory; selected unit assertions alone do not satisfy global coverage floors.
