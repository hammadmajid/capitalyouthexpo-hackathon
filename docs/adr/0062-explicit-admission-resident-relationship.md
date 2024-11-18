# 0062: Explicit resident relationship at admission

- Status: Source implementation; verification pending
- Date: 2026-10-20
- Requirements: RES-001/003, STAY-001, SEC-003, AUD-004, ACC-004

## Context

Manual admission must support residents without login accounts and must not infer identity from matching email or phone details. Account participants must be known before acquiring ordered identity locks.

## Decision

An internal transaction component creates a branch-local offline resident plus mandatory human audit, or locks and reuses an explicitly selected unarchived branch resident. Existing account linkage must exactly match the server preflight binding; a concurrent link change requires a fresh admission attempt. Manual contact details never create or merge User accounts.

The caller remains responsible for live admission authority, active hierarchy, sorted participant identity locks, authorized idempotency and the complete admission transaction. The component is not exported or registered as an HTTP route. No Stay, occupancy claim, agreement or financial posting is created by this component alone.

## Verification

Unit regressions and eight real PostgreSQL cases are authored. Normal static LOCAL PASS8/8 and complete DB LOCAL PASS588/24, all configured coverage100%, include all22 new relationship cases. Real infrastructure cases are NOT RUN LOCALLY; exact-source CI is NOT VERIFIED. Existing Testcontainers suites and coverage thresholds remain unchanged.
