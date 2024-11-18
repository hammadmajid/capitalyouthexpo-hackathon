# ADR 0031: Combined Phase 2 server business coverage

- Status: Accepted; implementation verification pending
- Date: 2026-10-16
- Refs: SEC-001, ACC-001, ACC-004, BKG-001..009, NTF-002, P2-I/J

## Context

The existing exact-revision combined coverage job requires every runtime source
and at least 80% whole-application line coverage. Existing package gates enforce
90% in Phase 1 business scopes. Revised Phase 2 adds server booking, inventory,
discovery, inbox, reservation locking/expiry and notification logic that must
also meet the required 90% business-logic floor. Unit-only coverage cannot prove
real database paths; real-infrastructure evidence remains mandatory.

## Decision

After verifying both producer manifests and the existing whole-application gate,
require at least 90% combined unique-line coverage separately for API booking,
inventory, marketplace and inbox directories, notification package runtime source,
and the DB inventory-expiry, inventory-lock and booking-lifecycle modules together.
Every domain must exist; all three named reservation modules must be present.
Missing executable records, unknown paths and invalid line bounds still fail the
unchanged whole-application gate. Duplicate suite hits do not inflate totals.

Publish each domain's file/line/hit totals and percentage in the existing exact-
revision aggregate artifact. No new runtime exclusions, local container claims,
unit threshold changes or replacement of real integration evidence are allowed.
Frontend/client runtime stays in the whole-application denominator and its
existing package/component/security gates remain blocking.

## Consequences

A high application average cannot hide under-covered Phase 2 server domains.
Actual compliance is pending the matching quality and real-infrastructure CI
producers. Unit policy fixtures verify the gate itself, not product coverage or
successful database execution. This ADR does not certify Phase 2 completion.
