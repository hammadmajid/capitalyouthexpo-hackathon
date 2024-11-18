# ADR 0053: Share financial settings form conversion between clients

- **Status:** Accepted implementation design; verification pending
- **Date:** 2026-10-20
- **References:** RENT-003, FIN-004, SEC-003, CHG-009/011/014, ADR0049

## Context

Web billing-policy controls already map explicit human form choices to the strict
shared policy contract. Native parity must preserve the same blank initial state,
exact integer-paisa conversion and independent monthly-fee timing. Maintaining
another financial form converter in mobile would allow clients to diverge.

## Decision

Extract the existing pure draft, selected-field descriptors and strict input
conversion into the shared API-client package, alongside its existing form input
adapters. Both applications consume that model through public package exports.
Preserve the original conversion regression cases; add descriptor and exact money
boundary cases in the producer package. Retain consumer regression cases.

This model formats settings and validates explicit input. Backend authorization,
policy version persistence, financial calculation, agreement snapshots, posting
and auditing retain their existing authoritative implementations. No new prices,
financial defaults, fee cadence, permissions or automatic posting are introduced.
No database migration or SRS behavior revision is needed for this extraction.

Native controls use actor/branch/type-scoped lazy reads, Owner-only editing based
on validated server capability, opaque error display, retained failed drafts and
same-intent command keys. A changed effective version requires explicit reload.
Open room-type panels acquire an inventory navigation lock, with close available
during read errors; that lock must not invalidate the panel's own authorization.
Account or target changes remount closed without restoring private old results.

## Consequences and acceptance

Client components retain platform-specific rendering and query lifecycle code;
financial settings conversion and descriptors have one shared source. Unsupported
or incomplete selected settings fail the existing strict contract. Existing
agreements are never repriced by saving configuration.

Normal dependency-aware lint/typecheck/build, complete SDK tests, native policy
and actual inventory wiring tests, complete native regression and complete Web
regression are required. The prior native catalogue247/44 and static40/40 do not
verify this extension. Current Web full retry failed10/763 in original public
inventory fixtures; its correction and full retry remain required. Real container,
device and exact-source CI acceptance are separate and not claimed here.

2026-10-20 static checkpoint LOCAL PASS40/40,30 cached,19m20s, including strict source/test types, normal OpenAPI/SDK generation, Next production build and Android Hermes8.6MB. Complete SDK tests are running; behavioral, real container/device and exact-source CI acceptance remain pending. A later Web fixture-only readiness refinement is outside this static checkpoint.

Complete shared SDK LOCAL PASS504 tests/35 suites,2m11s, L/S99.96%,F100%,B97.5%; all configured gates pass. Includes98 form/field/money cases and every406 earlier SDK case. Mobile and Web behavioral acceptance remains pending.

Current complete mobile units LOCAL PASS248/21, L/S/F100%,B99.64%,1m27s. Focused native LOCAL PASS51/6, including14 policy cases and1 real inventory component wiring/lock case, configured L/S/B100%,F84.61%,2m28s. All earlier native cases remain; prior unfiltered catalogue247/44 is a separate checkpoint. Full current Native/Web and actual container/device/CI acceptance remain required. Web fixture lint/typecheck plus112 focused assertions are running serially.

2026-10-20 native policy complete regression: LOCAL PASS262 tests/45 suites,
all suites unfiltered and serial,11m57s. Retains prior247 cases plus14 policy
cases and1 actual inventory wiring/lock case. Configured coverage L/S/B100%,
F84.61% (existing failure-boundary/observability collection); no claim of whole-UI
coverage. React act warnings remain visible. Source evidence:
.tools/phase3-native-policy-complete-20261020.log. This closes the native component
regression for this slice; the preceding full Web failure remains open, and no
APK/device, real infrastructure or exact-source CI PASS is claimed.
