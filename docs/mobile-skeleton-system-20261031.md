# Shared mobile skeleton system — 2026-10-31

## Implementation

Central native skeletons cover list, hostel listing, details, form, statistics,
dashboard, inventory/table, chat and inline regions. Pulse and content entry use
native-driver opacity, not layout animation or a JS animation per bone. Reduced
motion is respected and timers/listeners/animations are cleaned up on unmount.
Placeholders are accessible busy regions; decorative bones are hidden from readers.
Long-running loads show connection guidance; error/empty/retry ownership remains
with existing queries. No new fetch, polling, fabricated records or API behavior.

The audit replaced69 literal initial data-loading placeholders in62 components,
plus session restoration, guest/customer discovery, Owner profile and shared Admin
readers. Role coverage includes Customer bookings/hostels/profile/chat; Owner and
Manager branches/inventory/billing; Resident stays/invoices/services/complaints;
Platform Admin queues/details/forms. Nine templates use existing HSM spacing/radius/
color tokens. Submit/upload and pagination feedback remain progress controls where
skeleton replacement would obscure an operation already in progress.

Owner core organization/hostel/branch/dashboard reads coordinate; notifications and
previous-period analytics do not block the group. Admin snapshot/activity data
coordinate and retain same-scope aggregate values on background refresh. Private
staff evidence/operational readers retain existing fail-closed masking. Discovery
keeps its header/search/hero in place and independently loads listings, university
and recent regions. Ancillary failures expose a scoped retry instead of replacing
available listings. Cached rows are not replaced merely because a background request
is fetching; authorization failures still invalidate protected data.

## Evidence

Mobile typecheck passes. Initial seven focused Native suites50 tests pass covering
all role interfaces, loading accessibility, reduced motion, cached-content behavior,
errors/empty states and existing action/navigation checks. Subsequent native-driver
transition checks are recorded separately. Logs: skeleton-focused-tests.log,
skeleton-transition-tests.log, skeleton-types-final.log. Replacement inventory:
.tools/reports/skeleton-integration-audit.json.

## Acceptance scope

Templates reserve known card/field/image regions; dynamic record count, font scaling,
remote media dimensions and text wrapping still need scenario-specific visual
acceptance. This report does not certify zero pixel shift for every possible record
or device, nor measured frame-rate benchmarks. Physical role coverage is constrained
by the existing authenticated account/catalogue; no live fixtures or credential
changes were introduced. API/Metro are restored for the connected Pixel. No APK
rebuild, migration, data reset, deployment or worker activation.

Final loading acceptance checkpoint: initial focused suites50/50 pass; subsequent
transition/dashboard suites22/22 pass; final Mobile types pass. Metro8081 and
API4000 restored, readiness200, authenticated Root dashboard rendered on Pixel.
Actual Hostel Branches card opens the standard back/search header; contextual
search reveals its field. Evidence: skeleton-mobile-final.png,
skeleton-branches-header.xml, skeleton-search-device.xml. Main app left running.
Mobile lint found one new assertion (fixed) plus8 existing errors in policy-form,
owner-attention-panel, owner-dashboard-hero and owner-dashboard test. Those unrelated
changes were preserved; workspace lint is not claimed green. No APK/data reset.
