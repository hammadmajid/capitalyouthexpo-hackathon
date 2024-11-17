# AGENTS.md: Start Here

This file is the entry point for **every developer and AI agent** working on this repo. Read it fully before doing anything.

## What this project is

**Twin Cities Hostel Marketplace & Management System**, for Islamabad and Rawalpindi, Pakistan.

- **Customer mobile app** (Expo React Native; Android first, iOS later): find verified hostels, see real seat availability, book, then live in the hostel as a resident (pay rent, raise complaints, check out).
- **Management web app** (Next.js): Owners, Branch Managers and Platform Admins run branches, beds, bookings, residents, rent and verification.
- **Backend** (NestJS + PostgreSQL/PostGIS): one API for both apps.

## Current phase

**Current scope: AUD-001–015 remediation and Phase 11 acceptance preparation. User-directed 2026-10-27/28.** Phases 9 (resident services and financial/lifecycle corrections) and 10 (administration/reporting) have historical local implementation checkpoints; these do not certify the final source. See `docs/STATUS.md`, `docs/audit-remediation-20261027.md` and `docs/audit-remaining-work-20261028.md`. Finish remaining implementations with focused checks, then freeze the source for one coordinated final acceptance campaign. Phase 12 and production deployment are not authorized.

The 2026-10-24 Phase 3 directive in `docs/phase3-marketplace-execution.md` and the earlier phase numbering are preserved historical scope, superseded as the current execution instruction. Original admission/finance requirements remain authoritative; later implemented source must not be removed because of old phase labels. CHG-015/016 record approved later corrections/services. Hosted CI remains externally blocked pending valid evidence; physical Android/operations acceptance must be verified or explicitly pending. AUD-003 full-process restart persistence remains an accepted open exception.

- Work **only** within the approved remediation and acceptance scope in `docs/05-roadmap.md` and the live audit checklist. Use focused tests during implementation and one final coordinated campaign; do not start later product phases.
- The schema (`06`), API contract (`07` + `api/`), screens (`08`) and design system (`09`) are the **v1 baseline**. Change them through a PR that updates the doc in the same change.
- Work on feature branches + PRs into `main` (see `docs/development-rules.md` §2).
- Check `docs/STATUS.md` for the live state, what is done and what comes next.

## Read order

1. `docs/STATUS.md`: current phase, done / in progress / next, decision log
2. `docs/00-project-overview.md`: product summary of the SRS
3. `docs/01-roles-and-permissions.md`: who can do what (security-critical)
4. `docs/02-architecture.md`: tech stack, repo layout, deployment, engineering rules
5. `docs/03-domain-model.md`: entities, state machines, business rules
6. `docs/04-open-questions.md`: unresolved product decisions (do not guess these)
7. `docs/05-roadmap.md`: phases and milestones
   7b. `docs/06-database-schema.md`: database design (draft v1); read before touching data or APIs
   7c. `docs/07-api-contract.md` + `docs/api/`: API conventions and endpoints per module (draft v1)
   7d. `docs/08-screens.md` + `docs/screens/`: every screen with ID, APIs and SRS refs (draft v1)
   7e. `docs/09-design-system.md`: colours, type, components; UI code uses tokens only (draft v1)
8. `docs/adr/`: architecture decision records
9. `docs/srs/CHANGES.md`: approved deviations from the SRS (**read before the SRS**)
10. `docs/srs/SRS-v2.0-text.txt`: full SRS text (the PDF is in the repo root)

## Source-of-truth rules

- **SRS v2.0 + `docs/srs/CHANGES.md` are authoritative.** CHANGES.md records approved deviations (e.g. subscriptions deferred, email-only OTP) and overrides the SRS where they conflict. If any other doc conflicts with these, fix that doc.
