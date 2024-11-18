# API 01: Auth, Identity & Files

Conventions: [`../07-api-contract.md`](../07-api-contract.md). Rules: AUTH-C-_, AUTH-M-_, MGR-_, SEC-_, CHG-002, CHG-004, ADR 0002.

> CHG-006 and the SRS v2.1 supplement supersede the original registration/profile
> inputs below. They remain historical API implementation notes until the staged
> email → OTP → permanent password routes replace them; revised acceptance is open.

## Revised staged registration (CHG-006)

The revised flow uses the following PUBLIC routes under `/v1`. The legacy routes
below remain for existing clients during implementation; revised clients must use
staged registration. Profile and owner onboarding acceptance remains open.

| Method | Path                          | Purpose                                                                                                    |
| ------ | ----------------------------- | ---------------------------------------------------------------------------------------------------------- |
| POST   | `/auth/registration/start`    | Strict `{ email }`; constant 202 verification acknowledgement.                                             |
| POST   | `/auth/registration/verify`   | Strict `{ email, code }`; consume persisted email OTP.                                                     |
| POST   | `/auth/registration/password` | Strict `{ setupToken, password, client }`; complete permanent password and establish first normal session. |

Verification returns either `{ next: "password", setupToken, expiresIn: 600 }` or
`{ next: "login" }` for an existing permanent identity. The setup token is an
opaque, one-use password continuation, never an access or refresh token. Only its
purpose-separated HMAC is persisted. It expires after ten minutes; a replacement
proof retires earlier pending setup grants while retaining history. Clients keep
it in wizard memory, never in a URL or telemetry. Verification issues no session
cookies. Every staged route uses `Cache-Control: no-store`.

Start locks one email identity and uses the existing encrypted transactional OTP
outbox, resend cooldown, five-attempt policy and single-use verification. Start
and verification have opaque email rate buckets in addition to IP budgets.
Password completion locks the identity before its setup grant, rejects suspended,
unverified, expired, replayed or already-permanent identities, persists the Argon2id
password and consumes pending grants in one transaction. Session issuance follows
that commit and rechecks the password and verified email under the existing session
lock. If session issuance fails, the saved password can be used for normal login.

Web completion returns the existing safe session projection and protected cookies;
mobile completion returns access and rotated refresh credentials for SecureStore.
The new identity initially has no Customer/Owner capability until the corresponding
profile is completed. No DOB, CNIC, phone or initial password is accepted at email
start. Recovery requires an existing verified permanent identity and cannot bypass
the staged password boundary. Email acknowledgement does not disclose eligibility.

## Registration & email OTP (legacy implementation history)

| Method | Path                 | Scope  | Purpose                                                        | SRS                 |
| ------ | -------------------- | ------ | -------------------------------------------------------------- | ------------------- |
| POST   | `/auth/register`     | PUBLIC | Create an account; sends the email OTP                         | AUTH-C-001..004     |
| POST   | `/auth/email/verify` | PUBLIC | `{ email, code }`. Activates the account and returns a session | AUTH-C-002, CHG-002 |
| POST   | `/auth/email/resend` | PUBLIC | Resend the OTP (60 s cooldown)                                 | ADR 0002            |
| POST   | `/auth/claim`        | PUBLIC | Claim a walk-in identity: `{ email, code, password }` (D2)     | RES-002/003         |

`POST /auth/register` request:

```json
{
  "fullName": "Ali Khan",
  "email": "ali@example.com",
  "phone": "+923001234567",
  "password": "********",
  "gender": "male",
  "dateOfBirth": "2004-05-12",
  "cnic": "35202-1234567-1"
}
```

- CNIC is normalised to 13 digits, then hashed for uniqueness. Under-18 → `422 UNDERAGE` (AUTH-C-003).
- Duplicate email/phone/CNIC of an **active** user → `409 IDENTITY_EXISTS` (guide the user to login/recovery). Duplicate of an **unclaimed** walk-in → `409 IDENTITY_EXISTS_CLAIM_REQUIRED`.
- The response is always `202 { "verificationRequired": true }`, with no account details leaked.

## Login, sessions, passwords

CHG-006: login accepts verified email or Pakistani mobile in local (`03001234567`),
country-prefixed (`923001234567`) or E.164 (`+923001234567`) form. Mobile lookup
uses canonical `+923001234567`. Format validation does not prove phone ownership
and does not set phone verification. Email lookup remains case insensitive.

| Method | Path                    | Scope  | Purpose                                                                    | SRS        |
| ------ | ----------------------- | ------ | -------------------------------------------------------------------------- | ---------- |
| POST   | `/auth/login`           | PUBLIC | `{ identifier (email or phone), password, client: mobile\|web }` → session | AUTH-M-005 |
| POST   | `/auth/refresh`         | PUBLIC | Rotate the refresh token                                                   | SEC        |
| POST   | `/auth/logout`          | AUTH   | Revoke the current session                                                 | SEC        |
| POST   | `/auth/logout-all`      | AUTH   | Revoke all of the user's sessions                                          | SEC        |
| POST   | `/auth/password/forgot` | PUBLIC | `{ email }` → always `202` (no account enumeration)                        | ADR 0002   |
| POST   | `/auth/password/reset`  | PUBLIC | `{ email, code, newPassword }`; revokes all sessions                       | SEC        |
| POST   | `/auth/password/change` | AUTH   | `{ currentPassword, newPassword }`; revokes other sessions                 | SEC        |

Login response (web gets cookies instead of tokens in the body):

```json
{
  "accessToken": "…",
  "refreshToken": "…",
  "expiresIn": 600,
  "user": { "id": "…", "fullName": "Ali Khan", "emailVerified": true },
  "capabilities": {
    "customer": true,
    "owner": false,
    "managerOf": [{ "branchId": "…", "branchName": "F-8" }],
    "admin": null
  }
}
```

An unverified identity without an active manager assignment at login → `403 EMAIL_NOT_VERIFIED` (with the resend option). Suspended/banned → `403 ACCOUNT_SUSPENDED`.

## Manager activation (AUTH-M-001..006)

| Method | Path                     | Scope  | Purpose                                                                                                                                                              |
| ------ | ------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/auth/manager/activate` | PUBLIC | `{ phone, tempPassword, newPassword }`. Valid only within 24 h, single use, rate-limited. Sets the permanent password, sets assignment → `active`, returns a session |

Wrong or expired temp password → `401 INVALID_CREDENTIALS` (same message for both). After 5 failures the assignment is locked until the owner resets it.
CHG-006: public temporary activation is limited to a passwordless identity.
An existing permanent password is checked under the identity lock and cannot be
replaced through an invitation, even with the correct temporary credential.
Such requests fail generically without incrementing invitation attempts, granting
Manager capability or revoking the identity's devices. Existing identities must
accept through their own authenticated session as described below. New passwordless manager activation
retains expiry, five-attempt lockout, one-use consumption and device revocation.

## Authenticated manager acceptance (CHG-006)

`POST /me/manager-invitations/accept` is SELF-scoped and accepts only `{}`.
The pending assignment is resolved from the authenticated identity, never a
caller-selected user, phone, branch or invitation. Permanent authentication and
a live account/session are rechecked under the identity-first transaction lock.
Existing one-live-assignment policy, expiry, attempt limits and lock state apply;
archived branches, brands and organizations cannot grant capability.

Acceptance activates that assignment, retires temporary credential material and
writes a fixed hostel audit record in the same transaction. It preserves the
existing permanent password, devices, identity and other capabilities. Response
is a fresh safe /me projection, with no-store and no new credentials/cookies.
Cookie authentication requires refresh-bound CSRF. An absent invitation returns
opaque 404; an unusable own invitation returns 409. Concurrent acceptance grants
once; replay returns 409. No public Manager registration route is introduced.

## Revised Customer profile (CHG-006)

CHG-027 allows the Customer Profile endpoint to attach the caller's clean,
private avatar directly, including on multi-role accounts. The photo is shared
by the account identity. The endpoint still checks file ownership, purpose and scan status.

`PUT /me/customer-profile` is SELF-scoped and accepts strict
`{ fullName, phone, age, gender, institution?, profilePhotoFileId? }`. Verified
email and identity/session IDs come from the live authenticated identity. Adult
age is an editable integer in 18..120; it never infers or overwrites a historical
birth date. Initial completion collects no CNIC, DOB or emergency contact.
Existing name/gender corrections retain the controlled identity-correction flow;
completion fills missing identity fields and permits age/institution updates.

The transaction rechecks account/session liveness under the existing identity-first
lock, then requires a verified email and permanent password. Phone input uses the
shared Pakistani normalization contract. Changing the number clears its verification
status; format acceptance never verifies ownership or merges identities. Canonical
phone uniqueness conflicts return an opaque 409 without committing profile changes.

An optional photo must be uploader-owned in the configured private bucket, use the
avatar purpose and have clean scan status. Missing/foreign/wrong-purpose attachments
return an opaque 404; pending/rejected scans return 409. Existing private upload,
byte/MIME validation and worker scanning remain authoritative.

Profile persistence, first-completion timestamp and fixed private audit metadata
commit together. It adds Customer capability while retaining existing Owner,
Manager and Admin capabilities. The response is the existing safe `/me` projection
with `Cache-Control: no-store`. Web cookies require refresh-bound CSRF; mobile uses
the existing bearer transport. Real uniqueness/audit rollback and persisted logout
cases are mandatory in CI.

## Revised Owner profile (CHG-006)

`PUT /me/owner-profile` is SELF-scoped. Strict input requires fullName, canonical
Pakistani phone, CNIC, address,
agreementAccepted=true and agreementVersion=owner-foundation-v1. Organization name and profile
photo are optional. CHG-024 also makes cnicFrontFileId/cnicBackFileId optional;
when both are supplied they must be distinct. Omitted fields retain saved evidence.
Email/session identity comes from authentication. Bank data,
phone OTP and arbitrary identity IDs are rejected.

Under the identity-first transaction lock, completion requires a live session,
active account, verified email and permanent password. Existing name/CNIC
corrections require review. CNIC uses the existing authenticated encryption,
keyed uniqueness hash and masked projection. Plaintext CNIC is excluded from the
repository persistence input, audit and response. Owner correspondence address
is stored in ownerProfiles; historical Customer permanent address is preserved.

Any supplied document attachment must belong to the actor in the configured private
bucket with verification_document purpose and clean worker scan status. Optional
photos require the avatar purpose and the same ownership/privacy/scan checks.
Missing/foreign/wrong-purpose files return opaque 404; unready scans return 409.
Existing actual-byte validation, private storage and ClamAV checks remain required.

Identity, profile, original completion/acceptance timestamps, organization reuse
or creation, and fixed private audit metadata commit together. An existing live
organization is reused without rename; no organization or identity is duplicated.
Uniqueness conflicts roll back the entire update. Completion adds Owner capability
without removing Customer, Manager or Admin grants. It does not create a public
listing or approve verification. The safe /me response uses no-store; unsafe web
cookie requests require CSRF. Real transaction, concurrency, constraint rollback,
attachment isolation and persisted-revocation cases run in container CI.

## My account (`/me`)

| Method    | Path                           | Scope | Purpose                                                                    | SRS                    |
| --------- | ------------------------------ | ----- | -------------------------------------------------------------------------- | ---------------------- |
| GET       | `/me`                          | SELF  | Profile, masked CNIC (`cnicLast4`), capabilities                           | AUTH-C                 |
| PATCH     | `/me`                          | SELF  | Non-identity fields only: profile photo, university/employer, desired area | p.8                    |
| PUT       | `/me/permanent-address`        | SELF  | Required before booking                                                    | AUTH-C-005             |
| POST      | `/me/identity-change-requests` | SELF  | Controlled CNIC/name/DOB correction, reviewed by Support admin             | p.8 profile correction |
| PUT       | `/me/email`                    | SELF  | Starts an email change (OTP sent to the new address)                       | ADR 0002               |
| GET       | `/me/sessions`                 | SELF  | Active devices                                                             | SEC                    |
| DELETE    | `/me/sessions/{sessionId}`     | SELF  | Revoke one device                                                          | SEC                    |
| POST      | `/me/push-tokens`              | SELF  | Register an Expo push token                                                | NTF                    |
| DELETE    | `/me/push-tokens/{token}`      | SELF  | Unregister                                                                 | NTF                    |
| GET / PUT | `/me/notification-preferences` | SELF  | Promotional opt-out only; transactional categories are locked on           | NTF-002                |
| POST      | `/me/deactivate`               | SELF  | Account deactivation request; transaction history is retained              | p.45 user deletion     |

Note: `fullName`, `cnic`, `dateOfBirth`, `gender` are **identity fields**. They are not editable via `PATCH /me` and **never editable by hostel management** (p.8).

## Files (see contract §8)

Phase 1 uploader-only routes return strict DTOs and opaque 404 for missing/foreign files. `POST /files/{fileId}/complete` accepts only an empty JSON object and returns 202 with the status DTO. It validates actual size/MIME and queues durable scanning; only the worker establishes clean status. `GET /files/{fileId}/download` returns `{ url, expiresAt }` for a clean uploader-owned snapshot after a transactional sensitive access audit. URLs expire in 60 seconds. Pending/rejected downloads return 409; provider outages return sanitized 503. All responses use no-store; unsafe cookie requests require CSRF. Domain attachment and non-uploader grants remain later-phase work (ADR 0011).

| Method | Path                       | Scope           | Purpose                                                                 |
| ------ | -------------------------- | --------------- | ----------------------------------------------------------------------- |
| POST   | `/files/uploads`           | AUTH            | Request a presigned upload `{ purpose, fileName, mimeType, sizeBytes }` |
| POST   | `/files/{fileId}/complete` | AUTH (uploader) | Confirm the upload → validation + scan                                  |
| GET    | `/files/{fileId}`          | AUTH (uploader) | Status `{ fileId, scanStatus, mimeType, sizeBytes }`                    |

Purpose → allowed types / max size: `avatar` jpg/png/webp ≤ 5 MB · `listing_photo` jpg/png/webp ≤ 5 MB · `payment_proof` jpg/png/pdf ≤ 10 MB · `resident_document`, `verification_document` jpg/png/pdf ≤ 10 MB · `chat_attachment`, `complaint_attachment` jpg/png/pdf ≤ 10 MB · `import` csv/xlsx ≤ 5 MB. Any new jpg/png/webp upload, whatever its purpose, is ≤ 5 MB; the mobile app resizes photos (longest side 1600 px) before upload. Stored listing photos up to 8 MB stay valid.

Avatar completion validates size and detected image type and returns `clean`
after recording the private snapshot. Other uploads use the scan queue (CHG-028).

### Phase 1 session transport

Web refresh sends an empty JSON object and the cookie credentials. POST requests
using cookie authentication, including refresh/logout/logout-all, must include
`X-CSRF-Token` matching the readable CSRF cookie. The server binds that value to the
refresh credential. Production/staging cookie names are `__Host-hsm_access`,
`__Host-hsm_refresh`, `__Host-hsm_csrf`; development/test omit `__Host-` for local HTTP.
Access and refresh cookies are HttpOnly; all use Path=/ and SameSite=Lax; deployed
cookies require Secure. Successful session responses are not cacheable. Web responses
omit bearer credentials. Mobile refresh sends `{ refreshToken }`; mobile responses
return access/refresh tokens for SecureStore. A body token combined with Cookie or
Authorization headers is rejected. Refresh must match the persisted client type.

Email verification accepts optional `client: mobile|web` (default `mobile` for the
existing `{ email, code }` contract). Web verification uses the same protected cookie
transport as login. Registration creates the identity, customer profile and encrypted
OTP outbox atomically. A reset consumes the purpose-bound OTP, updates the password
hash and revokes all active sessions in one transaction. Resend/cooldown and recovery
requests acknowledge generically without returning account details.

`GET /me` returns `{ user: { id, fullName, email, emailVerified, cnicLast4 }, capabilities }`.
Capabilities are simultaneous grants read from persisted records. Suspended/archived
assignments and inactive admin accounts do not grant access. The projection never
includes password hashes, full/encrypted CNIC, OTPs or refresh hashes. Responses use
`Cache-Control: no-store`. Startup requires all three existing authentication key settings;
there is no generated development signing-key fallback.

Manager activation accepts optional client: mobile|web (default mobile), clears the
hashed invitation and its expiry, sets the permanent password and revokes prior
devices in one transaction. Failed attempts commit before the generic error; the
fifth failure persists lockedAt. Phone-only login is supported for a live active
manager assignment in an unarchived branch/organization (AUTH-M-005), checked under
the identity lock. Grant/password changes between activation and session creation
prevent stale credentials from being issued. Capability authorization remains separate.

Auth requests have a Redis-backed IP budget (default 30/minute) and normalized
identifier budget per auth route (default 5/ten minutes). Configure through
AUTH_IP_RATE_LIMIT and AUTH_IDENTIFIER_RATE_LIMIT. Exceeded budgets return 429
with Retry-After; Redis unavailability fails closed with 503. Identifier keys are
HMACs, never raw email/phone. OTP and invitation persistence limits remain enforced.

Development/test OpenAPI includes strict auth body schemas and their defaults,
mobile/web response alternatives, bearer/cookie SELF security, CSRF header rules
and sanitized application/problem+json responses. Required/default fields derive
from shared Zod contracts; generated HTTP documentation is regression-tested.

### Phase 1 email delivery

Register/resend/forgot persist hashed OTPs and authenticated encrypted outbox envelopes
in the identity transaction, returning 202 without inline SMTP. The BullMQ worker
uses only a derived email key and renders verification/reset HTML and plain text.
Expired or invalid messages are rejected before SMTP; delivery failures retry at most
five times under database leases (ADR 0007). SMTP is at-least-once across process
failure; stable Message-ID does not guarantee exactly-once provider acceptance.
Mailpit is the compatible-container integration transport; deployed SMTP requires
paired credentials and verified TLS. See ci-verification.md for observed evidence.

### Phase 1 transactional in-app security notices

NTF-002/003: successful email verification and password reset/change enqueue fixed
in-app notices in the existing identity transaction. Jobs contain a template event
and operation UUID, with a recipient-bound dedupe key. The existing worker commits
one private notice with its outbox acknowledgement under a current lease (ADR 0012).
Notice content includes no identity details, credentials or arbitrary resource links;
transactional categories cannot be opted out. Inbox endpoints/screens remain later
work. Current LOCAL PASS / CI PASS / NOT RUN LOCALLY evidence is in STATUS.

CHG-006 phone aliases share the same canonical identifier quota before HMAC key
construction. Malformed requests still consume the existing IP budget; Redis
keys contain no raw email, phone or address. All existing cooldowns, thresholds,
retry metadata and fail-closed dependency behavior remain blocking.

### CHG-006 pending-registration safety

Password recovery requires both verified email and an existing permanent
password. Eligibility is checked again when consuming a reset OTP; public request
acknowledgements remain identical for ineligible and unknown identities. Recovery
cannot substitute for the required initial password setup. Signup resend remains
available to a verified passwordless pending identity, with the existing cooldown,
expiry, attempt limit and one-time consumption unchanged. Legacy email verification
cannot create a normal session for a passwordless identity and rechecks verification
under the session identity lock. These guards prepare the revised staged flow;
the staged registration routes remain unfinished.

The revised verification result contract is strict: a pending identity receives
next=password with an opaque 43-character setupToken and expiresIn=600; an
existing permanent identity receives next=login. Neither variant can contain
access/refresh credentials or a user ID. This verifies the response boundary;
new staged registration HTTP routes are not wired yet.

Shared-client transport (AUTH-C, CHG-006, SEC-001): mobile calls to registration
start, verify and password setup are public authentication requests. They do not
read the credential vault or attach an existing access bearer. The exact public
path list retains protected mutation authorization and existing cookie/CSRF rules.

## Private resumable profile details (AUTH-C, CHG-006)

`GET /v1/me/profile-details` is SELF-scoped and uses the authenticated actor; it
accepts no target-user identifier. The repository rechecks active account and live
session under the existing identity-first transaction lock before selecting edit
fields. A value-free `sensitive_access_log` entry is appended in the same
transaction before returning private details; audit failure prevents the read.
Responses use `Cache-Control: no-store` for cookie and bearer transport.

The strict projection contains userId, fullName, email, emailVerified, canonical
phone, gender, masked cnicLast4, optional private profilePhotoFileId and nullable
Customer/Owner details. Customer details contain nullable adult age, institution
and completion state. Owner details contain address, private front/back file IDs,
agreement version/acceptance timestamp and completion state. No password/setup/
session secrets, plaintext CNIC, crypto material, signed URLs or historical birth
date are returned. File IDs do not grant storage access; existing protected file
ownership and clean-scan rules remain required on reads/mutations. Clients may
prefill ordinary fields; CNIC remains masked and must be re-entered for Owner save.
This endpoint grants no new capability. Profile updates use the existing strict
PUT routes and preserve identity-correction review and editable age behavior.

Earlier pending-registration checkpoint statements saying the staged routes are
not yet wired are superseded by the current staged-registration section above.
Current verification evidence and outstanding client prefilling are in STATUS.

## Phone-only Manager email association (AUTH-M, CHG-006, ADR 0025)

| Method | SELF path                      | Strict body                  | Result                   |
| ------ | ------------------------------ | ---------------------------- | ------------------------ |
| POST   | `/auth/email/associate`        | `{ email, currentPassword }` | 202 `{ accepted: true }` |
| POST   | `/auth/email/associate/verify` | `{ email, code }`            | 200 strict self profile  |

Both require existing live credentials, cookie CSRF where applicable, no-store
responses and opaque IP/normalized-email quotas. The request requires a permanent
password, no current email and a live active Manager assignment with unarchived
parents. It never binds email early. Claimed email and cooldown have the same
acknowledgement; no existing account is merged or modified. Verification rechecks
eligibility and latest actor/target/purpose-bound persisted proof, expiry, attempt
limit and one-use consumption. Wrong proof attempts persist. Binding, verification,
OTP consumption, notification and safe platform audit are atomic; an email unique
collision or audit failure cannot partially update identity. Password, phone
verification, capabilities and live sessions are preserved; no credentials/cookies
are issued. See ADR 0025 for concurrency and migration details.

Clients keep email-step state, password and code in form memory only. Password
input is removed after request acknowledgement. Restart clears proof fields.
After uncertain verification, authenticated `GET /me` can reconcile only the
same user and verified target email. A fresh successful profile makes the existing
Customer/Owner completion entries available without another account.

CHG-059: both self-profile PUT inputs accept `profilePhotoFileId: null` to unlink
the current avatar on Save. Omitting it preserves the existing reference. A UUID
still requires the authenticated uploader's clean avatar. Retain underlying files,
review records and audited profile saves; all existing identity/session guards apply.
