# HSM Admin UX consolidation — 2026-10-31

## Implemented

- Removed the separate Needs Attention section. Its verification, support and
  moderation counts/actions now appear in Popular Snapshots; verification is first.
- Removed Approved Branches as a competing entry. Hostel Branches is the canonical
  Root directory with all/pending/individual approval states, server search/sort,
  calendar statistics, pagination, profiles and existing verification decisions.
  Root's older verification-list route forwards to this directory. Normal Admin
  retains the existing module-scoped queue; no permission expansion.
- Pending means submitted, under_review and changes_requested, matching overview
  counts. Backend filtering precedes counts/statistics/pagination; no page-only totals.
- Restyled the shared Admin page/card/input shell used by connected directories,
  details and forms. Frosted surfaces, emerald controls and readable typography reuse
  existing tokens; no raster mockup, new dependency or fake financial selector.
- Directories have compact filter panels, visible status context, four cohort tiles
  and linked records. Details use status badges and grouped facts/actions.
- Verification separates Review / Evidence / Pricing; support separates Actions /
  Conversation; moderation separates Decision / History. Commands remain mounted
  across tab switches, preserving recovery/confirmation state. Purpose-bound evidence
  remains explicit, audited and never automatically fetched.
- Shared filter chips expose selected/disabled accessibility states. Specialized
  support/verification queues use grouped filters/status indicators. Existing nested
  evidence, photos, pricing, history, enforcement and profile-review forms reuse the
  same shell and guarded services. No action capability is invented for metadata.

## Consolidation and preservation

Reused organization/brand/multiple-branch relationships. Root branch discovery is
consolidated; specialized dossier/decision pages remain necessary parts of the same
flow. Removed the unreferenced QueueRow implementation after checking references.
Legacy routes remain compatible; no backend endpoint or role-specific queue removed.
Authentication, RBAC, branch isolation, private evidence, version/reason/confirmation,
idempotent recovery, immutable history and payment/receipt rules remain authoritative.

## Verification

API and Mobile typechecks pass. API compilation and disposable explorer integration
pass (5 cases, including pending filter and Root role matrix). Focused Native suites
pass across final reruns: workspace18, explorer3, operational10, profile-review7.
Evidence: admin-consolidation-types.log, admin-consolidation-api-build.log,
admin-consolidation-db.log, admin-consolidation-dashboard-final.log,
admin-consolidation-native-final.log (operational suite), admin-consolidation-native.log
(explorer/profile suites). Earlier failing test fixtures/rendering were corrected;
these files preserve the progression rather than claiming every historical run passed.

## Dependencies and acceptance limits

Physical nonempty branch decisions and every nested form cannot be certified from
an empty development catalogue; disposable tests cover guarded actions. Existing
support/moderation APIs do not supply arbitrary full-text sorting/cohort analytics
for every workflow; existing supported filters/order/pagination remain functional.
No invented statistics or filtering over a capped preview. Booking/resident complaint
mutations remain branch-staff functions; Root sees authorized metadata. Platform
income tracking is deferred, expenses excluded; worker remains off. No migrations,
APK rebuild, deployment, credential changes or Git writes.

Standard Admin headers implemented: reusable back arrow with history/deep-link
fallback, command-disabled navigation and contextual expandable search for existing
Explorer/support/institution APIs. Removed bulky back controls and duplicate HSM
headers on secondary pages; primary dashboards retain their navigation. Search
drafts/filters persist when collapsed. Four connected Native suites36 plus header
controls3 pass; final Mobile typecheck passes. Evidence: admin-header-native.log,
admin-header-controls-final.log, admin-header-types-final.log. Latest app-wide
skeleton request now extends current work; no earlier implementation discarded.
