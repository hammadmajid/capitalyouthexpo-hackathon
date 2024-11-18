# ADR 0020: Revised Phase 1 identity and onboarding acceptance

- **Status:** Accepted
- **Date:** 2026-10-10
- **Requirements:** AUTH-C, AUTH-M, OWN-001, MGR-004, SEC-001, SEC-003, ACC-002

## Context

The user explicitly approved a revised Phase 1 product flow. Existing registration
collects password, birth date and CNIC before email verification; web redirects
guests to login and mobile has a welcome screen. Owner creation and invitations
were previously outside Phase 1. Verified secure foundations must be preserved.

## Decision

Adopt the [SRS v2.1 supplement](../srs/SRS-v2.1-phase-one-supplement.md), CHG-006.
Use email-first verification and purpose-separated, single-use setup authorization
before password/session issuance. Preserve one identity and additive capabilities.
Move customer CNIC to later booking KYC; use editable adult age, not inferred DOB.
Add owner profile and minimum hostel/main-branch/invitation foundations through
existing models and additive migrations. Keep approval separate from submission.

Web becomes guest-first with validated return paths. Mobile routes restored
sessions directly to a valid experience or login. Promotional splash/onboarding
is deferred. Backend capabilities remain authoritative for every experience.

## Consequences

Tasks 7, 11 and 12 product acceptance reopen; old passing tests remain evidence for
their original scope, not revised acceptance. Existing authentication, scope,
revocation, audit, files and notification primitives stay intact. Schema and
contract revisions must preserve historical migrations and document compatibility.
All native, container, privacy, security and coverage gates remain blocking.
