# ADR 0085: Native Admin identity shell and shared Root management

- Status: Implemented; focused checks pass with explicit container/Owner-fixture limitations; no device acceptance
- Date: 2026-10-29
- Requirements: ADM-001..004, AUTH-C, SEC-001/003, CHG-005; HMA-001..005/013

## Context

The capability selector rendered only an Admin label. Root actions already existed behind shared
transactional authorization, while Admin list100 lacked continuation. Owner/Login work is concurrent.

## Decision

Add native Admin routes with fresh live capability checks and inner Root guards, actor/permission-bound
staff cache keys, cancellation/removal on exit or grant change, own invitation acceptance/profile and
a real management dashboard. Preserve one identity and existing SecureStore sessions; remember only
a per-user mode. Reuse original Admin mutation and lock/audit/idempotency services.

Use bounded UUID keyset Admin pages (default50/max100) and a Root-only minimal detail read.
Return full Admin-set membership summaries, not invented platform metrics; Web follows continuation.
No migrations. Root1..3 trigger and original mutation lock order remain unchanged.

## Consequences

Email-based invitation remains backward compatible. Strict older clients must update additive response
parsers with the API. Phone-contact entry remains unverified under CHG-006; live privileged phone
assignment requires external ownership/identity approval. No new phone verification/backdoor API,
SMS provider or phone-only recovery. See ../admin-phase12-identity-readiness.md.

Operational Admin workspaces and platform aggregates remain future phases. Focused tests do not
certify Android runtime. No source commit/push or native build is performed by this task.
