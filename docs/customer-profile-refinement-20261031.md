# Customer profile refinement and navigation — 2026-10-31

Scope: user-directed Customer shortcut, Customer Profile UI/save error and successful
save destination. Other Admin improvements and Sign-In/Sign-Up redesign are paused
while the user reviews the Customer experience.

- Added an accessible icon next to Root Admin management for Customer switching.
  Reused same-identity mode/cache cleanup; existing Customers open marketplace,
  incomplete verified users open Customer completion, unverified users open Account.
- Captured and individually inspected actual before/after profile screenshots.
  Reused icy/emerald glass surface, shared header, compact identity summary, icon
  inputs, balanced gender controls, concise hints and stable saving feedback.
- Read-only investigation compared displayed input with saved identity: the entered
  name differed from an existing saved name. Backend identity-correction policy
  requires review, so saving the entire form conflicted. No raw personal details
  or credentials are copied into this report.
- Existing saved name/gender are read-only here; previously unset values remain
  editable for initial completion. Identity review/backend safeguards are preserved.
  Known conflicts and field validation now provide safe, useful guidance.
- Generic FlowForm gains opt-in input/error/submitting adapters and read-only fields;
  default behavior remains unchanged for other forms. Customer save keeps drafts
  until success and disables back while saving.
- Successful completion confirms the fresh server profile, remembers Customer mode
  and replaces the route with `/marketplace`, rather than generic `/account`.
  Root/Owner permissions are not removed or fabricated.

Verification: Customer/FlowForm14 tests pass; profile adapter/error22 unit tests pass;
strict Mobile typecheck passes after routing correction. Customer shortcut21 tests
passed separately. New saved-identity/conflict regressions first failed2/8, then pass.
A stale navigation expectation was updated after the requested route change.
Initial Vitest invocation hit duplicate coverage CLI options before executing tests;
corrected scoped invocation passes without changing repository coverage thresholds.

The user confirmed saving on-device. Afterwards the actual device hierarchy was
observed on Customer home (`Find Your Perfect Hostel`), and no generic Account
screen. An attempted automated re-save found no Save button because the device had
already left the form; this is not reported as an automated successful save action.
The current device retains its authenticated account. No sign-out, credential
extraction, schema migration, fake user, worker activation or APK rebuild occurred.

Evidence: `.tools/reports/customer-profile-20261031/before-customer-profile-1.png`,
`after-customer-profile-1.png`; component/unit/type logs have `customer-profile-*`
filenames. Screenshots contain private account contact data; keep them local.

Remaining: Sign-In/Sign-Up visual audit/refinement and real OTP journey have not
been completed. Guest auth routes require normal sign-out under existing route
guards; no bypass was introduced. User will enter test email/OTP/password on-device
when the authentication task resumes. Root name correction remains a separate
review-governed operation, not editable through Customer completion.
