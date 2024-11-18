# ADR 0075: Retain unresolved service and lifecycle commands

- **Status:** Runtime correction locally verified; full process restart recovery remains open by user decision
- **Date:** 2026-10-27
- **Requirements:** PAY-008, OUT-004/005, CMP-001, ADM-010, SEC-001/003, AUD-003

## Context

Web/native service hooks and lifecycle forms cleared keys on every settled request,
including lost responses. A retry could repeat a committed refund with a new key.
Three Web RED regressions reproduced key loss, altered-payload acceptance and remount
loss. Two backend RED cases reproduced cached lifecycle responses being authorized
with fewer grants than the original money-changing command.

## Decision

Reuse the existing SDK retained-command pattern. A small application-memory registry
namespaces each intent by operation and actor/resource query scope. Copy and freeze
the JSON request before dispatch, retain its original key on uncertainty, and reject
different input until resolution. Initial definitive HTTP rejection or SDK request
validation failure permits correction; a rejection after uncertainty does not erase
the original intent. SDK response validation remains an uncertain client failure.

Success clears the intent. Concurrent submission is refused. At 24 hours from first
submission, refuse replay and require authoritative reconciliation rather than rotate
the key: the server's existing replay record may have expired. Explicit retry controls
use the original payload even after remount or refreshed Stay versions. Keep refund
recovery visible when the server refresh has already consumed its funding source.

Replay must prove the same existing grants as fresh execution, including rent/finance
grants for repricing and payment-record authority for deposit-applying checkout.
No new grant or authorization policy is introduced.

## Durability assessment and limits

The registry survives component remounts, actor switches and ordinary backgrounding
while the JavaScript process lives. It does not survive a full page reload, application
process death or browser restart. No private request text or credentials are persisted
to device storage by this correction. This is an explicit remaining AUD-003 recovery
gap; do not label the complete finding resolved on the basis of in-memory tests.
Durable recovery must preserve identity without silently persisting complaint/support
text or allowing expired commands to execute again. Evaluate a minimal metadata-only
recovery record separately and document its retention/migration implications before
implementation. Physical Android process/background behavior still requires Phase 11.

The user explicitly chose “Keep restart recovery as an explicit open gap” during
this remediation. Accordingly, device draft persistence is excluded from this
correction, and the full-restart limitation must remain visible in acceptance and
Phase 11 reporting. This decision does not certify restart recovery or permit a
claim that an unresolved command survives process death.

## Verification

Focused SDK, Web/native hooks, recovery controls, real PostgreSQL partial-refund
replay and live permission revocation must pass. Preserve privacy/coverage gates and
record failed attempts as well as corrected results in the remediation checklist.
No schema migration, financial-history rewrite or automatic network retry is added.
