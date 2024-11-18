# ADR 0087: private versioned profile reviews

- Status: Implemented behind a default-off schema gate; rollout pending
- Date: 2026-10-31
- Requirements: HMA-015, ADM-008, SEC-003, CHG-022

## Context

Identity corrections and avatar moderation need durable private evidence, concurrent
decision protection and history. General audit metadata must not contain identity
documents or full CNIC. Development migration application is not authorized.

## Decision

Use dedicated typed request, evidence and immutable decision tables. Store proposed
CNIC encrypted with a separate HMAC index; compare domain-separated profile baselines.
Lock the subject before the request and atomically update profile, decision, audit,
sessions and notification. Database guards protect payload/history and require a
durable decision for each versioned transition. Use existing private uploads and
short-lived signed links with explicit audited purpose. Root reviews identities;
Root/content moderators review photos, excluding self and Admin-linked subjects.

Expose staff/self interfaces only behind PROFILE_REVIEWS_ENABLED and schema readiness.
The flag defaults off; self-profile capability metadata controls Web/Native entry.
Enabled legacy avatar editors accept only the current approved pointer.

## Consequences

Migration0063 was generated and tested only on disposable databases with explicit
user authorization. Development rollout needs separate coordination (also0062).
Private UI state is discarded on focus loss; idempotent commands preserve original
intent for explicit retry. Identity approval revokes sessions. Physical acceptance
and deployment remain pending; no historical approvals are reconstructed.

2026-10-31 rollout update: user separately authorized development0062/0063 application.
Both applied with backup, matching migration history, preserved existing data and
passing schema guards. Default-off activation and physical/deployed acceptance remain
separate gates; earlier disposable-only notes describe the original authorization.

Compatibility correction (2026-10-31): enabling additive profile metadata must not
break older strict mobile parsers. Current shared SDK advertises
`x-hsm-profile-reviews: 1`; API serialization preserves the legacy profile/login
shape for missing/unsupported opt-in and does not mutate stored/shared payloads.
The Web proxy forwards the header; authorization and CSRF remain unchanged.

Local activation checkpoint: enabled only in development after user continuation.
Non-watch API/Web start tasks avoid dependency-watch restart loops; readiness and
legacy/current client compatibility verified. Shared delivery/billing worker remains
stopped; new-upload processing and physical/deployed acceptance remain separate gates.
