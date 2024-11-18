# SRS v2.22 — authorized stay operational reads

User property lifecycle master: BED-002 / RES-004 / RES-005 / PAY-008 / RENT-004.
Existing stay_manage scope may read an exact stay's current approved resident profile
photo via a private, sensitive-audited, short-lived URL. The linked resident may read
only their own exact stay. Unlinked walk-ins and absent/unclean photos use the standard
avatar. No public endpoint or new identity/financial grant is introduced. Current user
profile-photo pointers remain governed by the existing moderation workflow.

Bed details expose actual hostel/branch/building/floor context; absent physical
locations are explicit nulls. Vacant-bed admission reuses the existing transactional
manual admission and all stay/rent/finance grants, preselecting the exact bed.
Financial settlement reads optionally include the latest committed non-reversed
receipt-backed payment and earliest future/current unpaid issued invoice due date.
They do not invent future invoices, change settlement arithmetic or rewrite frozen
checkout statements. Existing snapshots without these additive fields remain valid.

A single Pakistan-day timer and foreground recovery invalidate affected cached reads.
Server calculations determine debt/overdue state. Admissions, approved payments and
lifecycle actions invalidate current/history/financial/dashboard queries using shared
actor/branch keys. No polling loop, additional financial write or new migration.
Android acceptance remains required and is not certified by these source changes.

Original agreement history uses bounded descending version pages with an exact version
continuation; earlier versions and their acknowledgement/file associations remain
accessible after more than50 versions. Every page rechecks branch/self authority.
