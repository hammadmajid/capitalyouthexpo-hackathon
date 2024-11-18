# Owner Profile refinement — 2026-11-01

OWN-001 / AUTH-C / SEC-003 / CHG-024. Continued existing work; no unrelated screen redesign.

## Implemented

- Reused AppHeader, NatureBackground, shared icy-card tokens and Owner controls.
  Compact header, circular frosted avatar/camera, outline field icons and clean form.
- Photo selection immediately copies a private app-cache preview into the circular
  avatar while upload/scan continues. Only that preview copy is deleted on removal
  or unmount. Existing picker validation, upload, ownership and clean-scan rules remain.
- Photo upload no longer disables form inputs. Save alone waits for an active photo
  operation so navigation cannot discard it. Moderated uploads automatically submit
  the existing review request; no extra submit button after success. Uncertain review
  responses retain the same request/key and show Retry only when needed.
- Photo is not required. Local draft removal restores the saved photo. Approved-photo
  self-removal is not supported by the existing API; no fake removal was added.
- Removed Identity Documents and upload controls from Owner Profile. Per the user's
  follow-up, CNIC-photo references are optional. CNIC number, legal identity, verified
  email, agreement, permission checks and all supplied-file checks remain mandatory.
- Missing photo IDs never clear historical evidence. Drizzle migration 0064 contains
  only two DROP NOT NULL statements; tested in disposable Postgres then applied to
  the existing local DB after explicit scoped discussion/user delegation. No reset,
  seed, production change or record deletion. API restarted; storage ADB port 9000 restored.
- Save now names invalid fields and shows inline validation; drafts survive failures.
  Actual reported failure was a two-character address, below the existing minimum.

## Changed files

- Mobile: owner-profile-flow.tsx, owner-profile-ui.tsx, owner-profile-photo.tsx,
  owner-photo-preview.ts, lib/owner-profile-error.ts, lib/private-file.ts,
  lib/owner-profile.ts and focused component/unit fixtures.
- API: auth/owner-profile.service.ts, owner-profile.repository.ts,
  profile-details.documentation.ts; management/hostel-setup.scope.ts null guard;
  focused service/repository/security/integration tests.
- Shared: contracts/onboarding.ts, profile-details.ts; DB schema/onboarding.ts,
  migrations/0064_owner_cnic_photos_optional.sql and generated snapshot/journal;
  regenerated API client types. Web profile adapter/null handling updated for compatibility.
- Documentation: SRS v2.20 / CHG-024, API/screen inventory and STATUS checkpoint.

## Verification

- 37 Native component tests across Owner form/photo/private picker/payment-proof
  suites pass. This includes instant preview before upload completion, continued
  field editing, automatic review, retained retry intent and specific address errors.
- 18 private-file adapter tests; 13 Mobile and 13 Web Owner adapter tests pass.
- 48 contract tests, 40 API profile tests, 22 hostel-setup authorization tests pass.
- Disposable DB onboarding: 9 tests pass. Real Owner API/Postgres: 10 tests pass,
  including no-photo completion and preserving old references on later edits.
- Mobile/Web typechecks passed; final Mobile check passed after the photo/editing
  fixes. API and client generation/build passed. Existing full Mobile lint remains
  red on 14 unrelated errors; the modified Owner files had no lint errors.
- Pixel actual before/after layout screenshots inspected. User subsequently saved
  successfully; actual Owner Dashboard showed Profile complete. No personal data
  was invented or entered by the agent. Final automatic photo/inline-error behavior
  has component coverage; populated final photo/scan/review states still need user
  acceptance on-device. User moved into hostel setup during final capture, so that
  capture is not claimed as Owner Profile verification.

## Screenshot evidence (local)

`.tools/reports/owner-profile-20261101/` contains real captures. `before-profile-*`
are the original Owner form; `after-profile-1/2` show the redesigned form but include
an upload failure from missing local storage forwarding (subsequently restored).
`save-error-current-1` contains private entered data and is not for public sharing.
`latest-current-1` confirms the user's successful Owner completion/dashboard.
Despite their filenames, `photo-picker*` show the app error, not the system picker;
`final-owner-profile-1` shows the user-navigated hostel setup, not Owner Profile.

## Remaining dependencies

- Malware scanning/moderation remain real asynchronous security gates; local preview
  does not mean public approval. Approved-photo self-removal needs an authorized API.
- Existing hostel setup still requires identity evidence and is not bypassed by
  optional profile photos. This follow-up did not relax property verification.
- Final populated photo, slow-scan and approved/rejected review acceptance on Pixel
  remains pending; no complete physical verification is claimed for those states.
