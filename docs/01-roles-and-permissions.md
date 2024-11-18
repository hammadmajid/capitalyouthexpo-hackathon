# 01: Roles & Permissions

Security-critical. Every row here is an **API authorisation requirement**, not a UI preference (SRS p.49). **Default deny.**

Current client direction: every capability below is supported by the future mobile and
web clients through the same backend. The App column records the initial planning
split and is superseded by CHG-005 / ADR 0006. Phase 1 builds shared authentication
and shells only; the permission matrix remains authoritative.

## Roles (p.6, p.41)

| Role           | App         | Scope                                                                                                |
| -------------- | ----------- | ---------------------------------------------------------------------------------------------------- |
| Guest          | Mobile      | Public marketplace only, no login                                                                    |
| Customer       | Mobile      | Own profile, bookings, chats, visits                                                                 |
| Resident       | Mobile      | A Customer with an active `ResidentStay`. Not a separate login. Max **1 Active Hostel**              |
| Hostel Owner   | Web         | All owned brands/branches + combined "All Branches" view                                             |
| Branch Manager | Web         | **Exactly one** assigned branch (MVP). Multiple managers per branch allowed                          |
| Root Admin     | Web (admin) | Full platform authority. **Min 1, max 3** accounts                                                   |
| Normal Admin   | Web (admin) | One or more of: Verification, Subscription/Billing, Support, Content Moderator. No "all access" role |

One person = one identity with many roles (e.g. Customer + Owner). Never create duplicate accounts (p.6, p.9).

## Permissions matrix (p.49)

| Capability                    | Customer/Resident | Owner                      | Branch Manager              | Platform Admin              |
| ----------------------------- | ----------------- | -------------------------- | --------------------------- | --------------------------- |
| Browse marketplace            | Yes               | Yes                        | Yes                         | Yes                         |
| Book / visit / chat           | Yes               | As customer                | As customer                 | No operational booking      |
| See resident-to-seat identity | Own stay only     | All owned branches         | Assigned branch             | Restricted                  |
| Create rooms/seats            | No                | Yes                        | Assigned branch             | No direct edit              |
| Approve bookings              | No                | Yes                        | Assigned branch             | No                          |
| Approve rent payment proof    | No                | Yes                        | Assigned branch             | No                          |
| Combined branch view          | No                | Yes                        | No                          | Aggregate/admin views       |
| Appoint/suspend/fire Manager  | No                | Yes                        | **No**                      | No                          |
| Subscription                  | No                | View/pay                   | No                          | Billing/Root                |
| Approve hostel listing        | No                | No                         | No                          | Verification Admin          |
| Edit approved hostel details  | No                | Yes, re-verified (CHG-041) | No                          | Verification Admin approves |
| Raise complaint               | Active resident   | View/manage                | View/manage                 | Not arbiter                 |
| CNIC / sensitive docs         | Own               | Authorised                 | Assigned branch, authorised | Root/restricted, need-based |
| Ownership transfer / settings | No                | Yes                        | No                          | No                          |
| Cross-branch analytics        | No                | Yes                        | No                          | Aggregate                   |

## Manager rules (p.9–10, p.37)

- Appointed **only by the Owner** (Staff & Permissions): mobile number + one branch.
- 24-hour **single-use** temporary password (Owner-set or system-generated), hashed, rate-limited, never shown again.
- First login: mobile + temp password, then they **must** set a permanent password. Later logins: mobile + permanent password.
- If the mobile already belongs to a customer, attach the Manager role to that identity.
- Cannot self-assign, change branch, promote self, or appoint/fire other managers.
- **Suspend** = reversible. **Fire/Deactivate** = assignment ends; regaining access needs a new appointment.
- On suspend/fire: **sessions revoked immediately**, and in-flight protected calls fail.
- Historic records still show which Manager approved what (no anonymising).
- Manager dashboard never shows other branches, owner-wide finance or subscription data.
- Manager global search is scoped to the assigned branch **before** matching.

## Platform admin rules (p.41–42)

- Normal admins **cannot** create, remove, promote or modify Root Admins.
- A 4th Root Admin is rejected; the last Root Admin cannot be removed.
- A phone number alone never grants Root authority.
- Admin states: Invited, Active, Suspended, Deactivated.
- **No impersonation** of customers or hostels in MVP.
- Admins **do not edit** hostel rooms, rent or deposit. They request changes or change listing state.
- Admins do not normally read private chat. Only reported/safety cases, authorised and audited.
- Root step-up MFA: architecture-ready, may come after MVP.

## Privacy boundaries (p.45)

| Data                              | Marketplace             | Owner / Manager               | Platform                        |
| --------------------------------- | ----------------------- | ----------------------------- | ------------------------------- |
| Resident identity                 | Never                   | Owner + assigned Manager      | Restricted, Root when justified |
| Rent payment state                | Never                   | Internal Rent Board           | Aggregate / authorised support  |
| CNIC, permanent address, guardian | Never                   | Authorised operational access | Highly restricted               |
| Private chat                      | Participants            | Branch participants           | Reported/safety only            |
| Seat availability                 | Available/occupied only | Full occupancy mapping        | Aggregate / verification        |

## Implementation rules (p.7, p.44)

- Every read/write on Branch, Room, Seat, ResidentStay, Invoice, Payment, Complaint checks that the actor is authorised **for that branch**.
- Combined owner views may aggregate, but any mutation must bind to a concrete branch.
- An expired-subscription branch rejects mutations on the **backend**.
- Notification deep links resolve only to resources the recipient can access.
- Exports contain only the requester's authorised data.

## CHG-008: Booking-document access before confirmation

The owning hostel Owner alone may view customer-submitted private booking
documents before confirmation. Managers see verification status only; an inventory
`document_review` grant cannot authorize content access at this stage. Backend
branch/object checks, clean private files, live sessions and sensitive-read audit
remain mandatory. Document contents can include printed CNIC/address details; the exception does
not expose separate stored CNIC/address profile fields or private-chat resources. Existing post-approval rules remain unchanged.
See [SRS v2.3](srs/SRS-v2.3-booking-document-access.md) and ADR 0028.

## Current Phase3 relationship and grant revisions (CHG-009..012)

See [SRS v2.5](srs/SRS-v2.5-phase-three-permissions.md) and
[SRS v2.7](srs/SRS-v2.7-linked-stay-self-access.md); STATUS.md records rollout.
Resident is an explicit Stay/account relationship, not a login role. Own reads
bind stays.userId to the live actor, including an Owner/Manager's own relationship;
the scoped Customer-profile prerequisite fix is applied, with full current
verification pending. Foreign/unlinked own-read
IDs remain404, and Customer booking/profile eligibility is unchanged.

CHG-051 / SRS v2.35 adds current active manual-resident linking on Customer profile
save: a unique verified-email match links directly; phone-only matching requires
approval by branch staff with `stay_manage`. Pending requests grant no private
access. Approval rechecks active residency and matching contacts; checkout prevents
approval. Own reads still require the persisted exact account link.

Staff Stay reads require stay_manage. Manager financial writes require their
explicit operation grant and finance_view; manual terms additionally require
stay and rent authority. Policy/catalog configuration, payment reversal and
Owner-initiated termination remain Owner-only. Checkout authority alone does not
authorize fund moves. Finance visibility does not grant the operational Stay
directory. Superseded by CHG-029 (2026-11-14): an activated Manager receives every
branch operation permission automatically; Owner-only actions above stay Owner-only.
Managers activated earlier keep their saved grants. Every command
retains live branch/object checks, idempotency, audit and its lifecycle constraints.

CHG-008's Owner-only pre-confirmation document content remains unchanged. No
contact-based identity merge, public resident/rent data, online money movement
or platform-held funds is introduced. Subscription/Billing permissions in the
original planning matrix remain deferred under CHG-003.

Phase3 catalogue configuration (CHG-014 / SRS v2.9; implementation/acceptance pending): owning Owner creates/archives immutable approved charge catalogue entries. Active assigned Manager reads require explicit finance_view; no Manager grant enables catalogue mutation. Replay rechecks current authority and exact child scope. Public/Customer discovery and private booking-document permissions are unchanged.

WAIT-001 expected-vacancy publication uses the existing listing configuration
boundary: the owning Owner or active assigned Manager with `listing_edit` can
publish/clear an exact room-type estimate. Assigned staff may read its current
version. Each write/replay checks the live session, branch hierarchy, exact active
type and current grant; audit is transactional. No grant or historical permission
is backfilled. Real Manager grant-revocation/replay denial passes in the Phase3
waiting-list acceptance fixture; broader phase acceptance remains pending.

HMA-015 / CHG-022: legal-name/CNIC review is Root-only; photo review is Root or
content_moderator. Self-review and every Admin-linked subject are denied. Verified,
password-enabled ordinary subjects submit/cancel their own pending requests; staff
legacy-avatar cases cannot be cancelled by the subject. Private details/evidence need
an audited purpose. See docs/srs/SRS-v2.18-profile-reviews.md. Feature defaults off.

CHG-023 / HMA-017: operational explorer directories and audited metadata profiles are
Root-only. No contacts, identity documents, resident names, complaint contents or
payment evidence. Booking and rent decisions remain branch-scoped; Root payment and
occupancy access is aggregate only. See SRS-v2.19-admin-explorer.md.

## CHG-039: Staff and salaries

| Action                                                                | Owner           | Manager                                 | Platform Admin        | Customer |
| --------------------------------------------------------------------- | --------------- | --------------------------------------- | --------------------- | -------- |
| Staff directory, add, edit, deactivate                                | ✅ own branches | `staff_manage`                          | ❌                    | ❌       |
| Salary terms, salaries, record/reverse payments, agreements and scans | ✅ own branches | `staff_manage` + `staff_payroll_manage` | ❌                    | ❌       |
| Active staff count on hostel/branch explorer                          | —               | —                                       | ✅ Root explorer only | ❌       |

Both Manager grants are off by default, are not part of the CHG-029 automatic grant, and
only the owning Owner turns them on (Team → Staff / Salaries). Staff are never users, never
Managers and never matched to accounts. Without payroll access the server returns no
amounts, payments, agreement text or files.
