# ADR 0050: Own-Stay reads follow the explicit account relationship

- Status: scoped controller fix applied; focused assertions pass, full API/real acceptance pending
- Date: 2026-10-19
- Refs: CHG-009/012, SRS v2.7, master prompt§47, RES-001/003, SEC-003, ACC-004

## Context

The own-Stay repository already locks the live actor and scopes every query to
stays.userId. The prototype controller additionally checks Customer-profile
existence, preventing an otherwise valid Owner/Manager resident relationship from
being read through the own-Stay experience. Customer booking eligibility and
resident self-read ownership are different checks.

## Decision

Reuse the existing authenticated Self metadata for only the two own-Stay reads.
Keep exact actor-bound collection/detail queries and opaque foreign/unlinked404,
live account/session validation, strict input/response contracts and no-store data.
Retain branch stay_manage checks for staff reads and all existing Customer booking
eligibility. No immutable Resident role, contact matching, new staff capability,
private booking-document access or mutation permission is introduced.

Do not activate the generic StayGuard stub: future commands still need their own
lifecycle/authorization checks. Preserve route paths and legacy Customer-named
operation IDs/types for compatibility. UI access for all linked identities remains
separate required Phase3 work; metadata alone does not complete My Stay.

## Migration and verification

SRS v2.7/CHG-012 records the authorization clarification before code activation.
No schema/data migration or profile creation/backfill occurs. Two HTTP regressions
and an actual PostgreSQL/Redis Owner-without-Customer-profile case are authored.
The pre-fix HTTP run reproduced2 failures/20 passes out of22. After the Self-only
controller fix,22 HTTP and17 repository assertions pass. The focused command still
fails unchanged whole-package coverage (27.5% lines) with other producers excluded;
this is not a full gate pass. Retain all anonymous, foreign/unlinked and branch
denial assertions; the former Customer-profile prerequisite characterization is
superseded only for these own reads by CHG-012. Full current API/real acceptance
and independent UI availability remain pending.

Navigation implementation follow-on: the authenticated Web account area and native Account now compose the existing actor-bound lazy My stays reader outside Customer-only navigation. Web RED reproduced three failures/four controls; native RED four failures/one absent-session control. No new role, capability guess or data query is introduced at mount; the existing reader fetches only when opened. Focused retries, complete client gates and real acceptance remain pending in STATUS.md.

2026-10-20 native verification: the complete unfiltered Jest suite passes236 tests/43 suites, configured gates (L/S/B100%, F84.61%),15m53s; phase3-own-stay-native-complete-20261020.log. Reconstructed real Account own-Stay cases are included. React act warnings remain in the log; no suppression was applied. This is component acceptance, not an APK/device, real database or CI result. New independent billing-policy Web/API changes have separate verification in STATUS.md.
