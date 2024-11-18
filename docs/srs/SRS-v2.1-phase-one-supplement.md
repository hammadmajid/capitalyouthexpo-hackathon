# Revised Phase 1 product specification (SRS v2.1 supplement)

Approved by the user on 2026-10-10 through the revised Phase 1 completion prompt.
Refs: AUTH-C-001..004, AUTH-M, OWN-001, MGR-004, SEC-001, SEC-003, ACC-002, ACC-006.
This supplement supersedes conflicting v2.0 registration/profile and Phase 1 scope
requirements. Unchanged v2.0 rules and recorded deviations remain authoritative.
This document describes requirements, not a claim of implementation or verification.

## Identity and credential flow

Retain one identity with simultaneous Customer, Owner, Manager and Admin capabilities.
Email-first registration is email -> persisted email OTP -> verified, bounded
password-setup authorization -> password creation -> experience selection. No
normal access/refresh session may be issued before permanent password creation.
Verification/setup authorization must be purpose-separated, expire, be single-use
and resist replay; it must never authorize ordinary protected endpoints. Existing
OTP limits, resend cooldown, outbox and password/session primitives remain required.

Login accepts verified email or a format-valid Pakistani mobile number and password.
Normalize 03001234567, 923001234567 and +923001234567 to +923001234567. A canonical
phone is unique but is not proof of ownership. Do not set phoneVerifiedAt merely
because input was accepted. Recovery remains verified-email based; no SMS recovery.
Web retains HttpOnly cookies and CSRF; mobile retains device-only SecureStore.

## Profiles and experiences

Customer profile requires full name, verified email, canonical phone, editable
integer age and gender. Age remains adult-only (18..120); do not infer birth date.
University/institute and validated private profile photo are optional. Do not ask
for birth date, emergency contact or CNIC at initial customer profile completion.
Existing historical birth dates are retained without conversion or public exposure.
Customer CNIC collection moves to future booking-confirmation KYC; its encryption,
purpose-separated HMAC and masking helpers remain intact.

Owner profile requires name, verified email, canonical phone, CNIC number, scanned
private CNIC front/back files, address and versioned owner agreement acceptance.
Organization name and profile photo are optional. Bank/payment data and phone OTP
are excluded. Validated file ownership, byte/MIME/size checks and scan state are
required; references must not grant access to another identity's documents.

Customer and Owner are additive capabilities, not permanent mutually exclusive
account types. Experience preference is presentation only; every restoration,
route and switch must be validated against fresh backend capabilities. Completing
an owner profile must not revoke an existing customer capability.

## Owner, hostel and branch foundation

Reuse organizations -> brands -> branches. Extend these models only when needed;
never introduce a parallel hostel identity/property hierarchy. Support owner
profile -> hostel basics -> main branch -> self-management or optional manager
invitation -> verification submission. Permit incomplete draft saving. Validate
geographic city/area ownership and PostGIS coordinates server-side. Foundation
fields include hostel name/category/description/contact and validated photos;
main branch name/city/area/address/location/contact and optional landmark.

Use equivalent existing verification states where possible. Draft/incomplete,
pending review, changes requested, approved, suspended and archived semantics must
be explicit. Public content requires approval and live, unarchived parents; owner
submission never approves itself. No inventory, booking, payment or resident engine.

Managers have no public registration. Only an authorized owner of the target live
branch may invite by name and canonical phone. Support secure generated or
policy-valid manually supplied temporary passwords at the issuance boundary;
store only hashes. Preserve expiry, attempt limits, one-time activation and forced
permanent password creation before operational access. Suspension/deactivation
revokes immediately; reinstatement does not resurrect sessions. Keep history.

## Client entry and routing

Mobile starts at session restoration, then authenticated experience or Login.
A technical loading state is permitted. Web opens a guest-accessible marketplace
shell containing only actual supported public content; never invent availability
or prices. Login/registration preserve a validated same-origin return path.
Reject external, protocol-relative, encoded bypass and authentication-loop paths.
Authorize the destination again after login; a return path never grants scope.

Final splash and two onboarding screens deferred to pre-launch UI polish.
Navigation must allow later insertion without rewriting authentication.

## Engineering, privacy and acceptance

Preserve migrations 0000..0004 byte-for-byte. Generate additive migration 0005+
only after schema audit. Document each data change and preserve historical rows.
Business/domain coverage remains >=90% lines and >=85% branches; preserve stricter
existing thresholds and demonstrate >=80% aggregate coverage. Testcontainers and
all seven real Android/API scenarios remain mandatory, without mocks or skips.

Complete API, worker, database/PostGIS, Redis, storage, scanner, email and web
connectivity must also be verified as a containerized application stack. Ubuntu
CI is an acceptable authoritative environment; Docker Desktop is not required.
Structured logs, SDK envelopes and browser/native test artifacts must exclude
credentials, OTPs, CNIC, private documents and raw entered form values. Use fixed
step/route identifiers and error categories. Telemetry failure cannot change auth.
Keep the existing exact, expiring dependency exceptions without broadening them.

Tasks remain numbered 1..13. Product acceptance in Tasks 7, 11 and 12 is reopened;
verified foundations remain historical evidence. Final completion requires all
revised product tests, native scenarios, coverage/security/complete-stack gates
and an overall green GitHub Actions run for the exact final commit. Do not merge
PR #1 automatically. Phase 2 remains deferred except the expressly approved
minimal owner/hostel/main-branch/invitation foundations described here.

## Initial schema audit and implementation delta

| Existing foundation                                                                         | Required change                                                                                                                                        |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| users has nullable password/email verification, protected CNIC and historical DOB           | Preserve columns/helpers; provisional identities must not receive operational sessions before password setup. Do not derive DOB/age.                   |
| customer_profiles has institution/photo references through users, no age                    | Add bounded editable age and explicit profile completion validation. Keep historical fields for compatibility.                                         |
| organizations/brands establish owner relationships                                          | Add owner-profile completion/document/agreement metadata; resolve ownership from authenticated identity.                                               |
| branches already has category, geography, contact, description, isPrimary and review states | Reuse states: draft/submitted/under_review/changes_requested/approved/suspended plus archivedAt. Extend minimum draft setup metadata only as required. |
| manager_assignments has hashed temporary password, expiry, attempts and history             | Add owner-only invitation/issuance boundary; reuse activation/revocation. No public manager creation.                                                  |
| files has private verification_document purpose, uploader and scan status                   | Reuse for CNIC front/back; transactional references require owned clean files.                                                                         |
| email_otps and notification_outbox are transactionally coupled                              | Reuse cooldown/expiry/attempt/consumption and delivery for staged registration; add purpose-separated setup authorization without operational access.  |
| capability projection derives Customer from profile, Owner from live organizations          | Extend completion/selection without exclusive account roles; retain manager/admin projections and archive filtering.                                   |

This audit is a delta, not an applied migration. Existing branch geography columns
are non-null; incomplete draft saves must be designed explicitly before changing
those constraints. Keep any approved/submitted branch completeness checks intact.
The existing live-manager uniqueness rule is unchanged by this prompt; no new
multiple-assignment business rule is inferred.

An owner invitation is never authority to reset an existing identity's password.
For an identity that already has permanent credentials, assignment acceptance must
require that identity's authenticated consent; temporary setup is scoped to new
credential-less manager identities. Preserve the existing identity and capabilities,
and never overwrite a customer/owner password merely from an owner-issued secret.

## Same-identity email association implementation note (AUTH-M, CHG-006)

An activated phone-only Manager can prove a previously unclaimed email on the
existing identity before completing Customer/Owner profiles. Require an active
permanent-password session, current password and a persisted email OTP; never
merge with a claimed-email identity. Preserve credentials, branch history and
phoneVerifiedAt. ADR 0025 defines the transaction and proof boundaries. This
implements the approved one-identity/verified-email requirement, not a general
email replacement or SMS verification flow. Migration note: reuse the existing
email_change enum and email uniqueness; no schema changes, backfill or rewritten
migration history.
