# ADR 0006: Shared identity and client capability parity

- **Status:** Accepted
- **Date:** 2026-10-07
- **Decision owner:** User (Phase 1 continuation prompt)

## Context

The initial plan split customer/resident workflows onto mobile and management onto
web. The approved continuation requires future business-function parity for Customer,
Resident, Owner, Manager and Admin on both clients. Phase 1 creates foundations only.

## Decision

Both clients use the same NestJS API, identity, database, contracts, session policies
and domain authorization. An identity can hold simultaneous capabilities. UI modes
such as Explore, Resident, Manage and Admin only organize navigation; they never grant
backend permission. Web uses protected cookies and CSRF; mobile uses SecureStore.
No duplicated platform-specific backend or exclusive global user role is introduced.

## Consequences

The initial app-distribution diagram remains planning history. Each client shell must
support all future capability groups while only implementing Phase 1 authentication
and shell screens now. Existing branch, resource and sensitive-access permissions
remain unchanged. CHG-005 records the client-distribution update. No data migration
is required; persisted grants already support a shared identity.
