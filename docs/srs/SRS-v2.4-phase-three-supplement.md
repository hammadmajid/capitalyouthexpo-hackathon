# SRS v2.4 supplement: residents, stays and hostel finance

Approved by the user's stabilization-to-Phase 3 master prompt (2026-10-17);
implementation started 2026-10-18 after P2-S1..S7 local gates passed. This is a
specification and migration note, not final acceptance evidence. Refs STAY-001..004,
RES-001..005, RENT-001..006, PAY-004..009, FIN-001..004, OUT-001..006, ACC-001..006.

## Scope

Phase 2 is FEATURE FROZEN / FINAL ACCEPTANCE DEFERRED. Phase 3 adds actual residency,
manual admissions, assignment history, transfers/extensions/checkout, agreed billing,
charges/ledger, external manual payments/allocations/receipts/deposits, operational
views, My Stay, reports and outbox events. No online gateway, platform-held funds,
automated bank verification/refunds, payroll, visitor, complaint or ERP expansion.

## Authoritative rules

- Booking confirmation is reservation, not actual occupancy. Check-in, transfer
  and checkout use scoped transactions, inventory locks/constraints, audit and
  outbox. A linked Customer has at most one active hostel. History is retained.
- Manual admissions may create a branch-local resident relationship without fake
  login credentials. Link an existing identity explicitly through authorized,
  verified context. Phone/email equality alone never merges accounts. This
  supersedes automatic walk-in matching/unclaimed-login wording in RES-002/003
  and the draft schema; existing accounts and historical records are retained.
- Owner controls operational policy and Manager grants. Fixed/anniversary monthly,
  weekly, fixed-period and term billing are controlled policy structures. Proration,
  rounding, late charges, notice and early-checkout treatment are explicit. Resolve
  effective policy and preserve the agreement/version; missing policy never invents
  a financial amount. Q3/Q9 resolve to this configurable framework, not one universal
  billing day or proration result. Booking-agreed prices/deposits remain protected.
- Controlled approved charge categories/catalogs extend the framework; unrestricted
  arbitrary charges remain forbidden (FIN-004). Issued financial amounts and
  allocations are corrected through explicit auditable adjustments/reversals.
- Record actual partial payments and excess credit without losing money. Integer
  bigint paisa and existing exact JSON conversions remain mandatory. Approved
  payment plus immutable receipt is required for Paid; a proof upload is not payment.
- Owner/authorized Manager may record external cash/direct payment under Q14.
  Payment void/reversal remains Owner-only. Deposits remain separate liabilities;
  refund obligations/externally recorded settlement do not imply HSM moves funds.
- Financial warnings do not erase management's disclosed-policy checkout authority
  (OUT-003/005). Release actual occupancy only when authoritative checkout commits;
  keep the final statement, debt/credit/refund state and past read-only history.
- One identity retains simultaneous capabilities. Live server authorization and
  actor/command-bound idempotency apply before mutations and successful replay.
  Managers never gain Owner-only customer booking document contents; CHG-008 and
  other current CNIC/encryption/masking/sensitive-access controls are preserved.

## Migration and verification

Preserve migrations 0000..0017. New data structures and constraints use additive,
Drizzle-generated 0018+ migrations; update schema/API/screen baselines in the same
change. No automatic phone/email merge, financial-history rewrite or hard deletion.
P3-1 includes generated additive migrations0018/0019 for resident/stay/history,
assignment and immutable billing-policy/agreement foundations. Real migration
execution remains unverified; admission and financial flows are still in progress.

Real PG/PostGIS/Redis/storage/scanning/worker/rollback/concurrency/browser acceptance,
clean migration replay/seed and exact-source CI are deferred to combined P2/P3
acceptance. Author real Testcontainers tests; mark NOT RUN LOCALLY until executed.
Physical phone testing is excluded as a blocker. No phase 100% or CI PASS claim.
