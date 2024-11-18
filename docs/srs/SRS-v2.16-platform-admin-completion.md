# SRS v2.16 supplement — Platform administration completion

User-directed 2026-10-30 Phase 3–6 master implementation request. Refs ADM-001..010,
TRUST-001..004, REV-006, COMM-002, SEC-001/003, AUD-001..004, RPT-001/003/004,
CHG-003/005/006/016; HMA-006..018. This supplement records implementation/privacy
boundaries for existing SRS administrative capabilities; it does not authorize
impersonation, financial operations, SMS, subscriptions or external push.

## Authority and private evidence

- Root has every implemented authorized Admin module without Customer onboarding.
  Normal roles remain verification, support and content_moderator; no all-access role.
- Verification staff review a concrete branch's current dossier, bounded pricing/photo
  metadata and decision history. The reader identifies current records honestly; it
  must not claim an immutable submitted snapshot/diff where none was persisted.
- Explicit purpose-bound document access is limited to the currently attached Owner
  verification documents and clean, nonarchived listing photos for the exact reviewed
  branch. Recheck live role/session, object association, private bucket and clean scan.
  Audit disclosure transactionally; audit failure returns no signed link. Never return
  raw keys, full stored CNIC, unrelated uploads or resident/booking evidence.
- Reviewer/history DTOs disclose names and decision metadata, not credentials/contact
  identifiers. Private listing review does not make evidence public.
- Existing reported-chat context stays case-bound, purpose-required, bounded and audited;
  no staff impersonation or global conversation enumeration.

## Decisions and notices

Verification commands may bind the expected current status/update timestamp to reject
stale dossier decisions. Existing state transitions remain authoritative. The persisted
decision, append-only audit and one logical Owner notice/outbox operation commit together;
replay uses the original decision event identity and must not duplicate the notice.
Review report-linked moderation must lock and match the exact review and actionable
case before writing the decision; a foreign/closed case cannot be attached by guessed ID.

## Readers, governance and clients

Bound every operational list/thread/history with validated stable continuation and live
authorization per page. Participant support readers exclude internal notes before paging.
Root platform aggregates use actual SQL sources and explicit date/snapshot semantics;
uncollected searches/views and deferred commercial metrics stay unavailable.
Root audit browsing is metadata-only by default; raw before/after, IP/user-agent and
private payloads are not a generic JSON viewer. Any permitted report export must be
bounded, authorized and redacted under RPT-001.
Customer moderation cannot target the current actor or any Admin-linked identity;
Root membership management remains the sole existing Admin authority lifecycle.
Institution writes require a meaningful 8–500 character reason and expectedRevision.
Material approved identity/alias/location edits require explicit Root reapproval or
withdrawal; unchanged approved identity preserves prior approval authority. The existing
append-only audit records allowlisted previous/updated fields, actor, time, reason and
revision. Name, short name, city/area, address, coordinates and aliases are material.
Customer enforcement excludes Admin-linked identities, Owners and active Managers.
Suspend/ban revoke sessions; reinstatement requires fresh login and never resurrects
revoked sessions. Generic in-app notices contain no private decision reasons.
Identity correction/photo/reference governance requires durable audited state and may
not be simulated by labels or direct contact/profile rewrites.

The approved minimal Root landing stays unchanged: HSM and one compact top-right
Admin management entry. Operational modules live inside the management workspace.

## Migration and rollout note

Existing account/membership, Owner, financial and file histories are preserved.
Reader/SDK/OpenAPI additions and the new notification template roll out together.
No live database migration, seed, Root/contact change or grant backfill is authorized.
The latest directive prohibits generating additional migrations. Existing migration 0062 is tested only in disposable environments
and requires separate approval before applying to the development database. Historical
missing submission snapshots cannot be backfilled by inference. Device testing and APK
builds require separate authorization, including at the final source gate. This document is not acceptance evidence.
