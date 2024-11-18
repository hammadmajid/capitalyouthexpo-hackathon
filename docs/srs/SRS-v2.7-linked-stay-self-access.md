# SRS v2.7 supplement: linked Stay self-read capability

Clarification of the user-approved Phase3 relationship/capability framework
(CHG-009, master prompt§47), RES-001/003, SEC-003 and ACC-004. This records the
read-authorization change before controller activation. Implementation and real
acceptance remain pending in STATUS.md.

## Relationship-based own reads

A live authenticated account may read current and historical Stays explicitly
linked through stays.userId to that same authenticated account. A separate
Customer profile is not a prerequisite for these own-Stay reads. An Owner or
Manager may also be a resident without being converted into another login role
or forced to create an unrelated Customer profile just to read that relationship.

Collections always filter by the live actor's user ID; detail requires both that
user ID and the exact Stay ID. Foreign and unlinked manual relationships return
404, including when the caller owns/manages their hostel through a separate staff
capability. Never infer the link from a name, phone or email. Creating/linking the
relationship remains a separate authorized, verified workflow.

Retain normal authentication, immediate account/session rejection and transaction
actor validation. Staff branch reads still require the existing owning Owner or
live stay_manage grant. Own reads do not grant staff permissions, lifecycle
mutations, payment/reversal authority or Owner-only booking document contents.
The existing Customer-profile and eligibility requirements for Customer booking
and profile operations remain unchanged. No public marketplace data is widened.

## Migration note

Use existing self-authenticated metadata and exact repository ownership checks for
only the two own-Stay read routes. Keep paths, operation IDs, DTOs and history;
no physical migration, new role, guessed identity link, data backfill or Customer
profile creation is needed. Do not activate the dormant generic StayGuard as a
shortcut for future mutations. UI experience availability must follow the actual
relationship; completing that navigation remains part of Phase3 implementation.
