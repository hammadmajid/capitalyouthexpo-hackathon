# ADR 0094: Keep bed security with dated bed pricing

- Status: Accepted
- Date: 2026-11-21
- Decision owner: User Add Bed correction

## Decision

Extend append-only bed_prices with a nullable security override. Resolve the last
explicit effective override, then effective legacy type security. This permits
old rent-only versions to retain their security and explicit zero to stay zero.
Reuse scoped pricing grants, audit and idempotency. Admission confirms its own
snapshot; preset changes never alter existing obligations or paid balances.

## Consequences

Add Bed shows monthly rent and security together. Public quotes/options and
filters resolve the selected bed's amount. Native new admission defaults follow
that bed; historical agreement capture stays explicit. See CHG-058/SRS v2.39
for migration and financial invariants.
