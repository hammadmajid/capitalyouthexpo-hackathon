# ADR 0024: Aggregate coverage requires complete, revision-bound evidence

- **Status:** Accepted; implementation complete, verification in progress
- **Date:** 2026-10-12
- **Requirements:** CHG-006, SEC-001; revised Phase 1 coverage acceptance

## Context

Existing business/package coverage gates protect their configured scopes. Their
high percentages do not demonstrate whole-application coverage. Phase 1 also
requires an overall minimum of 80% and real infrastructure tests, while local
Windows development must remain useful without a container runtime.

## Decision

Preserve all existing tests, inclusion settings and stricter package thresholds.
Collect additional coverage for executable JavaScript/TypeScript product source
under every application/package `src` directory. Include entrypoints, adapters,
barrels and generated runtime code. Record explicit exclusions for test source,
test infrastructure, declarations, non-JavaScript assets and source whose
TypeScript emission contains no executable JavaScript. Do not use filename-based
business-module selection as the whole-application denominator.

Require both successful unit and real infrastructure producers. Bind their reports
to the exact revision, a deterministic source fingerprint and the report bytes.
Compare source/revision snapshots before and after producer execution. Require
every tracked file, including root workspace and CI configuration, to match HEAD. Reject
malformed reports, invalid paths, duplicate producers, stale/tampered evidence,
missing runtime-source records and line references outside the actual source.
Merge line hits by maximum per canonical source line, never by concatenating suite
totals. Enforce at least 80% overall line coverage without rounding a lower value
upward. An empty denominator cannot pass. Keep business line/branch gates separate
and blocking at their existing stricter thresholds.

## Consequences

Parser, inventory, aggregate-floor and provenance helpers can be tested locally.
Source discovery, supplemental whole-source Vitest/Jest producers and CI artifact/job
wiring are now implemented. The quality producer passed at
a2bf89709a9b69d340c11a170806c57190dbf3ef with fresh unit/component evidence. Real
infrastructure producer and final-revision CI verification remain pending.
The quality producer collects all unit/component source. The infrastructure producer
runs the unchanged original Testcontainers command before supplemental infrastructure
coverage. Separate spawned production processes are conservatively uncredited unless
measured by the reports; their entrypoints remain in the required denominator. These helpers alone cannot produce a
whole-application PASS or replace real Testcontainers acceptance. CI must run the
real infrastructure producer and all existing required jobs successfully on the
final exact commit before Phase 1 completion is reported. External account billing
availability remains a prerequisite outside product implementation.
